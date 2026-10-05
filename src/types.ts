export type CueKind = 'dialogue' | 'sfx' | 'transition'
export type Rate = 0.8 | 0.9 | 1 | 1.1 | 1.2
export type Language = 'mandarin' | 'cantonese'
export type LocalizationLanguage = Exclude<Language, 'mandarin'>

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

export interface CueLocalization {
  text: string
  reviewed: boolean
  /** 译配稿最后确认时对应的源签名，用于判断原文或引用变化后是否过期 */
  sourceSignature: string
  updatedAt: string
}

export interface Cue {
  id: string
  kind: CueKind
  characterId?: string
  /** 普通话原文，同时作为其它语言译配的源文本 */
  text: string
  emotion: string
  rate: Rate
  soundEffectId?: string
  transition: string
  manualDuration?: number
  /** 各语言译配稿与复核状态，按语言分别保存 */
  localizations?: Partial<Record<LocalizationLanguage, CueLocalization>>
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
  /** 该修改所属的语言队列；普通话队列管住场次结构与提示顺序 */
  language: Language
  createdAt: string
  status: 'pending' | 'accepted' | 'rejected'
  before: StudioDocument
  after: StudioDocument
  note: string
}

export interface FrozenVersion {
  id: string
  name: string
  createdAt: string
  document: StudioDocument
  totalDuration: number
}

export interface StudioState {
  document: StudioDocument
  pending: PendingChange[]
  frozen: FrozenVersion[]
  updatedAt: string
}

export type LocalizationStatus = 'missing' | 'stale' | 'unreviewed' | 'ok'

export interface LocalizationIssue {
  id: string
  sceneId: string
  cueId: string
  status: Exclude<LocalizationStatus, 'ok'>
  sceneCode: string
  characterName: string
  sourceText: string
}

export interface WarningItem {
  id: string
  type: 'collision' | 'missing-sfx' | 'over-time' | 'localization'
  level: 'error' | 'warning'
  sceneId: string
  cueId?: string
  title: string
  detail: string
}
