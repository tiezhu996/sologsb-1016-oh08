import { computed, ref, watch } from 'vue'
import { cueSignature, localizationStatus, makeLocalization } from './localization'
import { sampleDocument } from './sample'
import type { Cue, CueKind, FrozenVersion, Language, LocalizationIssue, Scene, StudioDocument, StudioState, WarningItem } from './types'

const STORAGE_KEY = 'sologsb-1016-studio-v1'
const LANGUAGE_KEY = 'sologsb-1016-language-v1'
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

function migrateDocument(document: StudioDocument): StudioDocument {
  for (const scene of document.scenes ?? []) {
    for (const cue of scene.cues ?? []) {
      // 旧草稿升级：现有文本直接当作普通话版本，译配稿从空开始
      if (!cue.localizations) cue.localizations = {}
    }
  }
  return document
}

function loadState(): StudioState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as StudioState
      if (parsed.document?.scenes?.length) {
        migrateDocument(parsed.document)
        parsed.pending = (parsed.pending ?? []).map((change) => ({
          ...change,
          language: change.language ?? 'mandarin',
          before: migrateDocument(change.before),
          after: migrateDocument(change.after)
        }))
        parsed.frozen = (parsed.frozen ?? []).map((version) => ({ ...version, document: migrateDocument(version.document) }))
        return parsed
      }
    }
  } catch {
    // A corrupt local draft should not prevent access to the built-in example.
  }
  return {
    document: clone(sampleDocument),
    pending: [],
    frozen: [],
    updatedAt: new Date().toISOString()
  }
}

function loadLanguage(): Language {
  try {
    return localStorage.getItem(LANGUAGE_KEY) === 'cantonese' ? 'cantonese' : 'mandarin'
  } catch {
    return 'mandarin'
  }
}

/** 以 base 为底，把 localizationSource 里同 id 提示项的译配稿覆盖过来，其余内容保持 base 不变 */
function overlayLocalizations(base: StudioDocument, localizationSource: StudioDocument): StudioDocument {
  const next = clone(base)
  const sourceCues = new Map(localizationSource.scenes.flatMap((scene) => scene.cues.map((cue) => [cue.id, cue] as const)))
  for (const scene of next.scenes) {
    for (const cue of scene.cues) {
      const source = sourceCues.get(cue.id)
      cue.localizations = source?.localizations ? clone(source.localizations) : {}
    }
  }
  return next
}

export function useStudio() {
  const state = ref<StudioState>(loadState())
  const activeLanguage = ref<Language>(loadLanguage())
  const selectedSceneId = ref(state.value.document.scenes[0]?.id ?? '')
  const selectedCueId = ref('')
  const saveState = ref<'saved' | 'saving' | 'dirty'>('saved')
  const undoStack = ref<StudioDocument[]>([])
  const redoStack = ref<StudioDocument[]>([])
  let saveTimer: number | undefined

  const selectedScene = computed(() => state.value.document.scenes.find((scene) => scene.id === selectedSceneId.value) ?? state.value.document.scenes[0])

  function durationOfCue(cue: Cue): number {
    if (cue.manualDuration !== undefined) return cue.manualDuration
    if (cue.kind === 'sfx') {
      return state.value.document.soundEffects.find((effect) => effect.id === cue.soundEffectId)?.duration ?? 6
    }
    if (cue.kind === 'transition') return 3
    const pauses = (cue.text.match(/[，。！？；、…]/g)?.length ?? 0) * 0.22
    const effectiveRate = cue.rate || 1
    return Number((cue.text.length / (4.2 * effectiveRate) + pauses).toFixed(1))
  }

  function durationOfScene(scene: Scene): number {
    return Number(scene.cues.reduce((total, cue) => total + durationOfCue(cue), 0).toFixed(1))
  }

  const totalDuration = computed(() => state.value.document.scenes.reduce((total, scene) => total + durationOfScene(scene), 0))
  // 待确认记录跟着语言分开保存，这里只取当前语言队列
  const pendingChanges = computed(() => state.value.pending.filter((item) => item.status === 'pending' && item.language === activeLanguage.value))

  const localizationIssues = computed<LocalizationIssue[]>(() => {
    const issues: LocalizationIssue[] = []
    for (const scene of state.value.document.scenes) {
      for (const cue of scene.cues) {
        if (cue.kind !== 'dialogue') continue
        const status = localizationStatus(cue)
        if (status === 'ok') continue
        issues.push({
          id: `localization-${cue.id}`,
          sceneId: scene.id,
          cueId: cue.id,
          status,
          sceneCode: scene.code,
          characterName: state.value.document.characters.find((character) => character.id === cue.characterId)?.name ?? '未指定角色',
          sourceText: cue.text
        })
      }
    }
    return issues
  })
  const canFreeze = computed(() => localizationIssues.value.length === 0)

  const warnings = computed<WarningItem[]>(() => {
    const result: WarningItem[] = []
    for (const scene of state.value.document.scenes) {
      const actorRoles = new Map<string, string[]>()
      for (const cue of scene.cues) {
        if (cue.kind === 'dialogue' && cue.characterId) {
          const character = state.value.document.characters.find((item) => item.id === cue.characterId)
          if (character) {
            const roles = actorRoles.get(character.voiceActor) ?? []
            roles.push(character.name)
            actorRoles.set(character.voiceActor, roles)
          }
        }
        if (cue.kind === 'sfx' && cue.soundEffectId && !state.value.document.soundEffects.some((effect) => effect.id === cue.soundEffectId)) {
          result.push({
            id: `missing-${cue.id}`,
            type: 'missing-sfx',
            level: 'error',
            sceneId: scene.id,
            cueId: cue.id,
            title: `${scene.code} 音效引用缺失`,
            detail: `“${cue.text}”引用了不存在的音效 ${cue.soundEffectId}。`
          })
        }
      }
      actorRoles.forEach((roles, actor) => {
        const uniqueRoles = [...new Set(roles)]
        if (uniqueRoles.length > 1) {
          result.push({
            id: `collision-${scene.id}-${actor}`,
            type: 'collision',
            level: 'error',
            sceneId: scene.id,
            title: `${scene.code} 角色撞场`,
            detail: `${actor} 同时为 ${uniqueRoles.join('、')} 配音；同场角色需拆分演员或调整台词。`
          })
        }
      })
      const sceneDuration = durationOfScene(scene)
      if (sceneDuration > scene.durationLimit) {
        result.push({
          id: `over-${scene.id}`,
          type: 'over-time',
          level: 'warning',
          sceneId: scene.id,
          title: `${scene.code} 超出场次限额`,
          detail: `预计 ${sceneDuration.toFixed(1)} 秒，限额 ${scene.durationLimit} 秒，超出 ${(sceneDuration - scene.durationLimit).toFixed(1)} 秒。`
        })
      }
    }
    for (const issue of localizationIssues.value) {
      const excerpt = issue.sourceText.length > 24 ? `${issue.sourceText.slice(0, 24)}…` : issue.sourceText
      result.push({
        id: issue.id,
        type: 'localization',
        level: issue.status === 'missing' ? 'error' : 'warning',
        sceneId: issue.sceneId,
        cueId: issue.cueId,
        title: `${issue.sceneCode} 粤语译配${issue.status === 'missing' ? '缺失' : issue.status === 'stale' ? '已过期' : '未复核'}`,
        detail: `${issue.characterName}：“${excerpt}”${issue.status === 'missing' ? ' 还没有粤语译配稿。' : issue.status === 'stale' ? ' 原文或角色、音效引用已变化，旧译稿保留但需重新确认。' : ' 译配稿已填写，等待复核确认。'}`
      })
    }
    return result
  })

  function persist() {
    state.value.updatedAt = new Date().toISOString()
    saveState.value = 'saving'
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value))
      saveState.value = 'saved'
    }, 180)
  }

  function commit(label: string, mutator: (document: StudioDocument) => void, note = '', language: Language = 'mandarin') {
    const before = clone(state.value.document)
    const document = clone(state.value.document)
    mutator(document)
    undoStack.value.push(before)
    if (undoStack.value.length > 60) undoStack.value.shift()
    redoStack.value = []
    state.value.document = document
    state.value.pending.unshift({
      id: uid('change'),
      label,
      note,
      language,
      createdAt: new Date().toISOString(),
      status: 'pending',
      before,
      after: clone(document)
    })
    if (state.value.pending.length > 80) state.value.pending = state.value.pending.slice(0, 80)
    persist()
  }

  function replaceDocument(next: StudioDocument, label: string, language: Language = 'mandarin') {
    const before = clone(state.value.document)
    state.value.document = clone(next)
    state.value.pending.unshift({
      id: uid('change'),
      label,
      note: '',
      language,
      createdAt: new Date().toISOString(),
      status: 'pending',
      before,
      after: clone(next)
    })
    persist()
  }

  function updateProject(field: 'title' | 'subtitle' | 'targetDuration', value: string | number) {
    commit(`更新项目${field === 'title' ? '标题' : field === 'subtitle' ? '副标题' : '目标时长'}`, (document) => {
      if (field === 'targetDuration') document.targetDuration = Number(value)
      else document[field] = String(value)
    })
  }

  function updateScene(sceneId: string, field: keyof Scene, value: string | number) {
    commit(`更新 ${state.value.document.scenes.find((scene) => scene.id === sceneId)?.code ?? '场次'} ${field}`, (document) => {
      const scene = document.scenes.find((item) => item.id === sceneId)
      if (!scene) return
      if (field === 'durationLimit') scene.durationLimit = Number(value)
      else if (field === 'code' || field === 'title' || field === 'location' || field === 'timeOfDay' || field === 'transition') scene[field] = String(value)
    })
  }

  function updateCue(cueId: string, field: keyof Cue, value: string | number | undefined) {
    commit(`修改台词 ${state.value.document.scenes.flatMap((scene) => scene.cues).find((cue) => cue.id === cueId)?.text.slice(0, 12) ?? ''}`, (document) => {
      for (const scene of document.scenes) {
        const cue = scene.cues.find((item) => item.id === cueId)
        if (!cue) continue
        if (field === 'rate') cue.rate = Number(value) as Cue['rate']
        else if (field === 'manualDuration') cue.manualDuration = value === '' || value === undefined ? undefined : Number(value)
        else if (field === 'kind') cue.kind = value as CueKind
        else cue[field] = (value ?? '') as never
        break
      }
    })
  }

  function updateCueLocalization(cueId: string, text: string) {
    const source = state.value.document.scenes.flatMap((scene) => scene.cues).find((cue) => cue.id === cueId)
    commit(`译配台词 ${source?.text.slice(0, 12) ?? ''}`, (document) => {
      for (const scene of document.scenes) {
        const cue = scene.cues.find((item) => item.id === cueId)
        if (!cue) continue
        // 译配跟随当前源签名保存，保存后回到未复核状态
        const localizations = (cue.localizations ??= {})
        localizations.cantonese = makeLocalization(cue, text, false)
        break
      }
    }, '', 'cantonese')
  }

  function confirmLocalization(cueId: string) {
    commit('确认译配复核', (document) => {
      for (const scene of document.scenes) {
        const cue = scene.cues.find((item) => item.id === cueId)
        if (!cue) continue
        const localization = cue.localizations?.cantonese
        if (!localization || !localization.text.trim()) return
        // 复核确认以当前源签名重新锚定，过期状态随之解除
        localization.reviewed = true
        localization.sourceSignature = cueSignature(cue)
        localization.updatedAt = new Date().toISOString()
        break
      }
    }, '', 'cantonese')
  }

  function addScene() {
    const nextNumber = state.value.document.scenes.length + 1
    const id = uid('scene')
    commit(`新增场次 S${String(nextNumber).padStart(2, '0')}`, (document) => {
      document.scenes.push({
        id,
        code: `S${String(nextNumber).padStart(2, '0')}`,
        title: '未命名场次',
        location: '待填写',
        timeOfDay: '待填写',
        transition: '淡入',
        durationLimit: 150,
        cues: []
      })
    })
    selectedSceneId.value = id
  }

  function deleteScene(sceneId: string) {
    if (state.value.document.scenes.length <= 1) return
    const scene = state.value.document.scenes.find((item) => item.id === sceneId)
    commit(`删除场次 ${scene?.code ?? ''}`, (document) => {
      document.scenes = document.scenes.filter((item) => item.id !== sceneId)
    })
    selectedSceneId.value = state.value.document.scenes[0].id
  }

  function addCue(kind: CueKind, sceneId = selectedSceneId.value) {
    const id = uid('cue')
    commit(`新增${kind === 'dialogue' ? '台词' : kind === 'sfx' ? '音效' : '转场'}`, (document) => {
      const scene = document.scenes.find((item) => item.id === sceneId)
      if (!scene) return
      scene.cues.push({
        id,
        kind,
        characterId: kind === 'dialogue' ? document.characters[0]?.id : undefined,
        text: kind === 'dialogue' ? '请输入台词' : kind === 'sfx' ? '音效提示' : '转场说明',
        emotion: kind === 'dialogue' ? '自然' : '',
        rate: 1,
        soundEffectId: kind === 'sfx' ? document.soundEffects[0]?.id : undefined,
        transition: kind === 'transition' ? '淡出' : '',
        manualDuration: kind === 'transition' ? 3 : undefined,
        localizations: {}
      })
    })
    selectedCueId.value = id
  }

  function deleteCue(cueId: string) {
    commit('删除提示项', (document) => {
      for (const scene of document.scenes) scene.cues = scene.cues.filter((cue) => cue.id !== cueId)
    })
  }

  function moveCue(sceneId: string, cueId: string, targetCueId: string) {
    if (cueId === targetCueId) return
    commit('拖动调整台词与音效顺序', (document) => {
      const scene = document.scenes.find((item) => item.id === sceneId)
      if (!scene) return
      const fromIndex = scene.cues.findIndex((cue) => cue.id === cueId)
      const toIndex = scene.cues.findIndex((cue) => cue.id === targetCueId)
      if (fromIndex < 0 || toIndex < 0) return
      const [moved] = scene.cues.splice(fromIndex, 1)
      scene.cues.splice(toIndex, 0, moved)
    })
  }

  function moveScene(sceneId: string, direction: -1 | 1) {
    const index = state.value.document.scenes.findIndex((scene) => scene.id === sceneId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= state.value.document.scenes.length) return
    commit('调整场次顺序', (document) => {
      const [scene] = document.scenes.splice(index, 1)
      document.scenes.splice(target, 0, scene)
    })
  }

  function acceptChange(changeId: string) {
    const change = state.value.pending.find((item) => item.id === changeId)
    if (!change || change.status !== 'pending') return
    change.status = 'accepted'
    persist()
  }

  function rejectChange(changeId: string) {
    const index = state.value.pending.findIndex((item) => item.id === changeId && item.status === 'pending')
    if (index < 0) return
    const change = state.value.pending[index]
    undoStack.value.push(clone(state.value.document))
    // 只回退该语言负责的内容：粤语退回译配稿，普通话退回结构与原文，另一语言的成果保留
    state.value.document = change.language === 'cantonese'
      ? overlayLocalizations(state.value.document, change.before)
      : overlayLocalizations(change.before, state.value.document)
    for (let i = 0; i <= index; i += 1) {
      const item = state.value.pending[i]
      if (item.status === 'pending' && item.language === change.language) item.status = 'rejected'
    }
    persist()
  }

  function acceptAll() {
    for (const change of state.value.pending) {
      if (change.status === 'pending' && change.language === activeLanguage.value) change.status = 'accepted'
    }
    persist()
  }

  function undo() {
    const previous = undoStack.value.pop()
    if (!previous) return
    redoStack.value.push(clone(state.value.document))
    replaceDocument(previous, '撤销上一步修改', activeLanguage.value)
  }

  function redo() {
    const next = redoStack.value.pop()
    if (!next) return
    undoStack.value.push(clone(state.value.document))
    replaceDocument(next, '重做修改', activeLanguage.value)
  }

  function freeze(name: string): FrozenVersion | null {
    // 缺失、过期或未复核的译配稿会挡住冻结
    if (!canFreeze.value) return null
    const version: FrozenVersion = {
      id: uid('version'),
      name: name.trim() || `制作稿 v${state.value.frozen.length + 1}`,
      createdAt: new Date().toISOString(),
      document: clone(state.value.document),
      totalDuration: totalDuration.value
    }
    state.value.frozen.unshift(version)
    persist()
    return version
  }

  function makeScript(document: StudioDocument, language: Language = 'mandarin'): string {
    const lines = [
      document.title,
      document.subtitle,
      `语言版本：${language === 'cantonese' ? '粤语' : '普通话'}`,
      `目标时长：${document.targetDuration} 秒`,
      '='.repeat(48),
      ''
    ]
    document.scenes.forEach((scene, sceneIndex) => {
      lines.push(`${scene.code}｜${scene.title}`)
      lines.push(`场景：${scene.location} / ${scene.timeOfDay}`)
      lines.push(`转场：${scene.transition}`)
      lines.push(`场次限额：${scene.durationLimit} 秒｜预计：${durationOfScene(scene)} 秒`)
      lines.push('-'.repeat(34))
      scene.cues.forEach((cue, cueIndex) => {
        const prefix = `${String(cueIndex + 1).padStart(2, '0')} [${durationOfCue(cue).toFixed(1)}s]`
        if (cue.kind === 'dialogue') {
          const role = document.characters.find((character) => character.id === cue.characterId)?.name ?? '未指定角色'
          const text = language === 'cantonese'
            ? cue.localizations?.cantonese?.text.trim() || `【缺译】${cue.text}`
            : cue.text
          lines.push(`${prefix} ${role}｜${cue.emotion || '自然'}｜语速 ${cue.rate}`)
          lines.push(`    ${text}`)
        } else if (cue.kind === 'sfx') {
          const effect = document.soundEffects.find((item) => item.id === cue.soundEffectId)
          lines.push(`${prefix} 音效｜${cue.text}`)
          lines.push(`    文件：${effect?.source ?? '缺失引用'}｜${effect?.note ?? '需补齐音效'}`)
        } else {
          lines.push(`${prefix} 转场｜${cue.transition}｜${cue.text}`)
        }
      })
      if (sceneIndex < document.scenes.length - 1) lines.push('')
    })
    return lines.join('\n')
  }

  function downloadVersion(version: FrozenVersion, language: Language = 'mandarin') {
    const blob = new Blob([makeScript(version.document, language)], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    const languageLabel = language === 'cantonese' ? '粤语' : '普通话'
    anchor.download = `${version.document.title}-${version.name}-${languageLabel}.txt`.replace(/[\\/:*?"<>|]/g, '-')
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function resetSample() {
    commit('恢复示例数据', (document) => {
      const next = clone(sampleDocument)
      Object.assign(document, next)
    })
    selectedSceneId.value = state.value.document.scenes[0]?.id ?? ''
  }

  watch(state, persist, { deep: true })
  watch(activeLanguage, (language) => {
    // 切换语言只改编辑视图，不进文档也不进待确认区
    try {
      localStorage.setItem(LANGUAGE_KEY, language)
    } catch {
      // 隐私模式写入失败不影响编辑
    }
  })

  return {
    state,
    activeLanguage,
    selectedSceneId,
    selectedCueId,
    selectedScene,
    totalDuration,
    pendingChanges,
    localizationIssues,
    canFreeze,
    warnings,
    saveState,
    durationOfCue,
    durationOfScene,
    localizationStatus,
    updateProject,
    updateScene,
    updateCue,
    updateCueLocalization,
    confirmLocalization,
    addScene,
    deleteScene,
    addCue,
    deleteCue,
    moveCue,
    moveScene,
    acceptChange,
    rejectChange,
    acceptAll,
    undo,
    redo,
    freeze,
    downloadVersion,
    makeScript,
    resetSample,
    persist
  }
}
