import { computed, ref, watch } from 'vue'
import { sampleDocument } from './sample'
import {
  MASTER_LANG,
  collectLocalizationIssues,
  cueBasis,
  cueText,
  diffLanguage,
  langLabel,
  migrateState
} from './i18n'
import type {
  Cue,
  CueKind,
  FrozenVersion,
  LangCode,
  LocalizationIssue,
  PendingChange,
  Rate,
  Scene,
  StudioDocument,
  StudioState,
  WarningItem
} from './types'

const STORAGE_KEY = 'sologsb-1016-studio-v2'
const LEGACY_STORAGE_KEY = 'sologsb-1016-studio-v1'
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

function defaultState(): StudioState {
  return {
    schemaVersion: 2,
    document: clone(sampleDocument),
    pending: [],
    frozen: [],
    activeLanguage: MASTER_LANG,
    updatedAt: new Date().toISOString()
  }
}

function loadState(): StudioState {
  try {
    let raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      // 旧草稿（v1）升级：现有文本当作普通话版本，成功后写入 v2 键。
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
      if (legacy) {
        const migrated = migrateState(JSON.parse(legacy) as StudioState)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
        return migrated
      }
    } else {
      const parsed = JSON.parse(raw) as StudioState
      if (parsed.document?.scenes?.length) return parsed
    }
  } catch {
    // A corrupt local draft should not prevent access to the built-in example.
  }
  return defaultState()
}

function findCue(document: StudioDocument, cueId: string): Cue | undefined {
  for (const scene of document.scenes) {
    const cue = scene.cues.find((item) => item.id === cueId)
    if (cue) return cue
  }
  return undefined
}

/** 台词时长只取决于当前语言版本的文字；音效/转场由素材或固定时长决定。 */
function estimateTextDuration(text: string, rate: Rate): number {
  const pauses = (text.match(/[，。！？；、…]/g)?.length ?? 0) * 0.22
  const effectiveRate = rate || 1
  return Number((text.length / (4.2 * effectiveRate) + pauses).toFixed(1))
}

export function useStudio() {
  const state = ref<StudioState>(loadState())
  const activeLanguage = ref<LangCode>(state.value.activeLanguage ?? MASTER_LANG)
  const selectedSceneId = ref(state.value.document.scenes[0]?.id ?? '')
  const selectedCueId = ref('')
  const saveState = ref<'saved' | 'saving' | 'dirty'>('saved')
  const undoStack = ref<StudioDocument[]>([])
  const redoStack = ref<StudioDocument[]>([])
  let saveTimer: number | undefined

  const selectedScene = computed(() => state.value.document.scenes.find((scene) => scene.id === selectedSceneId.value) ?? state.value.document.scenes[0])

  function setLanguage(lang: LangCode) {
    if (lang === activeLanguage.value) return
    activeLanguage.value = lang
    state.value.activeLanguage = lang
    persist()
  }

  function durationOfCue(cue: Cue, lang: LangCode = activeLanguage.value, document: StudioDocument = state.value.document): number {
    if (cue.manualDuration !== undefined) return cue.manualDuration
    if (cue.kind === 'sfx') {
      return document.soundEffects.find((effect) => effect.id === cue.soundEffectId)?.duration ?? 6
    }
    if (cue.kind === 'transition') return 3
    const text = cueText(cue, lang) || cueText(cue, MASTER_LANG)
    return estimateTextDuration(text, cue.rate)
  }

  function durationOfScene(scene: Scene, lang: LangCode = activeLanguage.value, document: StudioDocument = state.value.document): number {
    return Number(scene.cues.reduce((total, cue) => total + durationOfCue(cue, lang, document), 0).toFixed(1))
  }

  const totalDuration = computed(() =>
    state.value.document.scenes.reduce((total, scene) => total + durationOfScene(scene, activeLanguage.value), 0)
  )
  const pendingChanges = computed(() => state.value.pending.filter((item) => item.status === 'pending'))
  /** 待确认记录跟着语言分开：当前语言轨 + 结构类主轨。 */
  const pendingInLanguage = computed(() => pendingChanges.value.filter((item) => item.language === activeLanguage.value))
  const masterPendingCount = computed(() => pendingChanges.value.filter((item) => item.language === MASTER_LANG).length)

  /** 当前语言的译配问题：缺失、过期（指纹对不上）、未复核。 */
  const localizationIssues = computed<LocalizationIssue[]>(() =>
    collectLocalizationIssues(state.value.document, activeLanguage.value)
  )
  const issueCounts = computed(() => {
    const counts = { missing: 0, stale: 0, unreviewed: 0, total: 0 }
    for (const issue of localizationIssues.value) counts[issue.kind] += 1
    counts.total = counts.missing + counts.stale + counts.unreviewed
    return counts
  })
  const canFreeze = computed(() => issueCounts.value.total === 0)

  const warnings = computed<WarningItem[]>(() => {
    const result: WarningItem[] = []
    const lang = activeLanguage.value
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
            detail: `“${cueText(cue, lang)}”引用了不存在的音效 ${cue.soundEffectId}。`
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
      const sceneDuration = durationOfScene(scene, lang)
      if (sceneDuration > scene.durationLimit) {
        result.push({
          id: `over-${scene.id}`,
          type: 'over-time',
          level: 'warning',
          sceneId: scene.id,
          title: `${scene.code} 超出场次限额（${langLabel(lang)}版）`,
          detail: `预计 ${sceneDuration.toFixed(1)} 秒，限额 ${scene.durationLimit} 秒，超出 ${(sceneDuration - scene.durationLimit).toFixed(1)} 秒。`
        })
      }
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

  function commit(label: string, mutator: (document: StudioDocument) => void, note = '') {
    const before = clone(state.value.document)
    const document = clone(state.value.document)
    mutator(document)
    undoStack.value.push(before)
    if (undoStack.value.length > 60) undoStack.value.shift()
    redoStack.value = []
    // 只改动单一语言译稿文本的提交归入该语言轨；结构类修改一律归普通话主轨。
    const language = diffLanguage(before, document) ?? MASTER_LANG
    state.value.document = document
    state.value.pending.unshift({
      id: uid('change'),
      label,
      note,
      createdAt: new Date().toISOString(),
      status: 'pending',
      language,
      before,
      after: clone(document)
    })
    if (state.value.pending.length > 80) state.value.pending = state.value.pending.slice(0, 80)
    persist()
  }

  function replaceDocument(next: StudioDocument, label: string) {
    const before = clone(state.value.document)
    const language = diffLanguage(before, next) ?? MASTER_LANG
    state.value.document = clone(next)
    state.value.pending.unshift({
      id: uid('change'),
      label,
      note: '',
      createdAt: new Date().toISOString(),
      status: 'pending',
      language,
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

  const BASIS_FIELDS = new Set<keyof Cue>(['kind', 'characterId', 'soundEffectId'])

  /**
   * 结构类字段编辑（类型、角色引用、音效引用）：普通话主稿回到待复核，
   * 其他语言的原译稿原样保留，由指纹比对派生“已过期”。
   */
  function updateCue(cueId: string, field: keyof Cue, value: string | number | undefined) {
    const cue = findCue(state.value.document, cueId)
    commit(`修改提示项 ${cue ? cueText(cue, MASTER_LANG).slice(0, 12) : ''}`, (document) => {
      const target = findCue(document, cueId)
      if (!target) return
      if (field === 'rate') target.rate = Number(value) as Cue['rate']
      else if (field === 'manualDuration') target.manualDuration = value === '' || value === undefined ? undefined : Number(value)
      else if (field === 'kind') target.kind = value as CueKind
      else if (field === 'characterId' || field === 'soundEffectId' || field === 'emotion' || field === 'transition') {
        target[field] = (value ?? '') as never
      }
      if (BASIS_FIELDS.has(field)) {
        const master = target.localizations[MASTER_LANG]
        if (master) {
          master.status = 'unreviewed'
          delete master.reviewedAt
          master.basis = cueBasis(target)
        }
      }
    })
  }

  /** 修改某语言译稿文本；不影响其他语言，原译稿由待确认流程兜底。 */
  function updateCueText(cueId: string, lang: LangCode, value: string) {
    const verb = lang === MASTER_LANG ? '修改普通话台词' : state.value.document.scenes.some((scene) => scene.cues.some((item) => item.id === cueId && !item.localizations[lang]?.text)) ? '补写粤语译稿' : '修改粤语译稿'
    commit(`${verb} ${cueText(findCue(state.value.document, cueId) ?? ({} as Cue), MASTER_LANG).slice(0, 10)}`, (document) => {
      const target = findCue(document, cueId)
      if (!target) return
      const existing = target.localizations[lang]
      if (existing) {
        existing.text = value
        existing.status = 'unreviewed'
        delete existing.reviewedAt
        if (lang === MASTER_LANG) existing.basis = cueBasis(target)
      } else {
        target.localizations[lang] = {
          text: value,
          status: 'unreviewed',
          basis: lang === MASTER_LANG ? cueBasis(target) : cueBasis(target)
        }
      }
    })
  }

  /** 重新确认单条译稿：按当前原文刷新指纹、标记已复核。 */
  function reviewLocalization(cueId: string, lang: LangCode) {
    const cue = findCue(state.value.document, cueId)
    if (!cue) return
    const loc = cue.localizations[lang]
    if (!loc || !loc.text.trim()) return
    loc.status = 'reviewed'
    loc.reviewedAt = new Date().toISOString()
    loc.basis = cueBasis(cue)
    persist()
  }

  /** 批量复核某语言下所有已有文本（未翻译项不处理）。 */
  function reviewLanguage(lang: LangCode) {
    const now = new Date().toISOString()
    for (const scene of state.value.document.scenes) {
      for (const cue of scene.cues) {
        const loc = cue.localizations[lang]
        if (loc && loc.text.trim()) {
          loc.status = 'reviewed'
          loc.reviewedAt = now
          loc.basis = cueBasis(cue)
        }
      }
    }
    persist()
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
    const defaultText = kind === 'dialogue' ? '请输入台词' : kind === 'sfx' ? '音效提示' : '转场说明'
    commit(`新增${kind === 'dialogue' ? '台词' : kind === 'sfx' ? '音效' : '转场'}`, (document) => {
      const scene = document.scenes.find((item) => item.id === sceneId)
      if (!scene) return
      const cue: Cue = {
        id,
        kind,
        characterId: kind === 'dialogue' ? document.characters[0]?.id : undefined,
        emotion: kind === 'dialogue' ? '自然' : '',
        rate: 1,
        soundEffectId: kind === 'sfx' ? document.soundEffects[0]?.id : undefined,
        transition: kind === 'transition' ? '淡出' : '',
        manualDuration: kind === 'transition' ? 3 : undefined,
        // 新提示只建普通话版本，粤语留空，等待单独补译。
        localizations: {
          [MASTER_LANG]: { text: defaultText, basis: '', status: 'unreviewed' }
        }
      }
      cue.localizations[MASTER_LANG]!.basis = cueBasis(cue)
      scene.cues.push(cue)
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

  /** 接受当前语言轨的全部待确认记录（结构类修改只在普通话轨出现）。 */
  function acceptLanguage(lang: LangCode) {
    for (const change of state.value.pending) {
      if (change.status === 'pending' && change.language === lang) change.status = 'accepted'
    }
    persist()
  }

  /**
   * 分语言退回：
   * - 普通话主轨记录被退回时整份文档回滚到该记录之前，并拒绝其上方所有待确认记录；
   * - 粤语轨记录退回时只回滚这一语言的译稿文本，其他语言与结构改动不受影响，
   *   同时拒绝其上方（更新的）同语言记录。
   */
  function rejectChange(changeId: string) {
    const index = state.value.pending.findIndex((item) => item.id === changeId && item.status === 'pending')
    if (index < 0) return
    const change = state.value.pending[index]
    undoStack.value.push(clone(state.value.document))
    if (change.language === MASTER_LANG) {
      state.value.document = clone(change.before)
      for (let i = 0; i <= index; i += 1) {
        if (state.value.pending[i].status === 'pending') state.value.pending[i].status = 'rejected'
      }
    } else {
      const lang = change.language
      for (const sceneBefore of change.before.scenes) {
        for (const oldCue of sceneBefore.cues) {
          const currentCue = findCue(state.value.document, oldCue.id)
          if (currentCue) currentCue.localizations[lang] = clone(oldCue.localizations[lang])
        }
      }
      for (let i = 0; i <= index; i += 1) {
        if (state.value.pending[i].status === 'pending' && state.value.pending[i].language === lang) {
          state.value.pending[i].status = 'rejected'
        }
      }
    }
    persist()
  }

  function undo() {
    const previous = undoStack.value.pop()
    if (!previous) return
    redoStack.value.push(clone(state.value.document))
    replaceDocument(previous, '撤销上一步修改')
  }

  function redo() {
    const next = redoStack.value.pop()
    if (!next) return
    undoStack.value.push(clone(state.value.document))
    replaceDocument(next, '重做修改')
  }

  /** 按语言冻结；缺失、过期或未复核未清零时拒绝冻结。 */
  function freeze(name: string, lang: LangCode): FrozenVersion | null {
    if (collectLocalizationIssues(state.value.document, lang).length) return null
    const version: FrozenVersion = {
      id: uid('version'),
      name: name.trim() || `${langLabel(lang)}制作稿 v${state.value.frozen.length + 1}`,
      createdAt: new Date().toISOString(),
      language: lang,
      document: clone(state.value.document),
      totalDuration: state.value.document.scenes.reduce((total, scene) => total + durationOfScene(scene, lang), 0)
    }
    state.value.frozen.unshift(version)
    persist()
    return version
  }

  function makeScript(document: StudioDocument, lang: LangCode): string {
    const lines = [
      document.title,
      document.subtitle,
      `版本：${langLabel(lang)}版`,
      `目标时长：${document.targetDuration} 秒`,
      '='.repeat(48),
      ''
    ]
    document.scenes.forEach((scene, sceneIndex) => {
      lines.push(`${scene.code}｜${scene.title}`)
      lines.push(`场景：${scene.location} / ${scene.timeOfDay}`)
      lines.push(`转场：${scene.transition}`)
      lines.push(`场次限额：${scene.durationLimit} 秒｜预计：${durationOfScene(scene, lang, document)} 秒`)
      lines.push('-'.repeat(34))
      scene.cues.forEach((cue, cueIndex) => {
        const prefix = `${String(cueIndex + 1).padStart(2, '0')} [${durationOfCue(cue, lang, document).toFixed(1)}s]`
        if (cue.kind === 'dialogue') {
          const role = document.characters.find((character) => character.id === cue.characterId)?.name ?? '未指定角色'
          lines.push(`${prefix} ${role}｜${cue.emotion || '自然'}｜语速 ${cue.rate}`)
          lines.push(`    ${cueText(cue, lang)}`)
        } else if (cue.kind === 'sfx') {
          const effect = document.soundEffects.find((item) => item.id === cue.soundEffectId)
          lines.push(`${prefix} 音效｜${cueText(cue, lang)}`)
          lines.push(`    文件：${effect?.source ?? '缺失引用'}｜${effect?.note ?? '需补齐音效'}`)
        } else {
          lines.push(`${prefix} 转场｜${cue.transition}｜${cueText(cue, lang)}`)
        }
      })
      if (sceneIndex < document.scenes.length - 1) lines.push('')
    })
    return lines.join('\n')
  }

  function downloadVersion(version: FrozenVersion) {
    const blob = new Blob([makeScript(version.document, version.language)], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${version.document.title}-${version.name}.txt`.replace(/[\\/:*?"<>|]/g, '-')
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

  return {
    state,
    activeLanguage,
    setLanguage,
    selectedSceneId,
    selectedCueId,
    selectedScene,
    totalDuration,
    pendingChanges,
    pendingInLanguage,
    masterPendingCount,
    localizationIssues,
    issueCounts,
    canFreeze,
    warnings,
    saveState,
    durationOfCue,
    durationOfScene,
    updateProject,
    updateScene,
    updateCue,
    updateCueText,
    reviewLocalization,
    reviewLanguage,
    addScene,
    deleteScene,
    addCue,
    deleteCue,
    moveCue,
    moveScene,
    acceptChange,
    acceptLanguage,
    rejectChange,
    undo,
    redo,
    freeze,
    downloadVersion,
    makeScript,
    resetSample,
    persist
  }
}
