import type { Cue, CueLocalization, Language, LocalizationStatus } from './types'

export const LANGUAGE_LABELS: Record<Language, string> = {
  mandarin: '普通话',
  cantonese: '粤语'
}

/**
 * 源签名：台词原文、角色或音效引用任一变化都会让已有译配稿过期。
 * 过期只标记状态，译配稿本身始终保留。
 */
export function cueSignature(cue: Pick<Cue, 'kind' | 'text' | 'characterId' | 'soundEffectId'>): string {
  return [cue.kind, cue.text, cue.characterId ?? '', cue.soundEffectId ?? ''].join('␟')
}

export function makeLocalization(cue: Cue, text: string, reviewed: boolean): CueLocalization {
  return {
    text,
    reviewed,
    sourceSignature: cueSignature(cue),
    updatedAt: new Date().toISOString()
  }
}

export function localizationStatus(cue: Cue): LocalizationStatus {
  if (cue.kind !== 'dialogue') return 'ok'
  const localization = cue.localizations?.cantonese
  if (!localization || !localization.text.trim()) return 'missing'
  if (localization.sourceSignature !== cueSignature(cue)) return 'stale'
  if (!localization.reviewed) return 'unreviewed'
  return 'ok'
}
