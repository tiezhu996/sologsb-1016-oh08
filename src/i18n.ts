import type { Cue, CueLocalization, LangCode, LocalizationIssue, PendingChange, StudioDocument, StudioState } from './types'

/** 普通话是主语言：管住场次结构、提示顺序与角色/音效引用。 */
export const MASTER_LANG: LangCode = 'zh-CN'
export const LANGUAGES: Array<{ value: LangCode; label: string; short: string; scriptLabel: string }> = [
  { value: 'zh-CN', label: '普通话', short: '普', scriptLabel: '普通话制作稿' },
  { value: 'zh-HK', label: '粤语', short: '粤', scriptLabel: '粵語製作稿' }
]

export function langLabel(code: LangCode): string {
  return LANGUAGES.find((item) => item.value === code)?.label ?? code
}

/** FNV-1a 32 位指纹，用于判断译稿依据的原文是否发生变化。 */
export function hashBasis(value: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

/** 参与指纹的来源要素：原文文字、提示类型、角色引用与音效引用。 */
export function cueBasis(cue: Cue): string {
  const master = cue.localizations[MASTER_LANG]
  return hashBasis([master?.text ?? '', cue.kind, cue.characterId ?? '', cue.soundEffectId ?? ''].join(''))
}

export type LocalizationState = 'missing' | 'stale' | 'unreviewed' | 'reviewed'

export const LOC_STATE_META: Record<LocalizationState, { label: string; tagType: 'default' | 'error' | 'warning' | 'success' }> = {
  missing: { label: '未翻译', tagType: 'error' },
  stale: { label: '原文已改 · 待重新确认', tagType: 'warning' },
  unreviewed: { label: '待复核', tagType: 'warning' },
  reviewed: { label: '已复核', tagType: 'success' }
}

/**
 * 派生某语言下一条提示的复核状态：
 * - 译版无文本 → 未翻译；有文本但来源指纹对不上 → 已过期（原译文保留）；
 * - 主语言只区分待复核 / 已复核，过期判断只对译版生效。
 */
export function localizationState(cue: Cue, lang: LangCode): LocalizationState {
  const loc = cue.localizations[lang]
  if (!loc || !loc.text.trim()) return 'missing'
  if (lang !== MASTER_LANG && loc.basis !== cueBasis(cue)) return 'stale'
  return loc.status === 'reviewed' ? 'reviewed' : 'unreviewed'
}

export function cueText(cue: Cue, lang: LangCode): string {
  return cue.localizations[lang]?.text ?? cue.localizations[MASTER_LANG]?.text ?? ''
}

export function makeLocalization(text: string, basis: string, reviewed: boolean, reviewedAt?: string): CueLocalization {
  return { text, basis, status: reviewed ? 'reviewed' : 'unreviewed', ...(reviewedAt ? { reviewedAt } : {}) }
}

export function collectLocalizationIssues(document: StudioDocument, lang: LangCode): LocalizationIssue[] {
  const issues: LocalizationIssue[] = []
  for (const scene of document.scenes) {
    for (const cue of scene.cues) {
      const state = localizationState(cue, lang)
      if (state === 'missing' || state === 'stale' || state === 'unreviewed') {
        issues.push({ sceneId: scene.id, cueId: cue.id, kind: state })
      }
    }
  }
  return issues
}

function ensureCueLocalizations(cue: Cue) {
  if (cue.localizations) return
  // v1 升级：原 text 升级为普通话版本，并视作已按现有原文复核。
  const legacyText = (cue as unknown as { text?: string }).text ?? ''
  cue.localizations = {
    [MASTER_LANG]: { text: legacyText, basis: '', status: 'reviewed', reviewedAt: new Date().toISOString() }
  }
  delete (cue as unknown as { text?: string }).text
}

function migrateDocument(document: StudioDocument) {
  for (const scene of document.scenes) {
    for (const cue of scene.cues) {
      ensureCueLocalizations(cue)
      const master = cue.localizations[MASTER_LANG]
      if (master) master.basis = cueBasis(cue)
    }
  }
}

/** 旧草稿升级：现有文本全部当作普通话版本，待确认与冻结记录补语言归属。 */
export function migrateState(raw: StudioState & { schemaVersion?: number }): StudioState {
  migrateDocument(raw.document)
  for (const change of raw.pending ?? []) {
    const legacy = change as PendingChange & { language?: LangCode }
    if (!legacy.language) legacy.language = MASTER_LANG
    migrateDocument(legacy.before)
    migrateDocument(legacy.after)
  }
  for (const version of raw.frozen ?? []) {
    const legacy = version as StudioState['frozen'][number] & { language?: LangCode }
    if (!legacy.language) legacy.language = MASTER_LANG
    migrateDocument(legacy.document)
  }
  if (!raw.activeLanguage) raw.activeLanguage = MASTER_LANG
  raw.schemaVersion = 2
  return raw
}

/** 判断某次提交是否只改了指定语言的译配文本。 */
export function diffLanguage(before: StudioDocument, after: StudioDocument): LangCode | undefined {
  const collect = (document: StudioDocument) => {
    const map = new Map<string, Partial<Record<LangCode, string>>>()
    for (const scene of document.scenes) {
      for (const cue of scene.cues) {
        map.set(cue.id, {
          'zh-CN': cue.localizations['zh-CN']?.text ?? '',
          'zh-HK': cue.localizations['zh-HK']?.text ?? ''
        })
      }
    }
    return map
  }
  const beforeMap = collect(before)
  const afterMap = collect(after)
  const changed: LangCode[] = []
  for (const [cueId, afterLoc] of afterMap) {
    const beforeLoc = beforeMap.get(cueId) ?? { 'zh-CN': '', 'zh-HK': '' }
    for (const lang of LANGUAGES.map((item) => item.value)) {
      if ((afterLoc[lang] ?? '') !== (beforeLoc[lang] ?? '')) changed.push(lang)
    }
  }
  return changed.length === 1 ? changed[0] : undefined
}
