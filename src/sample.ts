import { cueBasis } from './i18n'
import type { Cue, StudioDocument } from './types'

/** 构造示例提示：示例不再有 cue.text 字段，文字全部来自 localizations。 */
type CueDraft = Omit<Cue, 'text'>

function cue(c: CueDraft): Cue {
  const built = c as Cue
  // 示例里的普通话与粤语译稿都视为已复核，指纹与当前原文一致。
  const resolvedBasis = cueBasis(built)
  for (const loc of Object.values(built.localizations)) {
    if (loc) loc.basis = resolvedBasis
  }
  return built
}

export const sampleDocument: StudioDocument = {
  title: '雾港来信',
  subtitle: '三幕广播剧 · 制作草稿',
  targetDuration: 540,
  characters: [
    { id: 'char-lin', name: '林夏', voiceActor: '周岚', color: '#73daca' },
    { id: 'char-gu', name: '顾闻', voiceActor: '陈默', color: '#bb9af7' },
    { id: 'char-landlord', name: '房东', voiceActor: '周岚', color: '#ff9e64' }
  ],
  soundEffects: [
    { id: 'fx-rain', name: '港区夜雨', duration: 8, source: 'SFX/RAIN_NIGHT_03.wav', note: '远雨，低频' },
    { id: 'fx-bell', name: '旧式电话铃', duration: 3.5, source: 'SFX/BELL_OLD_02.wav', note: '两短一长' },
    { id: 'fx-door', name: '木门合拢', duration: 2.2, source: 'SFX/DOOR_WOOD_11.wav', note: '带门闩声' },
    { id: 'fx-steps', name: '码头脚步', duration: 4.5, source: 'SFX/STEPS_DOCK_01.wav', note: '潮湿石地' }
  ],
  scenes: [
    {
      id: 'scene-1', code: 'S01', title: '雨夜来客', location: '旧港公寓 302', timeOfDay: '深夜', transition: '冷开场 · 雨声渐入', durationLimit: 150,
      cues: [
        cue({
          id: 'cue-1-1', kind: 'sfx', emotion: '', rate: 1, soundEffectId: 'fx-rain', transition: '', manualDuration: 8,
          localizations: {
            'zh-CN': { text: '雨点落在铁皮窗檐上', basis: '', status: 'reviewed', reviewedAt: '2026-09-01T02:00:00.000Z' },
            'zh-HK': { text: '雨點打落鐵皮窗檐度', basis: '', status: 'reviewed', reviewedAt: '2026-09-02T02:00:00.000Z' }
          }
        }),
        cue({
          id: 'cue-1-2', kind: 'dialogue', characterId: 'char-lin', emotion: '警觉 / 压低音量', rate: 0.9, transition: '',
          localizations: {
            'zh-CN': { text: '顾闻？你怎么会在这个时间回来。', basis: '', status: 'reviewed', reviewedAt: '2026-09-01T02:00:00.000Z' },
            'zh-HK': { text: '顧聞？你點會喺呢個時間返嚟㗎。', basis: '', status: 'reviewed', reviewedAt: '2026-09-02T02:00:00.000Z' }
          }
        }),
        cue({
          id: 'cue-1-3', kind: 'dialogue', characterId: 'char-gu', emotion: '疲惫 / 克制', rate: 0.95 as 1, transition: '',
          localizations: {
            'zh-CN': { text: '船晚点了。楼下有人说，这几天一直有人在找你。', basis: '', status: 'reviewed', reviewedAt: '2026-09-01T02:00:00.000Z' },
            'zh-HK': { text: '船遲咗。樓下有人話，呢幾日一直有人喺度搵你。', basis: '', status: 'reviewed', reviewedAt: '2026-09-02T02:00:00.000Z' }
          }
        }),
        cue({
          id: 'cue-1-4', kind: 'sfx', emotion: '', rate: 1, soundEffectId: 'fx-bell', transition: '', manualDuration: 3.5,
          localizations: {
            'zh-CN': { text: '远处电话铃穿过走廊', basis: '', status: 'reviewed', reviewedAt: '2026-09-01T02:00:00.000Z' },
            'zh-HK': { text: '遠處電話鈴聲穿過走廊', basis: '', status: 'reviewed', reviewedAt: '2026-09-02T02:00:00.000Z' }
          }
        }),
        cue({
          id: 'cue-1-5', kind: 'dialogue', characterId: 'char-landlord', emotion: '急促 / 隔门', rate: 1.1, transition: '',
          localizations: {
            'zh-CN': { text: '小林，电话！对方不肯留名字。', basis: '', status: 'reviewed', reviewedAt: '2026-09-01T02:00:00.000Z' },
            'zh-HK': { text: '阿林，電話！對方唔肯留名。', basis: '', status: 'reviewed', reviewedAt: '2026-09-02T02:00:00.000Z' }
          }
        }),
        cue({
          id: 'cue-1-6', kind: 'transition', emotion: '', rate: 1, transition: '十字淡出', manualDuration: 4,
          localizations: {
            'zh-CN': { text: '电话声切黑', basis: '', status: 'reviewed', reviewedAt: '2026-09-01T02:00:00.000Z' },
            'zh-HK': { text: '電話聲切黑', basis: '', status: 'reviewed', reviewedAt: '2026-09-02T02:00:00.000Z' }
          }
        })
      ]
    },
    {
      id: 'scene-2', code: 'S02', title: '未接来电', location: '电话亭与码头', timeOfDay: '凌晨', transition: '平行剪辑 · 交叉叠化', durationLimit: 125,
      cues: [
        cue({
          id: 'cue-2-1', kind: 'sfx', emotion: '', rate: 1, soundEffectId: 'fx-steps', transition: '', manualDuration: 6,
          localizations: {
            'zh-CN': { text: '码头潮水与脚步靠近', basis: '', status: 'reviewed', reviewedAt: '2026-09-01T02:00:00.000Z' }
          }
        }),
        cue({
          id: 'cue-2-2', kind: 'dialogue', characterId: 'char-gu', emotion: '冷峻 / 电话滤波', rate: 0.9, transition: '',
          localizations: {
            'zh-CN': { text: '别回头。把信放在第三个电话亭里。', basis: '', status: 'reviewed', reviewedAt: '2026-09-01T02:00:00.000Z' },
            'zh-HK': { text: '唔好回頭。將封信放喺第三個電話亭入面。', basis: '', status: 'reviewed', reviewedAt: '2026-09-02T02:00:00.000Z' }
          }
        }),
        cue({
          id: 'cue-2-3', kind: 'dialogue', characterId: 'char-lin', emotion: '震动 / 强作镇定', rate: 0.9, transition: '',
          localizations: {
            'zh-CN': { text: '那封没有署名的信，是你寄的？', basis: '', status: 'reviewed', reviewedAt: '2026-09-01T02:00:00.000Z' },
            'zh-HK': { text: '封冇署名嘅信，係你寄嘅？', basis: '', status: 'reviewed', reviewedAt: '2026-09-02T02:00:00.000Z' }
          }
        }),
        cue({
          id: 'cue-2-4', kind: 'sfx', emotion: '', rate: 1, soundEffectId: 'fx-missing-siren', transition: '', manualDuration: 7,
          localizations: {
            'zh-CN': { text: '雨幕中未登记的环境声', basis: '', status: 'reviewed', reviewedAt: '2026-09-01T02:00:00.000Z' }
          }
        }),
        cue({
          id: 'cue-2-5', kind: 'transition', emotion: '', rate: 1, transition: '声音先入 · 2 秒后画面切黑', manualDuration: 2,
          localizations: {
            'zh-CN': { text: '警报从远处掠过', basis: '', status: 'reviewed', reviewedAt: '2026-09-01T02:00:00.000Z' }
          }
        })
      ]
    },
    {
      id: 'scene-3', code: 'S03', title: '潮痕', location: '防波堤', timeOfDay: '清晨', transition: '尾声 · 留白', durationLimit: 170,
      cues: [
        cue({
          id: 'cue-3-1', kind: 'dialogue', characterId: 'char-lin', emotion: '疲惫 / 试探', rate: 0.9, transition: '',
          localizations: {
            'zh-CN': { text: '信里只有一张旧船票，还有你的名字。', basis: '', status: 'reviewed', reviewedAt: '2026-09-01T02:00:00.000Z' },
            'zh-HK': { text: '信入面得返一張舊船票，仲有你嘅名。', basis: '', status: 'reviewed', reviewedAt: '2026-09-02T02:00:00.000Z' }
          }
        }),
        cue({
          id: 'cue-3-2', kind: 'dialogue', characterId: 'char-gu', emotion: '克制 / 不安', rate: 0.9, transition: '',
          localizations: {
            'zh-CN': { text: '名字是我写的，船票不是。有人想让我们同时回到这里。', basis: '', status: 'reviewed', reviewedAt: '2026-09-01T02:00:00.000Z' },
            'zh-HK': { text: '名係我寫嘅，船票唔係。有人想我哋一齊返到呢度。', basis: '', status: 'reviewed', reviewedAt: '2026-09-02T02:00:00.000Z' }
          }
        }),
        cue({
          id: 'cue-3-3', kind: 'dialogue', characterId: 'char-landlord', emotion: '犹豫 / 低声', rate: 0.9, transition: '',
          localizations: {
            'zh-CN': { text: '你们要找的人，昨晚已经上船了。', basis: '', status: 'reviewed', reviewedAt: '2026-09-01T02:00:00.000Z' }
          }
        }),
        cue({
          id: 'cue-3-4', kind: 'sfx', emotion: '', rate: 1, soundEffectId: 'fx-door', transition: '', manualDuration: 7,
          localizations: {
            'zh-CN': { text: '木门在风里合拢', basis: '', status: 'reviewed', reviewedAt: '2026-09-01T02:00:00.000Z' },
            'zh-HK': { text: '木門喺風入面合埋', basis: '', status: 'reviewed', reviewedAt: '2026-09-02T02:00:00.000Z' }
          }
        }),
        cue({
          id: 'cue-3-5', kind: 'transition', emotion: '', rate: 1, transition: '长淡出', manualDuration: 5,
          localizations: {
            'zh-CN': { text: '潮声保留至片尾字幕', basis: '', status: 'reviewed', reviewedAt: '2026-09-01T02:00:00.000Z' },
            'zh-HK': { text: '潮聲保留到片尾字幕', basis: '', status: 'reviewed', reviewedAt: '2026-09-02T02:00:00.000Z' }
          }
        })
      ]
    }
  ]
}
