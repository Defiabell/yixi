// The five scenes 「渡」 knows, and how a stored `users.surf_scene` resolves to
// one of them.
//
// This file exists because of one product rule: the page somebody opens with
// an urge already on them offers exactly one interaction, the button that
// starts the flow. No chips, no tags, no options, no typing — choosing costs
// energy, and that energy is what the urge is competing for. So the
// personalisation happens once, at /surf/setup, and every per-scene string the
// flow shows is picked here from what was chosen then.
//
// The copy is written to the same voice as the rest of the face: no praise, no
// lecture, nothing red, and every line short enough to read at arm's length in
// the dark. Each one is a `msg()` so test/i18n.test.ts's guard finds it and
// src/i18n/en.ts must carry a translation; the caller wraps the value in its
// own per-request `t()` (this module has no translator of its own — one
// isolate serves many requests at once).

import { msg } from './i18n'
import { SURF_SCENE_LEN, type User } from './types'

export type SceneKey = 'lust' | 'feed' | 'game' | 'snack' | 'custom'

export const SCENE_KEYS: readonly SceneKey[] = ['lust', 'feed', 'game', 'snack', 'custom']

export interface Scene {
  key: SceneKey
  /** The word /surf/setup puts beside the radio. */
  label: string
  /** The one line under 「冲动来了。」 — what this particular urge usually is. */
  opening: string
  /** The three body exits step 1 rotates through, twenty seconds each. */
  tips: [string, string, string]
}

/**
 * 'custom:' + the reader's own ≤10 characters. A preset is stored as its bare
 * key, so the prefix is what tells the two apart without a second column.
 */
const CUSTOM_PREFIX = 'custom:'

export const SCENES: Record<SceneKey, Scene> = {
  lust: {
    key: 'lust',
    label: msg('色欲'),
    opening: msg('它不是需要，是最近的一种止痛。'),
    tips: [msg('冷水洗脸。'), msg('二十个深蹲。'), msg('出门走五分钟。')],
  },
  feed: {
    key: 'feed',
    label: msg('短视频'),
    opening: msg('手指想动，不是你想看。'),
    tips: [msg('把手机放到另一个房间充电。'), msg('打开一本纸书，看两页。'), msg('站起来，倒一杯水。')],
  },
  game: {
    key: 'game',
    label: msg('游戏'),
    opening: msg('想赢的不是你，是上一局。'),
    tips: [msg('先洗个澡。'), msg('把明天要做的第一件事写下来。'), msg('出门走五分钟。')],
  },
  snack: {
    key: 'snack',
    label: msg('深夜加餐'),
    opening: msg('多半是累，不是饿。'),
    tips: [msg('喝一杯温水。'), msg('刷牙。'), msg('关灯，躺十分钟。')],
  },
  custom: {
    key: 'custom',
    label: msg('其他'),
    opening: msg('它会过去的。'),
    tips: [msg('冷水洗脸。'), msg('二十个深蹲。'), msg('出门走五分钟。')],
  },
}

export function isSceneKey(raw: string): raw is SceneKey {
  return (SCENE_KEYS as readonly string[]).includes(raw)
}

function isPresetKey(raw: string): raw is Exclude<SceneKey, 'custom'> {
  return raw !== 'custom' && isSceneKey(raw)
}

/** The reader's own words behind a `custom:…` value, trimmed and cut to length. */
function customTextOf(raw: string): string {
  if (!raw.startsWith(CUSTOM_PREFIX)) return ''
  return raw.slice(CUSTOM_PREFIX.length).trim().slice(0, SURF_SCENE_LEN)
}

/** What /surf/setup stores for a scene: the bare key, or the prefixed free text. */
export function storedScene(key: SceneKey, custom: string): string {
  return key === 'custom' ? `${CUSTOM_PREFIX}${custom}` : key
}

/**
 * The scene a stored column resolves to, plus the word for it.
 *
 * Permissive on the way in, the same discipline `todayGoalLimit` holds for
 * `today_goals`: NULL, a key we no longer ship, a bare 'custom' with nothing
 * behind it — all of them land on the custom scene's neutral copy rather than
 * throwing or blanking the page. A reader who never opened /surf/setup still
 * gets a whole flow; that is the point of having a default at all.
 *
 * `label` is a zh source string for a preset (translate it with `t()`), and
 * the reader's own untranslatable text for a custom one — `t()` passes an
 * unknown string straight through, so one call site handles both.
 */
export function sceneOf(user: Pick<User, 'surf_scene'>): { scene: Scene; label: string } {
  const raw = typeof user.surf_scene === 'string' ? user.surf_scene.trim() : ''
  if (isPresetKey(raw)) return { scene: SCENES[raw], label: SCENES[raw].label }
  const text = customTextOf(raw)
  return { scene: SCENES.custom, label: text === '' ? msg('冲动') : text }
}

/**
 * What goes into `urges.trigger` when the flow starts: the preset key, or the
 * custom scene's own text, or `''` for an account that never configured one.
 *
 * Deliberately not `sceneOf().label`: the label falls back to 「冲动」 for an
 * unconfigured account, and writing that into the column would make "never
 * chose a scene" indistinguishable from "chose one and called it 冲动".
 */
export function sceneTrigger(user: Pick<User, 'surf_scene'>): string {
  const raw = typeof user.surf_scene === 'string' ? user.surf_scene.trim() : ''
  if (isPresetKey(raw)) return raw
  return customTextOf(raw)
}

/** Whether this account has been through /surf/setup. */
export function hasScene(user: Pick<User, 'surf_scene'>): boolean {
  return sceneTrigger(user) !== ''
}
