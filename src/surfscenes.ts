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
// the dark. The two task fields are what step 1 actually walks somebody
// through — a thing for the hands and a thing for the body — rather than the
// three passive suggestions this file used to rotate on screen; see the header
// of src/ui/surf.ts for why that changed. Each one is a `msg()` so
// test/i18n.test.ts's guard finds it and
// src/i18n/en.ts must carry a translation; the caller wraps the value in its
// own per-request `t()` (this module has no translator of its own — one
// isolate serves many requests at once).

import { msg } from './i18n'
import { SURF_SCENE_LEN, type User } from './types'

export type SceneKey = 'lust' | 'feed' | 'game' | 'snack' | 'custom'

export const SCENE_KEYS: readonly SceneKey[] = ['lust', 'feed', 'game', 'snack', 'custom']

/**
 * How long segment d runs for a body task that has nothing countable in it.
 * Brushing your teeth is not twenty of anything, so the dot has no beat to
 * keep and the segment is simply ninety seconds long.
 */
const UNCOUNTED_BODY_MS = 90_000

export interface Scene {
  key: SceneKey
  /** The word /surf/setup puts beside the radio. */
  label: string
  /** The one line under 「冲动来了。」 — what this particular urge usually is. */
  opening: string
  /**
   * Segment a, 「手上的事」: one physical errand, ended by the reader tapping
   * 「做完了」 and nothing else. It has to be a thing the hands do away from
   * the phone — the whole point of the segment is that the page is not being
   * looked at while it happens.
   */
  handTask: string
  /**
   * Segment d, 「身体的事」: what the body does while the dot keeps time.
   * Twenty repetitions of something, unless `bodyMs` says otherwise.
   */
  bodyTask: string
  /**
   * How segment d ends. `null` — every scene but one — means twenty beats of
   * the dot rising and falling, two seconds each. A number means "run for
   * exactly this long", for a `bodyTask` with no repetition to count.
   */
  bodyMs: number | null
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
    handTask: msg('去洗手间，用冷水洗脸，回来点一下。'),
    bodyTask: msg('二十个深蹲。'),
    bodyMs: null,
  },
  feed: {
    key: 'feed',
    label: msg('短视频'),
    opening: msg('手指想动，不是你想看。'),
    // Not 「把手机放到另一个房间充电」, which this face used to say: the page
    // saying it IS the phone, and an errand that ends with the phone in
    // another room ends the walk-through too. Face down and out of reach is
    // as far as the hand can be sent while segment b is still to come.
    handTask: msg('把手机反面朝下放到桌子另一头，站起来倒一杯水，回来点一下。'),
    bodyTask: msg('二十个深蹲。'),
    bodyMs: null,
  },
  game: {
    key: 'game',
    label: msg('游戏'),
    opening: msg('想赢的不是你，是上一局。'),
    handTask: msg('去洗个脸，把明天要做的第一件事说出来。'),
    bodyTask: msg('二十个开合跳。'),
    bodyMs: null,
  },
  snack: {
    key: 'snack',
    label: msg('深夜加餐'),
    opening: msg('多半是累，不是饿。'),
    handTask: msg('喝一杯温水，慢慢喝完。'),
    bodyTask: msg('刷牙。'),
    bodyMs: UNCOUNTED_BODY_MS,
  },
  custom: {
    key: 'custom',
    label: msg('其他'),
    opening: msg('它会过去的。'),
    handTask: msg('去洗手间，用冷水洗脸，回来点一下。'),
    bodyTask: msg('二十个深蹲。'),
    bodyMs: null,
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
 * custom scene's own text prefixed with `custom:`, or `''` for an account
 * that never configured one.
 *
 * Deliberately not `sceneOf().label`: the label falls back to 「冲动」 for an
 * unconfigured account, and writing that into the column would make "never
 * chose a scene" indistinguishable from "chose one and called it 冲动".
 *
 * The `custom:` prefix (rather than the bare text) keeps a custom scene whose
 * own words happen to match a preset key — someone typing `feed` as their own
 * trigger — distinguishable in `urges.trigger`/`summarizeUrges` from an
 * account that actually picked the `feed` preset.
 */
export function sceneTrigger(user: Pick<User, 'surf_scene'>): string {
  const raw = typeof user.surf_scene === 'string' ? user.surf_scene.trim() : ''
  if (isPresetKey(raw)) return raw
  const text = customTextOf(raw)
  return text === '' ? '' : `${CUSTOM_PREFIX}${text}`
}

/** Whether this account has been through /surf/setup. */
export function hasScene(user: Pick<User, 'surf_scene'>): boolean {
  return sceneTrigger(user) !== ''
}
