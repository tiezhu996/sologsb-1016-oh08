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
  NSpace,
  NTabPane,
  NTabs,
  NTag
} from 'naive-ui'
import { useStudio } from './useStudio'
import type { Cue, CueKind, Language, LocalizationIssue, LocalizationStatus, Rate, WarningItem } from './types'

const studio = useStudio()
const {
  state,
  activeLanguage,
  selectedSceneId,
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
  resetSample
} = studio

const dragCueId = ref('')
const showFreezeModal = ref(false)
const freezeName = ref('')
const exportLanguage = ref<Language>('mandarin')
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
const localizationStatusMeta: Record<LocalizationStatus, { label: string; type: 'error' | 'warning' | 'success' }> = {
  missing: { label: '缺失', type: 'error' },
  stale: { label: '已过期', type: 'warning' },
  unreviewed: { label: '未复核', type: 'warning' },
  ok: { label: '已复核', type: 'success' }
}
const issueStatusLabel: Record<LocalizationIssue['status'], string> = {
  missing: '缺失',
  stale: '已过期',
  unreviewed: '未复核'
}
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
const isCantonese = computed(() => activeLanguage.value === 'cantonese')
const projectMinutes = computed(() => `${Math.floor(totalDuration.value / 60)}:${String(Math.round(totalDuration.value % 60)).padStart(2, '0')}`)
const pendingCount = computed(() => pendingChanges.value.length)
const warningCount = computed(() => warnings.value.length)
const saveLabel = computed(() => saveState.value === 'saved' ? '已保存到本机' : '正在保存…')

function cueName(cue: Cue) {
  if (cue.kind === 'dialogue') return state.value.document.characters.find((item) => item.id === cue.characterId)?.name ?? '未指定角色'
  if (cue.kind === 'sfx') return state.value.document.soundEffects.find((item) => item.id === cue.soundEffectId)?.name ?? '缺失音效'
  return '转场'
}

function warningTypeLabel(type: WarningItem['type']) {
  if (type === 'collision') return '撞场'
  if (type === 'missing-sfx') return '引用'
  if (type === 'localization') return '译配'
  return '时长'
}

function sceneStatus(sceneId: string) {
  return warnings.value.some((warning) => warning.sceneId === sceneId) ? 'warning' : 'ok'
}

function dropCue(targetId: string) {
  if (!dragCueId.value || !selectedScene.value || isCantonese.value) return
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
  freezeName.value = `制作稿 v${state.value.frozen.length + 1}`
  exportLanguage.value = activeLanguage.value
  showFreezeModal.value = true
}

function confirmFreeze() {
  const version = freeze(freezeName.value)
  if (!version) return
  showFreezeModal.value = false
  downloadVersion(version, exportLanguage.value)
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
  if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown') && selectedScene.value && !isCantonese.value) {
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
          <n-radio-group v-model:value="activeLanguage" size="small" class="language-switch" aria-label="编辑语言">
            <n-radio-button value="mandarin">普通话</n-radio-button>
            <n-radio-button value="cantonese">粤语</n-radio-button>
          </n-radio-group>
          <span class="save-state">{{ saveLabel }}</span>
          <n-button quaternary @click="undo">撤销 ⌘Z</n-button>
          <n-button quaternary @click="redo">重做 ⇧⌘Z</n-button>
          <n-button type="primary" @click="openFreeze">冻结并导出</n-button>
        </div>
      </header>

      <section class="summary-strip">
        <div class="metric">
          <span>预计总时长</span>
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
          <span>待确认 · {{ isCantonese ? '粤语' : '普通话' }}</span><strong class="accent">{{ pendingCount }}</strong>
        </div>
        <div class="metric compact">
          <span>检查项</span><strong :class="{ danger: warningCount }">{{ warningCount }}</strong>
        </div>
      </section>

      <main class="workspace">
        <aside class="scene-sidebar">
          <div class="panel-heading">
            <div>
              <span class="eyebrow">PLAYLIST</span>
              <h2>场次结构</h2>
            </div>
            <n-button circle secondary aria-label="新增场次" :disabled="isCantonese" @click="addScene">＋</n-button>
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
              <span class="scene-duration">{{ durationOfScene(scene).toFixed(0) }}s</span>
            </button>
          </div>
          <div class="sidebar-tip">
            <strong>键盘工作流</strong>
            <span>[ / ] 切换场次</span>
            <span>Alt + ↑ / ↓ 调整顺序</span>
            <span>⌘S 立即保存 · ⌘Z 撤销</span>
          </div>
          <n-button block quaternary @click="resetSample">恢复示例数据</n-button>
        </aside>

        <section v-if="selectedScene" class="editor-column">
          <n-alert v-if="isCantonese" class="language-banner" type="info" :show-icon="false">
            粤语译配视图：只编辑各条台词的粤语译配稿与复核状态，场次结构与提示顺序由普通话版本维护。
            <n-button size="tiny" quaternary @click="activeLanguage = 'mandarin'">切回普通话</n-button>
          </n-alert>

          <div class="scene-title-row">
            <div>
              <span class="eyebrow">SCENE {{ selectedScene.code }}</span>
              <input class="title-input" :value="selectedScene.title" :readonly="isCantonese" aria-label="场次标题" @change="updateScene(selectedScene.id, 'title', ($event.target as HTMLInputElement).value)" />
            </div>
            <div v-if="!isCantonese" class="scene-order-actions">
              <n-button size="small" secondary @click="moveScene(selectedScene.id, -1)">上移</n-button>
              <n-button size="small" secondary @click="moveScene(selectedScene.id, 1)">下移</n-button>
              <n-button size="small" type="error" tertiary @click="deleteScene(selectedScene.id)">删除场次</n-button>
            </div>
          </div>

          <div class="scene-meta-grid">
            <n-form-item label="场次号"><n-input :value="selectedScene.code" :disabled="isCantonese" @update:value="updateScene(selectedScene.id, 'code', $event)" /></n-form-item>
            <n-form-item label="空间"><n-input :value="selectedScene.location" :disabled="isCantonese" @update:value="updateScene(selectedScene.id, 'location', $event)" /></n-form-item>
            <n-form-item label="时间"><n-input :value="selectedScene.timeOfDay" :disabled="isCantonese" @update:value="updateScene(selectedScene.id, 'timeOfDay', $event)" /></n-form-item>
            <n-form-item label="场次限额（秒）"><n-input-number :value="selectedScene.durationLimit" :min="5" :step="5" :disabled="isCantonese" @update:value="updateScene(selectedScene.id, 'durationLimit', $event ?? 0)" /></n-form-item>
            <n-form-item label="场次转场" class="span-2"><n-input :value="selectedScene.transition" :disabled="isCantonese" @update:value="updateScene(selectedScene.id, 'transition', $event)" /></n-form-item>
          </div>

          <div class="timeline-heading">
            <div>
              <span class="eyebrow">TIMELINE</span>
              <h3>台词与声音提示</h3>
            </div>
            <div v-if="!isCantonese" class="add-actions">
              <n-button size="small" type="primary" secondary @click="addCue('dialogue')">＋ 台词</n-button>
              <n-button size="small" secondary @click="addCue('sfx')">＋ 音效</n-button>
              <n-button size="small" secondary @click="addCue('transition')">＋ 转场</n-button>
            </div>
          </div>

          <div class="cue-list">
            <article
              v-for="(cue, index) in selectedScene.cues"
              :key="cue.id"
              class="cue-card"
              :class="[`kind-${cue.kind}`, { dragging: dragCueId === cue.id, locked: isCantonese }]"
              :draggable="!isCantonese"
              @dragstart="dragCueId = cue.id"
              @dragend="dragCueId = ''"
              @dragover.prevent
              @drop="dropCue(cue.id)"
            >
              <div class="cue-grip" title="拖动调整顺序">⋮⋮</div>
              <div class="cue-main">
                <div class="cue-topline">
                  <span class="cue-number">{{ String(index + 1).padStart(2, '0') }}</span>
                  <n-select class="kind-select" size="small" :value="cue.kind" :options="kindOptions" :disabled="isCantonese" @update:value="changeCueKind(cue, $event)" />
                  <n-tag size="small" :bordered="false">{{ cueName(cue) }}</n-tag>
                  <n-tag v-if="isCantonese && cue.kind === 'dialogue'" size="small" :type="localizationStatusMeta[localizationStatus(cue)].type" :bordered="false">
                    粤语 · {{ localizationStatusMeta[localizationStatus(cue)].label }}
                  </n-tag>
                  <span class="duration-pill">{{ durationOfCue(cue).toFixed(1) }}s</span>
                  <n-button v-if="!isCantonese" size="tiny" tertiary type="error" @click="deleteCue(cue.id)">删除</n-button>
                </div>

                <div v-if="cue.kind === 'dialogue'" class="cue-grid">
                  <template v-if="!isCantonese">
                    <n-select :value="cue.characterId" :options="characterOptions" placeholder="选择角色" @update:value="updateCue(cue.id, 'characterId', $event)" />
                    <n-input :value="cue.emotion" placeholder="情绪与表演提示" @update:value="updateCue(cue.id, 'emotion', $event)" />
                    <n-select :value="cue.rate" :options="rateOptions" @update:value="updateCue(cue.id, 'rate', $event)" />
                    <n-input-number :value="cue.manualDuration" clearable placeholder="自动" :min="0.5" :step="0.5" @update:value="updateCue(cue.id, 'manualDuration', $event ?? undefined)">
                      <template #suffix>手动秒</template>
                    </n-input-number>
                    <n-input class="span-4" type="textarea" :autosize="{ minRows: 2, maxRows: 5 }" :value="cue.text" placeholder="普通话原文" @update:value="updateCue(cue.id, 'text', $event)" />
                  </template>
                  <template v-else>
                    <div class="span-4 source-line">
                      <div class="source-meta">
                        <span>普通话原文</span>
                        <span>{{ cue.emotion || '自然' }} · 语速 {{ cue.rate }}</span>
                      </div>
                      <p>{{ cue.text }}</p>
                    </div>
                    <n-input
                      class="span-4"
                      type="textarea"
                      :autosize="{ minRows: 2, maxRows: 5 }"
                      :value="cue.localizations?.cantonese?.text ?? ''"
                      placeholder="填写粤语译配稿"
                      @update:value="updateCueLocalization(cue.id, $event)"
                    />
                    <div class="span-4 localization-bar">
                      <span v-if="localizationStatus(cue) === 'stale'" class="stale-hint">原文或角色、音效引用已变化，旧译稿保留，请核对后重新确认</span>
                      <span v-else-if="localizationStatus(cue) === 'missing'" class="stale-hint">还没有粤语译配稿，可直接补写</span>
                      <span v-else-if="localizationStatus(cue) === 'unreviewed'" class="stale-hint">译配稿已保存，等待复核确认</span>
                      <span v-else class="ok-hint">译配稿已复核，与当前原文一致</span>
                      <n-button
                        size="tiny"
                        type="primary"
                        secondary
                        :disabled="localizationStatus(cue) === 'ok' || localizationStatus(cue) === 'missing'"
                        @click="confirmLocalization(cue.id)"
                      >确认复核</n-button>
                    </div>
                  </template>
                </div>

                <div v-else-if="cue.kind === 'sfx'" class="cue-grid">
                  <n-select :value="cue.soundEffectId" :options="effectOptions" filterable placeholder="选择音效" :disabled="isCantonese" @update:value="updateCue(cue.id, 'soundEffectId', $event)" />
                  <n-input :value="cue.text" placeholder="声音动作说明" :disabled="isCantonese" @update:value="updateCue(cue.id, 'text', $event)" />
                  <n-input-number :value="cue.manualDuration" clearable placeholder="使用素材时长" :min="0.2" :step="0.5" :disabled="isCantonese" @update:value="updateCue(cue.id, 'manualDuration', $event ?? undefined)">
                    <template #suffix>覆盖秒数</template>
                  </n-input-number>
                </div>

                <div v-else class="cue-grid">
                  <n-input :value="cue.transition" placeholder="转场方式" :disabled="isCantonese" @update:value="updateCue(cue.id, 'transition', $event)" />
                  <n-input :value="cue.text" placeholder="转场说明" :disabled="isCantonese" @update:value="updateCue(cue.id, 'text', $event)" />
                  <n-input-number :value="cue.manualDuration" :min="0" :step="0.5" :disabled="isCantonese" @update:value="updateCue(cue.id, 'manualDuration', $event ?? undefined)">
                    <template #suffix>秒</template>
                  </n-input-number>
                </div>
              </div>
            </article>
            <n-empty v-if="!selectedScene.cues.length" description="这场还没有声音提示">
              <template #extra><n-button v-if="!isCantonese" @click="addCue('dialogue')">添加第一条台词</n-button></template>
            </n-empty>
          </div>
        </section>

        <aside class="review-column">
          <div class="review-heading">
            <div>
              <span class="eyebrow">REVIEW DESK</span>
              <h2>导演确认区</h2>
            </div>
            <n-button v-if="pendingCount" size="small" type="primary" secondary @click="acceptAll">全部接受</n-button>
          </div>
          <n-tabs v-model:value="activeRightTab" type="line" animated>
            <n-tab-pane name="warnings" :tab="`检查 ${warningCount}`">
              <div class="review-list">
                <div v-for="warning in warnings" :key="warning.id" class="warning-card" :class="warning.level">
                  <div class="warning-title">
                    <n-tag size="small" :type="warning.level === 'error' ? 'error' : 'warning'" :bordered="false">{{ warningTypeLabel(warning.type) }}</n-tag>
                    <strong>{{ warning.title }}</strong>
                  </div>
                  <p>{{ warning.detail }}</p>
                  <n-button size="tiny" quaternary @click="goToScene(warning.sceneId)">定位到 {{ state.document.scenes.find((scene) => scene.id === warning.sceneId)?.code }}</n-button>
                </div>
                <n-empty v-if="!warnings.length" description="当前没有连续性问题" />
              </div>
            </n-tab-pane>

            <n-tab-pane name="pending" :tab="`待确认 ${pendingCount}`">
              <div class="pending-toolbar">
                <n-alert type="info" :show-icon="false">待确认记录按语言分开保存，当前为{{ isCantonese ? '粤语' : '普通话' }}队列。退回较早记录时，其上方同语言尚未确认的草稿会一并撤销，另一语言的内容不受影响。</n-alert>
              </div>
              <div class="review-list">
                <div v-for="change in pendingChanges" :key="change.id" class="pending-card">
                  <div class="pending-meta">
                    <strong>{{ change.label }}</strong>
                    <n-tag size="tiny" :bordered="false">{{ change.language === 'cantonese' ? '粤语' : '普通话' }}</n-tag>
                    <span>{{ new Date(change.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }}</span>
                  </div>
                  <p v-if="change.note">{{ change.note }}</p>
                  <div class="pending-actions">
                    <n-button size="small" type="primary" @click="acceptChange(change.id)">接受</n-button>
                    <n-button size="small" tertiary type="warning" @click="rejectChange(change.id)">退回</n-button>
                  </div>
                </div>
                <n-empty v-if="!pendingCount" description="当前语言的修改都已确认" />
              </div>
            </n-tab-pane>

            <n-tab-pane name="versions" :tab="`冻结 ${state.frozen.length}`">
              <div class="review-list">
                <div v-for="version in state.frozen" :key="version.id" class="version-card">
                  <div>
                    <strong>{{ version.name }}</strong>
                    <span>{{ new Date(version.createdAt).toLocaleString('zh-CN') }}</span>
                    <small>{{ version.document.scenes.length }} 场 · {{ version.totalDuration.toFixed(1) }} 秒</small>
                  </div>
                  <div class="version-actions">
                    <n-button size="small" type="primary" secondary @click="downloadVersion(version, 'mandarin')">普通话稿</n-button>
                    <n-button size="small" secondary @click="downloadVersion(version, 'cantonese')">粤语稿</n-button>
                  </div>
                </div>
                <n-empty v-if="!state.frozen.length" description="冻结后生成只读制作稿" />
              </div>
            </n-tab-pane>
          </n-tabs>
        </aside>
      </main>
    </div>

    <n-modal v-model:show="showFreezeModal">
      <div class="dialog-card">
        <span class="eyebrow">FREEZE VERSION</span>
        <h2>冻结当前版本</h2>
        <p>冻结会保存一份不可变快照，并立即按所选语言下载纯文本制作稿。当前草稿仍可继续编辑。</p>
        <n-alert v-if="!canFreeze" type="error" :show-icon="false" class="freeze-blockers">
          <strong>还有 {{ localizationIssues.length }} 条粤语译配问题，处理前无法冻结：</strong>
          <ul>
            <li v-for="issue in localizationIssues" :key="issue.id">
              {{ issue.sceneCode }} · {{ issue.characterName }} · {{ issueStatusLabel[issue.status] }} — “{{ issue.sourceText.length > 18 ? issue.sourceText.slice(0, 18) + '…' : issue.sourceText }}”
            </li>
          </ul>
        </n-alert>
        <n-input v-model:value="freezeName" placeholder="版本名称" @keyup.enter="confirmFreeze" />
        <div class="export-language">
          <span>导出语言</span>
          <n-radio-group v-model:value="exportLanguage" size="small">
            <n-radio-button value="mandarin">普通话稿</n-radio-button>
            <n-radio-button value="cantonese">粤语稿</n-radio-button>
          </n-radio-group>
        </div>
        <div class="dialog-actions">
          <n-button @click="showFreezeModal = false">取消</n-button>
          <n-button type="primary" :disabled="!canFreeze" @click="confirmFreeze">冻结并导出</n-button>
        </div>
      </div>
    </n-modal>
  </n-config-provider>
</template>
