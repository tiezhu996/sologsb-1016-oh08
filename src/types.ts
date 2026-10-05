export type CueKind = 'dialogue' | 'sfx' | 'transition'
export type Rate = 0.8 | 0.9 | 1 | 1.1 | 1.2

/** 语种：普通话是主语言（场次、顺序与引用以它为准），粤语是译配语言。 */
export type LangCode = 'zh-CN' | 'zh-HK'

/** 落库的复核状态；“未翻译 / 已过期”由来源指纹实时派生，不需要存储。 */
export type ReviewStatus = 'reviewed' | 'unreviewed'

export interface Character {
  id: string
  name: string
  voiceActor: string
  color: string
}

export interface SoundEffect {
  id: string
  name: string
  duration: number
  source: string
  note: string
}

/** 单语言译配稿：文本 + 复核状态 + 所依据原文的指纹。 */
export interface CueLocalization {
  text: string
  status: ReviewStatus
  /** 最近一次保存/复核时主语言来源（原文、类型、角色、音效引用）的指纹。 */
  basis: string
  reviewedAt?: string
}

export interface Cue {
  id: string
  kind: CueKind
  characterId?: string
  /** 表演与制作指令跨语言共用；台词/音效/转场的文字内容按语言存放。 */
  emotion: string
  rate: Rate
  soundEffectId?: string
  transition: string
  manualDuration?: number
  localizations: Partial<Record<LangCode, CueLocalization>>
}

export interface Scene {
  id: string
  code: string
  title: string
  location: string
  timeOfDay: string
  transition: string
  durationLimit: number
  cues: Cue[]
}

export interface StudioDocument {
  title: string
  subtitle: string
  targetDuration: number
  characters: Character[]
  soundEffects: SoundEffect[]
  scenes: Scene[]
}

export interface PendingChange {
  id: string
  label: string
  createdAt: string
  status: 'pending' | 'accepted' | 'rejected'
  /** 该次修改属于哪条语言轨道；结构类修改一律记入普通话主轨。 */
  language: LangCode
  before: StudioDocument
  after: StudioDocument
  note: string
}

export interface FrozenVersion {
  id: string
  name: string
  createdAt: string
  /** 这份制作稿导出的语言版本。 */
  language: LangCode
  document: StudioDocument
  totalDuration: number
}

export interface StudioState {
  schemaVersion: number
  document: StudioDocument
  pending: PendingChange[]
  frozen: FrozenVersion[]
  /** 语言切换只影响编辑视图，选择会随草稿记住。 */
  activeLanguage: LangCode
  updatedAt: string
}

export type LocalizationIssueKind = 'missing' | 'stale' | 'unreviewed'

export interface LocalizationIssue {
  sceneId: string
  cueId: string
  kind: LocalizationIssueKind
}

export interface WarningItem {
  id: string
  type: 'collision' | 'missing-sfx' | 'over-time'
  level: 'error' | 'warning'
  sceneId: string
  cueId?: string
  title: string
  detail: string
}
