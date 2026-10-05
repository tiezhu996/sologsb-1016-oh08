<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  NAlert,
  NButton,
  NConfigProvider,
  NEmpty,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NProgress,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NTabPane,
  NTabs,
  NTag
} from 'naive-ui'
import { useStudio } from './useStudio'
import { LANGUAGES, LOC_STATE_META, MASTER_LANG, cueText, localizationState, langLabel } from './i18n'
import type { Cue, CueKind, LangCode, Rate } from './types'

const studio = useStudio()
const {
  state,
  activeLanguage,
  setLanguage,
  selectedSceneId,
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
  resetSample
} = studio

const dragCueId = ref('')
const showFreezeModal = ref(false)
const freezeName = ref('')
const freezeLanguage = ref<LangCode>('zh-CN')
const activeRightTab = ref('warnings')

const kindOptions = [
  { label: '台词', value: 'dialogue' },
  { label: '音效', value: 'sfx' },
  { label: '转场', value: 'transition' }
]
const rateOptions: Array<{ label: string; value: Rate }> = [
  { label: '慢 0.8×', value: 0.8 },
  { label: '偏慢 0.9×', value: 0.9 },
  { label: '标准 1.0×', value: 1 },
  { label: '偏快 1.1×', value: 1.1 },
  { label: '快 1.2×', value: 1.2 }
]
const characterOptions = computed(() => state.value.document.characters.map((item) => ({ label: `${item.name} / ${item.voiceActor}`, value: item.id })))
const effectOptions = computed(() => state.value.document.soundEffects.map((item) => ({ label: `${item.name} (${item.duration}s)`, value: item.id })))
const themeOverrides = {
  common: {
    primaryColor: '#73daca',
    primaryColorHover: '#8de7d9',
    primaryColorPressed: '#52b9aa',
    bodyColor: '#0d111b',
    cardColor: '#151b28',
    modalColor: '#171e2c',
    popoverColor: '#1b2332',
    textColorBase: '#e7edf7',
    borderColor: '#2b3445',
    borderRadius: '8px'
  },
  Input: { color: '#101621', colorFocus: '#101621', border: '1px solid #2b3445' },
  InputNumber: { color: '#101621', border: '1px solid #2b3445' },
  Card: { borderColor: '#252f40' },
  Tab: { tabTextColorActiveLine: '#73daca', barColor: '#73daca' }
}
const projectMinutes = computed(() => `${Math.floor(totalDuration.value / 60)}:${String(Math.round(totalDuration.value % 60)).padStart(2, '0')}`)
const pendingCount = computed(() => pendingChanges.value.length)
const languagePendingCount = computed(() => pendingInLanguage.value.length)
const warningCount = computed(() => warnings.value.length)
const saveLabel = computed(() => saveState.value === 'saved' ? '已保存到本机' : '正在保存…')
const isMasterView = computed(() => activeLanguage.value === MASTER_LANG)
const freezeLangCounts = computed(() => {
  const counts: Record<LangCode, number> = { 'zh-CN': 0, 'zh-HK': 0 }
  for (const lang of LANGUAGES.map((item) => item.value)) {
    for (const scene of state.value.document.scenes) {
      for (const cue of scene.cues) {
        const status = localizationState(cue, lang)
        if (status !== 'reviewed') counts[lang] += 1
      }
    }
  }
  return counts
})
const freezeIssues = computed(() => {
  const map = new Map(localizationIssues.value.map((issue, index) => [`${issue.sceneId}-${issue.cueId}-${index}`, issue]))
  return [...map.values()].slice(0, 6)
})

function cueName(cue: Cue) {
  if (cue.kind === 'dialogue') return state.value.document.characters.find((item) => item.id === cue.characterId)?.name ?? '未指定角色'
  if (cue.kind === 'sfx') return state.value.document.soundEffects.find((item) => item.id === cue.soundEffectId)?.name ?? '缺失音效'
  return '转场'
}

function cueStatus(cue: Cue) {
  return localizationState(cue, activeLanguage.value)
}

function cueStatusTag(cue: Cue) {
  return LOC_STATE_META[cueStatus(cue)]
}

/** 译稿指纹对不上（原文文字、类型、角色或音效引用变化）时的重新确认提示。 */
function staleReason(cue: Cue): string {
  void cue
  return '普通话原文或角色/音效引用已更新，请对照原文重新确认本版译稿；原有译稿已保留。'
}

function sceneStatus(sceneId: string) {
  return warnings.value.some((warning) => warning.sceneId === sceneId) ? 'warning' : 'ok'
}

function sceneIssueCount(sceneId: string) {
  return localizationIssues.value.filter((issue) => issue.sceneId === sceneId).length
}

function issueLabel(kind: string) {
  return kind === 'missing' ? '缺失' : kind === 'stale' ? '过期' : '未复核'
}

function dropCue(targetId: string) {
  if (!dragCueId.value || !selectedScene.value) return
  moveCue(selectedScene.value.id, dragCueId.value, targetId)
  dragCueId.value = ''
}

function goToScene(sceneId: string) {
  selectedSceneId.value = sceneId
  document.querySelector('.editor-column')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function changeCueKind(cue: Cue, kind: CueKind) {
  updateCue(cue.id, 'kind', kind)
  if (kind === 'dialogue' && !cue.characterId) updateCue(cue.id, 'characterId', state.value.document.characters[0]?.id)
  if (kind === 'sfx' && !cue.soundEffectId) updateCue(cue.id, 'soundEffectId', state.value.document.soundEffects[0]?.id)
  if (kind === 'transition') updateCue(cue.id, 'transition', cue.transition || '淡出')
}

function openFreeze() {
  freezeLanguage.value = activeLanguage.value
  freezeName.value = `${langLabel(activeLanguage.value)}制作稿 v${state.value.frozen.length + 1}`
  showFreezeModal.value = true
}

function confirmFreeze() {
  const version = freeze(freezeName.value, freezeLanguage.value)
  if (!version) return
  showFreezeModal.value = false
  downloadVersion(version)
}

function focusIssue(issue: { sceneId: string; cueId: string }) {
  showFreezeModal.value = false
  selectedSceneId.value = issue.sceneId
  activeRightTab.value = 'warnings'
  window.setTimeout(() => {
    document.querySelector(`[data-cue-id="${issue.cueId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, 60)
}

function onKeydown(event: KeyboardEvent) {
  const command = event.ctrlKey || event.metaKey
  if (command && event.key.toLowerCase() === 's') {
    event.preventDefault()
    studio.persist()
  }
  if (command && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    event.shiftKey ? redo() : undo()
  }
  if (command && event.key.toLowerCase() === 'y') {
    event.preventDefault()
    redo()
  }
  if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown') && selectedScene.value) {
    event.preventDefault()
    moveScene(selectedScene.value.id, event.key === 'ArrowUp' ? -1 : 1)
  }
  if (event.key === '[' || event.key === ']') {
    const index = state.value.document.scenes.findIndex((scene) => scene.id === selectedScene.value?.id)
    const next = event.key === '[' ? index - 1 : index + 1
    if (state.value.document.scenes[next]) selectedSceneId.value = state.value.document.scenes[next].id
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <n-config-provider :theme-overrides="themeOverrides">
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">声</div>
          <div>
            <strong>声场制作台</strong>
            <span>RADIO DRAMA STUDIO</span>
          </div>
        </div>
        <div class="project-fields">
          <n-input :value="state.document.title" aria-label="项目标题" @update:value="updateProject('title', $event)" />
          <n-input :value="state.document.subtitle" aria-label="项目副标题" @update:value="updateProject('subtitle', $event)" />
        </div>
        <div class="top-actions">
          <!-- 切换语言只改编辑视图；场次、顺序与引用始终由普通话版管理 -->
          <n-radio-group :value="activeLanguage" size="small" @update:value="setLanguage">
            <n-radio-button value="zh-CN">普通话</n-radio-button>
            <n-radio-button value="zh-HK">粤语</n-radio-button>
          </n-radio-group>
          <span class="save-state">{{ saveLabel }}</span>
          <n-button quaternary @click="undo">撤销 ⌘Z</n-button>
          <n-button quaternary @click="redo">重做 ⇧⌘Z</n-button>
          <n-button type="primary" :disabled="!canFreeze" :title="canFreeze ? '' : '当前语言仍有缺失、过期或未复核的译稿'" @click="openFreeze">冻结并导出</n-button>
        </div>
      </header>

      <section class="summary-strip">
        <div class="metric">
          <span>预计总时长 · {{ langLabel(activeLanguage) }}版</span>
          <strong>{{ projectMinutes }}</strong>
          <small>{{ totalDuration.toFixed(1) }} / {{ state.document.targetDuration }} 秒</small>
        </div>
        <div class="target-control">
          <n-progress
            type="line"
            :percentage="Math.min(100, Number(((totalDuration / state.document.targetDuration) * 100).toFixed(1)))"
            :height="8"
            :show-indicator="false"
            :status="totalDuration > state.document.targetDuration ? 'error' : 'success'"
          />
          <n-input-number
            :value="state.document.targetDuration"
            size="small"
            :min="30"
            :step="10"
            @update:value="updateProject('targetDuration', $event ?? 0)"
          >
            <template #suffix>秒目标</template>
          </n-input-number>
        </div>
        <div class="metric compact">
          <span>场次</span><strong>{{ state.document.scenes.length }}</strong>
        </div>
        <div class="metric compact">
          <span>{{ langLabel(activeLanguage) }}待确认</span><strong class="accent">{{ languagePendingCount }}</strong>
        </div>
        <div class="metric compact">
          <span>译稿待办</span><strong :class="{ danger: issueCounts.total }">{{ issueCounts.total }}</strong>
        </div>
      </section>

      <main class="workspace">
        <aside class="scene-sidebar">
          <div class="panel-heading">
            <div>
              <span class="eyebrow">PLAYLIST</span>
              <h2>场次结构</h2>
            </div>
            <n-button circle secondary aria-label="新增场次" @click="addScene">＋</n-button>
          </div>
          <div class="scene-list">
            <button
              v-for="(scene, index) in state.document.scenes"
              :key="scene.id"
              class="scene-item"
              :class="{ active: scene.id === selectedSceneId, warning: sceneStatus(scene.id) === 'warning' }"
              @click="selectedSceneId = scene.id"
            >
              <span class="scene-index">{{ String(index + 1).padStart(2, '0') }}</span>
              <span class="scene-copy">
                <strong>{{ scene.code }} · {{ scene.title }}</strong>
                <small>{{ scene.location }} / {{ scene.timeOfDay }}</small>
              </span>
              <span class="scene-meta">
                <small v-if="sceneIssueCount(scene.id)" class="scene-issue-badge">{{ sceneIssueCount(scene.id) }} 待办</small>
                <span class="scene-duration">{{ durationOfScene(scene, activeLanguage).toFixed(0) }}s</span>
              </span>
            </button>
          </div>
          <div class="sidebar-tip">
            <strong>双语工作流</strong>
            <span>普通话管场次与提示顺序</span>
            <span>粤语按条补译、逐条复核</span>
            <span>原文一改，旧译稿自动标过期</span>
          </div>
          <n-button block quaternary @click="resetSample">恢复示例数据</n-button>
        </aside>

        <section v-if="selectedScene" class="editor-column">
          <div class="scene-title-row">
            <div>
              <span class="eyebrow">SCENE {{ selectedScene.code }} · {{ langLabel(activeLanguage) }}视图</span>
              <input class="title-input" :value="selectedScene.title" aria-label="场次标题" @change="updateScene(selectedScene.id, 'title', ($event.target as HTMLInputElement).value)" />
            </div>
            <div class="scene-order-actions">
              <n-button size="small" secondary @click="moveScene(selectedScene.id, -1)">上移</n-button>
              <n-button size="small" secondary @click="moveScene(selectedScene.id, 1)">下移</n-button>
              <n-button size="small" type="error" tertiary :disabled="!isMasterView" title="场次结构由普通话版管理" @click="deleteScene(selectedScene.id)">删除场次</n-button>
            </div>
          </div>

          <div class="scene-meta-grid" :class="{ 'is-readonly': !isMasterView }">
            <n-form-item label="场次号"><n-input :value="selectedScene.code" :readonly="!isMasterView" @update:value="updateScene(selectedScene.id, 'code', $event)" /></n-form-item>
            <n-form-item label="空间"><n-input :value="selectedScene.location" :readonly="!isMasterView" @update:value="updateScene(selectedScene.id, 'location', $event)" /></n-form-item>
            <n-form-item label="时间"><n-input :value="selectedScene.timeOfDay" :readonly="!isMasterView" @update:value="updateScene(selectedScene.id, 'timeOfDay', $event)" /></n-form-item>
            <n-form-item label="场次限额（秒）"><n-input-number :value="selectedScene.durationLimit" :disabled="!isMasterView" :min="5" :step="5" @update:value="updateScene(selectedScene.id, 'durationLimit', $event ?? 0)" /></n-form-item>
            <n-form-item label="场次转场" class="span-2"><n-input :value="selectedScene.transition" :readonly="!isMasterView" @update:value="updateScene(selectedScene.id, 'transition', $event)" /></n-form-item>
          </div>
          <p v-if="!isMasterView" class="readonly-hint">粤语视图只编辑译稿与复核状态；场次元数据、提示顺序与角色/音效引用以普通话版为准。</p>

          <div class="timeline-heading">
            <div>
              <span class="eyebrow">TIMELINE · {{ langLabel(activeLanguage) }}</span>
              <h3>台词与声音提示</h3>
            </div>
            <div class="add-actions">
              <n-button size="small" secondary :disabled="!isMasterView" title="新增提示由普通话主版管理" @click="addCue('dialogue')">＋ 台词</n-button>
              <n-button size="small" secondary :disabled="!isMasterView" title="新增提示由普通话主版管理" @click="addCue('sfx')">＋ 音效</n-button>
              <n-button size="small" secondary :disabled="!isMasterView" title="新增提示由普通话主版管理" @click="addCue('transition')">＋ 转场</n-button>
              <n-button size="small" type="primary" secondary :disabled="issueCounts.total === 0" @click="reviewLanguage(activeLanguage)">一键复核已有译稿</n-button>
            </div>
          </div>
          <div class="loc-progress">
            <n-tag size="small" :type="issueCounts.missing ? 'error' : 'default'" :bordered="false">未翻译 {{ issueCounts.missing }}</n-tag>
            <n-tag size="small" :type="issueCounts.stale ? 'warning' : 'default'" :bordered="false">已过期 {{ issueCounts.stale }}</n-tag>
            <n-tag size="small" :type="issueCounts.unreviewed ? 'warning' : 'default'" :bordered="false">待复核 {{ issueCounts.unreviewed }}</n-tag>
            <n-tag size="small" type="success" :bordered="false">共 {{ selectedScene.cues.length }} 条</n-tag>
          </div>

          <div class="cue-list">
            <article
              v-for="(cue, index) in selectedScene.cues"
              :key="cue.id"
              :data-cue-id="cue.id"
              class="cue-card"
              :class="[`kind-${cue.kind}`, `loc-${cueStatus(cue)}`, { dragging: dragCueId === cue.id }]"
              draggable="true"
              @dragstart="dragCueId = cue.id"
              @dragend="dragCueId = ''"
              @dragover.prevent
              @drop="dropCue(cue.id)"
            >
              <div class="cue-grip" title="拖动调整顺序">⋮⋮</div>
              <div class="cue-main">
                <div class="cue-topline">
                  <span class="cue-number">{{ String(index + 1).padStart(2, '0') }}</span>
                  <n-select class="kind-select" size="small" :value="cue.kind" :options="kindOptions" :disabled="!isMasterView" @update:value="changeCueKind(cue, $event)" />
                  <n-tag size="small" :bordered="false">{{ cueName(cue) }}</n-tag>
                  <n-tag size="small" :type="cueStatusTag(cue).tagType" :bordered="false">{{ cueStatusTag(cue).label }}</n-tag>
                  <span class="duration-pill">{{ durationOfCue(cue, activeLanguage).toFixed(1) }}s</span>
                  <n-button v-if="cueStatus(cue) !== 'reviewed'" size="tiny" secondary type="success" :disabled="cueStatus(cue) === 'missing'" @click="reviewLocalization(cue.id, activeLanguage)">确认复核</n-button>
                  <n-button size="tiny" tertiary type="error" :disabled="!isMasterView" title="删除提示由普通话主版管理" @click="deleteCue(cue.id)">删除</n-button>
                </div>

                <!-- 粤语视图：角色引用、情绪、语速等制作指令来自普通话主版，只读对照 -->
                <div v-if="cue.kind === 'dialogue'" class="cue-grid">
                  <n-select :value="cue.characterId" :options="characterOptions" :disabled="!isMasterView" placeholder="选择角色" @update:value="updateCue(cue.id, 'characterId', $event)" />
                  <n-input :value="cue.emotion" :readonly="!isMasterView" placeholder="情绪与表演提示" @update:value="updateCue(cue.id, 'emotion', $event)" />
                  <n-select :value="cue.rate" :options="rateOptions" :disabled="!isMasterView" @update:value="updateCue(cue.id, 'rate', $event)" />
                  <n-input-number :value="cue.manualDuration" clearable placeholder="自动" :disabled="!isMasterView" :min="0.5" :step="0.5" @update:value="updateCue(cue.id, 'manualDuration', $event ?? undefined)">
                    <template #suffix>手动秒</template>
                  </n-input-number>
                  <n-input
                    class="span-4 loc-text"
                    type="textarea"
                    :autosize="{ minRows: 2, maxRows: 5 }"
                    :status="cueStatus(cue) === 'stale' ? 'warning' : cueStatus(cue) === 'missing' ? 'error' : undefined"
                    :value="cueText(cue, activeLanguage)"
                    :placeholder="isMasterView ? '普通话台词原文（主版）' : '在此补写粤语译稿；留空视为未翻译'"
                    @update:value="updateCueText(cue.id, activeLanguage, $event)"
                  />
                </div>

                <div v-else-if="cue.kind === 'sfx'" class="cue-grid">
                  <n-select :value="cue.soundEffectId" :options="effectOptions" :disabled="!isMasterView" filterable placeholder="选择音效" @update:value="updateCue(cue.id, 'soundEffectId', $event)" />
                  <n-input-number :value="cue.manualDuration" clearable placeholder="使用素材时长" :disabled="!isMasterView" :min="0.2" :step="0.5" @update:value="updateCue(cue.id, 'manualDuration', $event ?? undefined)">
                    <template #suffix>覆盖秒数</template>
                  </n-input-number>
                  <n-input
                    class="span-4 loc-text"
                    type="textarea"
                    :autosize="{ minRows: 1, maxRows: 4 }"
                    :status="cueStatus(cue) === 'stale' ? 'warning' : cueStatus(cue) === 'missing' ? 'error' : undefined"
                    :value="cueText(cue, activeLanguage)"
                    :placeholder="isMasterView ? '普通话声音动作说明（主版）' : '在此补写粤语版本的声音动作说明'"
                    @update:value="updateCueText(cue.id, activeLanguage, $event)"
                  />
                </div>

                <div v-else class="cue-grid">
                  <n-input :value="cue.transition" :readonly="!isMasterView" placeholder="转场方式" @update:value="updateCue(cue.id, 'transition', $event)" />
                  <n-input-number :value="cue.manualDuration" :disabled="!isMasterView" :min="0" :step="0.5" @update:value="updateCue(cue.id, 'manualDuration', $event ?? undefined)">
                    <template #suffix>秒</template>
                  </n-input-number>
                  <n-input
                    class="span-4 loc-text"
                    type="textarea"
                    :autosize="{ minRows: 1, maxRows: 4 }"
                    :status="cueStatus(cue) === 'stale' ? 'warning' : cueStatus(cue) === 'missing' ? 'error' : undefined"
                    :value="cueText(cue, activeLanguage)"
                    :placeholder="isMasterView ? '普通话转场说明（主版）' : '在此补写粤语版本的转场说明'"
                    @update:value="updateCueText(cue.id, activeLanguage, $event)"
                  />
                </div>

                <!-- 非普通话视图：显示原文对照；过期时保留并展示旧译稿提示 -->
                <div v-if="!isMasterView" class="loc-reference">
                  <n-tag size="tiny" :bordered="false">普通话原文</n-tag>
                  <span class="reference-text">{{ cueText(cue, MASTER_LANG) || '（主版暂无文字）' }}</span>
                </div>
                <div v-if="!isMasterView && cueStatus(cue) === 'stale'" class="loc-stale-notice">
                  <n-alert type="warning" :show-icon="false">
                    {{ staleReason(cue) }}
                    <n-button size="tiny" quaternary type="warning" style="margin-left: 8px" @click="reviewLocalization(cue.id, activeLanguage)">对照后确认</n-button>
                  </n-alert>
                </div>
              </div>
            </article>
            <n-empty v-if="!selectedScene.cues.length" description="这场还没有声音提示">
              <template #extra><n-button :disabled="!isMasterView" @click="addCue('dialogue')">添加第一条台词</n-button></template>
            </n-empty>
          </div>
        </section>

        <aside class="review-column">
          <div class="review-heading">
            <div>
              <span class="eyebrow">REVIEW DESK · {{ langLabel(activeLanguage) }}</span>
              <h2>导演确认区</h2>
            </div>
            <n-button v-if="languagePendingCount" size="small" type="primary" secondary @click="acceptLanguage(activeLanguage)">全部接受（本语言）</n-button>
          </div>
          <n-tabs v-model:value="activeRightTab" type="line" animated>
            <n-tab-pane name="warnings" :tab="`检查 ${warningCount}`">
              <div class="review-list">
                <div v-for="warning in warnings" :key="warning.id" class="warning-card" :class="warning.level">
                  <div class="warning-title">
                    <n-tag size="small" :type="warning.level === 'error' ? 'error' : 'warning'" :bordered="false">{{ warning.type === 'collision' ? '撞场' : warning.type === 'missing-sfx' ? '引用' : '时长' }}</n-tag>
                    <strong>{{ warning.title }}</strong>
                  </div>
                  <p>{{ warning.detail }}</p>
                  <n-button size="tiny" quaternary @click="goToScene(warning.sceneId)">定位到 {{ state.document.scenes.find((scene) => scene.id === warning.sceneId)?.code }}</n-button>
                </div>
                <n-empty v-if="!warnings.length" :description="`${langLabel(activeLanguage)}版当前没有连续性问题`" />
              </div>
            </n-tab-pane>

            <n-tab-pane name="pending" :tab="`待确认 ${languagePendingCount}`">
              <div class="pending-toolbar">
                <n-alert type="info" :show-icon="false">
                  {{ langLabel(activeLanguage) }}的修改单独进入本语言待确认区。退回某条记录只会回滚该语言译稿，另一语言不受影响。
                </n-alert>
                <n-alert v-if="!isMasterView && masterPendingCount" type="warning" :show-icon="false" style="margin-top: 8px">
                  普通话主轨还有 {{ masterPendingCount }} 条结构/原文改动待导演确认，会影响粤语译稿的过期标记。
                  <n-button size="tiny" quaternary type="warning" style="margin-left: 8px" @click="setLanguage(MASTER_LANG)">切到普通话处理</n-button>
                </n-alert>
              </div>
              <div class="review-list">
                <div v-for="change in pendingInLanguage" :key="change.id" class="pending-card">
                  <div class="pending-meta">
                    <strong>{{ change.label }}</strong>
                    <span>{{ new Date(change.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }}</span>
                  </div>
                  <p v-if="change.note">{{ change.note }}</p>
                  <div class="pending-actions">
                    <n-button size="small" type="primary" @click="acceptChange(change.id)">接受</n-button>
                    <n-button size="small" tertiary type="warning" @click="rejectChange(change.id)">
                      {{ isMasterView ? '退回（含上方草稿）' : '退回本语言' }}
                    </n-button>
                  </div>
                </div>
                <n-empty v-if="!languagePendingCount" :description="`${langLabel(activeLanguage)}版没有待确认修改`" />
              </div>
            </n-tab-pane>

            <n-tab-pane name="versions" :tab="`冻结 ${state.frozen.length}`">
              <div class="review-list">
                <div v-for="version in state.frozen" :key="version.id" class="version-card">
                  <div>
                    <strong>{{ version.name }}</strong>
                    <span>{{ new Date(version.createdAt).toLocaleString('zh-CN') }}</span>
                    <small>
                      <n-tag size="tiny" :bordered="false" :type="version.language === 'zh-HK' ? 'warning' : 'success'">{{ langLabel(version.language) }}版</n-tag>
                      {{ version.document.scenes.length }} 场 · {{ version.totalDuration.toFixed(1) }} 秒
                    </small>
                  </div>
                  <n-button size="small" type="primary" secondary @click="downloadVersion(version)">导出稿</n-button>
                </div>
                <n-empty v-if="!state.frozen.length" description="按语言冻结后生成只读制作稿" />
              </div>
            </n-tab-pane>
          </n-tabs>
        </aside>
      </main>
    </div>

    <n-modal v-model:show="showFreezeModal">
      <div class="dialog-card">
        <span class="eyebrow">FREEZE VERSION</span>
        <h2>冻结制作稿</h2>
        <p>选择要导出的语言版本。该语言下若仍有未翻译、已过期或未复核的提示，冻结会被挡住，全部清零后才能生成不可变制作稿。</p>
        <n-radio-group v-model:value="freezeLanguage" class="freeze-lang">
          <n-radio-button v-for="option in LANGUAGES" :key="option.value" :value="option.value">
            {{ option.label }}<span v-if="freezeLangCounts[option.value]" class="freeze-lang-count"> · {{ freezeLangCounts[option.value] }} 项待办</span>
          </n-radio-button>
        </n-radio-group>
        <div v-if="freezeLangCounts[freezeLanguage]" class="freeze-blockers">
          <n-alert type="error" :show-icon="false">
            {{ langLabel(freezeLanguage) }}版还有 {{ freezeLangCounts[freezeLanguage] }} 条提示缺失、过期或未复核，无法冻结。
          </n-alert>
          <div v-for="issue in freezeIssues" :key="`${issue.sceneId}-${issue.cueId}`" class="freeze-blocker-row">
            <n-tag size="small" :type="issue.kind === 'missing' ? 'error' : 'warning'" :bordered="false">{{ issueLabel(issue.kind) }}</n-tag>
            <span class="blocker-text">{{ cueText(state.document.scenes.flatMap((scene) => scene.cues).find((cue) => cue.id === issue.cueId) ?? ({} as Cue), freezeLanguage).slice(0, 24) || '（空）' }}</span>
            <n-button size="tiny" quaternary @click="focusIssue(issue)">定位</n-button>
          </div>
        </div>
        <n-input v-model:value="freezeName" placeholder="版本名称" @keyup.enter="confirmFreeze" />
        <div class="dialog-actions">
          <n-button @click="showFreezeModal = false">取消</n-button>
          <n-button type="primary" :disabled="freezeLangCounts[freezeLanguage] > 0" @click="confirmFreeze">冻结并导出</n-button>
        </div>
      </div>
    </n-modal>
  </n-config-provider>
</template>
