// D1 CRUD for `urges` (see migrations/0010_urges.sql) plus the pure
// `summarizeUrges` aggregation and the `shanghaiHour` / scene helpers it and
// the rest of /surf depend on. Same reset() shape as test/goals-db.test.ts:
// two users, everything scoped by user_id.

import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { shanghaiHour } from '../src/dates'
import { getUserById, shanghaiDate } from '../src/db'
import {
  bumpUrgeRound,
  createUrge,
  finishUrge,
  getUrge,
  listUrgesSince,
  setUserSurfScene,
  summarizeUrges,
} from '../src/urges'
import { SCENES, hasScene, sceneOf, sceneTrigger, storedScene } from '../src/surfscenes'
import type { Urge } from '../src/types'

const NOW = 1_800_000_000_000

async function reset(): Promise<void> {
  await env.DB.batch([env.DB.prepare('DELETE FROM urges'), env.DB.prepare('DELETE FROM users')])
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, name, token_hash, is_owner, created_at) VALUES (1, 'a', 'h1', 0, 0)"),
    env.DB.prepare("INSERT INTO users (id, name, token_hash, is_owner, created_at) VALUES (2, 'b', 'h2', 0, 0)"),
  ])
}
beforeEach(reset)

async function sceneColumns(userId: number): Promise<{ scene: string | null; line: string | null }> {
  const row = await env.DB.prepare('SELECT surf_scene, surf_line FROM users WHERE id = ?1').bind(userId).first<{
    surf_scene: string | null
    surf_line: string | null
  }>()
  return { scene: row ? row.surf_scene : null, line: row ? row.surf_line : null }
}

/** A full Urge fixture for summarizeUrges tests, which never touch D1. */
function makeUrge(overrides: Partial<Urge>): Urge {
  return {
    id: 0,
    user_id: 1,
    started_at: NOW,
    ended_at: null,
    outcome: null,
    state: '',
    trigger: '',
    rounds: 1,
    note: '',
    ...overrides,
  }
}

describe('createUrge', () => {
  it('assigns increasing ids, starts at round 1, and leaves outcome/ended_at unset', async () => {
    const a = await createUrge(env.DB, { userId: 1, state: 'hungry', trigger: '躺床上刷手机', now: NOW })
    const b = await createUrge(env.DB, { userId: 1, state: 'none', trigger: '', now: NOW + 1 })
    expect(b).toBeGreaterThan(a)
    const row = await getUrge(env.DB, 1, a)
    expect(row).toMatchObject({
      id: a,
      user_id: 1,
      started_at: NOW,
      ended_at: null,
      outcome: null,
      state: 'hungry',
      trigger: '躺床上刷手机',
      rounds: 1,
      note: '',
    })
  })
})

describe('getUrge', () => {
  it('never returns another user’s row', async () => {
    const id = await createUrge(env.DB, { userId: 1, state: '', trigger: '', now: NOW })
    expect(await getUrge(env.DB, 2, id)).toBeNull()
    expect(await getUrge(env.DB, 1, id)).not.toBeNull()
  })
})

describe('bumpUrgeRound', () => {
  it('only bumps the owner’s row', async () => {
    const id = await createUrge(env.DB, { userId: 1, state: '', trigger: '', now: NOW })
    expect(await bumpUrgeRound(env.DB, 2, id)).toBe(false)
    expect((await getUrge(env.DB, 1, id))!.rounds).toBe(1)
    expect(await bumpUrgeRound(env.DB, 1, id)).toBe(true)
    expect((await getUrge(env.DB, 1, id))!.rounds).toBe(2)
  })
})

describe('finishUrge', () => {
  it('writes outcome + ended_at once, refuses another user, and is a one-way latch', async () => {
    const id = await createUrge(env.DB, { userId: 1, state: '', trigger: '', now: NOW })

    // Another user's id: no row touched.
    expect(await finishUrge(env.DB, 2, id, 'passed', NOW + 1)).toBe(false)
    expect((await getUrge(env.DB, 1, id))!.outcome).toBeNull()

    // First finish: succeeds and writes both columns.
    expect(await finishUrge(env.DB, 1, id, 'passed', NOW + 1)).toBe(true)
    expect(await getUrge(env.DB, 1, id)).toMatchObject({ outcome: 'passed', ended_at: NOW + 1 })

    // Second finish, even with a different outcome: reports false, changes nothing.
    expect(await finishUrge(env.DB, 1, id, 'opened', NOW + 2)).toBe(false)
    expect(await getUrge(env.DB, 1, id)).toMatchObject({ outcome: 'passed', ended_at: NOW + 1 })
  })
})

describe('listUrgesSince', () => {
  it('orders by started_at (not insertion order) and returns only the caller’s rows', async () => {
    const later = await createUrge(env.DB, { userId: 1, state: '', trigger: '', now: NOW + 1000 })
    const earlier = await createUrge(env.DB, { userId: 1, state: '', trigger: '', now: NOW })
    await createUrge(env.DB, { userId: 2, state: '', trigger: '', now: NOW })
    expect((await listUrgesSince(env.DB, 1, NOW)).map((r) => r.id)).toEqual([earlier, later])
    expect(await listUrgesSince(env.DB, 2, NOW)).toHaveLength(1)
  })

  it('fromTs is an inclusive lower bound', async () => {
    const a = await createUrge(env.DB, { userId: 1, state: '', trigger: '', now: NOW })
    const b = await createUrge(env.DB, { userId: 1, state: '', trigger: '', now: NOW + 1000 })
    expect((await listUrgesSince(env.DB, 1, NOW)).map((r) => r.id)).toEqual([a, b])
    expect((await listUrgesSince(env.DB, 1, NOW + 1000)).map((r) => r.id)).toEqual([b])
    expect(await listUrgesSince(env.DB, 1, NOW + 1001)).toEqual([])
  })
})

describe('setUserSurfScene', () => {
  it('writes both columns together, and touches no other account', async () => {
    await setUserSurfScene(env.DB, 1, 'feed', '别把今晚也赔进去')
    expect(await sceneColumns(1)).toEqual({ scene: 'feed', line: '别把今晚也赔进去' })
    expect(await sceneColumns(2)).toEqual({ scene: null, line: null })
  })

  it('clears the line when the form came back without one, rather than leaving the old one under a new scene', async () => {
    await setUserSurfScene(env.DB, 1, 'game', '写给那一刻的话')
    await setUserSurfScene(env.DB, 1, 'snack', null)
    expect(await sceneColumns(1)).toEqual({ scene: 'snack', line: null })
  })

  it('round-trips through getUserById, the shape every request-path User read uses', async () => {
    await setUserSurfScene(env.DB, 1, storedScene('custom', '打牌'), null)
    const configured = await getUserById(env.DB, 1)
    expect(configured).not.toBeNull()
    expect(sceneOf(configured!).scene.key).toBe('custom')
    expect(sceneOf(configured!).label).toBe('打牌')
    expect(sceneTrigger(configured!)).toBe('custom:打牌')

    await setUserSurfScene(env.DB, 1, 'lust', null)
    const preset = await getUserById(env.DB, 1)
    expect(sceneOf(preset!).scene).toBe(SCENES.lust)
    expect(sceneTrigger(preset!)).toBe('lust')
  })
})

describe('sceneOf', () => {
  it('falls back to the custom scene for an account that never configured one', () => {
    for (const user of [{ surf_scene: null }, { surf_scene: undefined }, { surf_scene: '' }]) {
      const { scene, label } = sceneOf(user)
      expect(scene).toBe(SCENES.custom)
      // Not the empty string: an unconfigured account still has a word for
      // what this is, and the flow renders whole copy out of it.
      expect(label).toBe('冲动')
      expect(hasScene(user)).toBe(false)
    }
  })

  it('resolves each preset key to its own opening and its two step-1 tasks', () => {
    for (const key of ['lust', 'feed', 'game', 'snack'] as const) {
      const { scene, label } = sceneOf({ surf_scene: key })
      expect(scene.key).toBe(key)
      expect(label).toBe(SCENES[key].label)
      expect(scene.opening.length).toBeGreaterThan(0)
      // Segment a's errand and segment d's twenty of something. Both are
      // rendered straight into step 1, so an empty one is a blank screen
      // mid-urge rather than a missing nicety.
      expect(scene.handTask.length, key).toBeGreaterThan(0)
      expect(scene.bodyTask.length, key).toBeGreaterThan(0)
      // Only 深夜加餐 has a body task with nothing countable in it.
      expect(scene.bodyMs, key).toBe(key === 'snack' ? 90_000 : null)
      expect(hasScene({ surf_scene: key })).toBe(true)
    }
    // No two presets open with the same sentence — the whole point of picking.
    const openings = new Set(['lust', 'feed', 'game', 'snack'].map((k) => SCENES[k as 'lust'].opening))
    expect(openings.size).toBe(4)
  })

  it("labels a custom scene with the account's own words and trims the prefix", () => {
    const user = { surf_scene: storedScene('custom', '打牌') }
    expect(user.surf_scene).toBe('custom:打牌')
    expect(sceneOf(user).scene).toBe(SCENES.custom)
    expect(sceneOf(user).label).toBe('打牌')
    // Namespaced, unlike the label: `urges.trigger` has to keep a custom
    // scene apart from a preset key that happens to read the same.
    expect(sceneTrigger(user)).toBe('custom:打牌')
    expect(hasScene(user)).toBe(true)
  })

  it('reads a column it does not recognise as unconfigured rather than throwing', () => {
    // Whatever already made it into the column — a key we no longer ship, a
    // bare 'custom' with nothing behind it, leftover v1 trigger text — has to
    // come back out as a whole page: this is read mid-urge.
    for (const raw of ['gambling', 'custom', 'custom:   ', '躺床上刷手机']) {
      const { scene, label } = sceneOf({ surf_scene: raw })
      expect(scene, raw).toBe(SCENES.custom)
      expect(label, raw).toBe('冲动')
      expect(sceneTrigger({ surf_scene: raw }), raw).toBe('')
      expect(hasScene({ surf_scene: raw }), raw).toBe(false)
    }
  })

  it('cuts custom text at 10 characters, the same limit /surf/setup enforces', () => {
    const long = '一'.repeat(30)
    expect(sceneOf({ surf_scene: `custom:${long}` }).label).toBe(long.slice(0, 10))
    expect(sceneTrigger({ surf_scene: `custom:${long}` })).toBe(`custom:${long.slice(0, 10)}`)
  })
})

describe('shanghaiHour', () => {
  it('is 0 right at Shanghai local midnight (UTC 16:30 the day before)', () => {
    expect(shanghaiHour(Date.UTC(2026, 8, 10, 16, 30))).toBe(0)
  })

  it('is 23 one minute before Shanghai midnight (UTC 15:59)', () => {
    expect(shanghaiHour(Date.UTC(2026, 8, 10, 15, 59))).toBe(23)
  })
})

describe('summarizeUrges', () => {
  it('does not throw on an empty array and zero-fills every day', () => {
    const summary = summarizeUrges([], '2026-09-10', 3)
    expect(summary.days.map((d) => d.date)).toEqual(['2026-09-08', '2026-09-09', '2026-09-10'])
    expect(summary.days.every((d) => d.total === 0 && d.opened === 0 && d.unfinished === 0)).toBe(true)
    expect(summary.hours).toEqual(new Array(24).fill(0))
    expect(summary.total).toBe(0)
    expect(summary.triggers).toEqual([])
  })

  it('always returns exactly `days` entries, ascending, ending on `today`', () => {
    const summary = summarizeUrges([], '2026-09-10', 5)
    expect(summary.days).toHaveLength(5)
    expect(summary.days[summary.days.length - 1]!.date).toBe('2026-09-10')
    expect(summary.days[0]!.date).toBe('2026-09-06')
  })

  it('buckets a Shanghai 23:59 urge and a Shanghai 00:01 urge onto different days', () => {
    const lateNight = Date.UTC(2026, 8, 10, 15, 59) // 2026-09-10 23:59 Shanghai
    const earlyMorning = Date.UTC(2026, 8, 10, 16, 1) // 2026-09-11 00:01 Shanghai
    const rows: Urge[] = [
      makeUrge({ id: 1, started_at: lateNight, outcome: 'passed' }),
      makeUrge({ id: 2, started_at: earlyMorning, outcome: 'passed' }),
    ]
    const summary = summarizeUrges(rows, '2026-09-11', 2)
    const byDate = new Map(summary.days.map((d) => [d.date, d]))
    expect(byDate.get('2026-09-10')).toMatchObject({ total: 1 })
    expect(byDate.get('2026-09-11')).toMatchObject({ total: 1 })
  })

  it('hours[h] counts by the Shanghai hour of started_at, across all rows regardless of day window', () => {
    const rows: Urge[] = [
      makeUrge({ id: 1, started_at: Date.UTC(2026, 8, 10, 15, 59) }), // 23 Shanghai, 2026-09-10
      makeUrge({ id: 2, started_at: Date.UTC(2026, 8, 10, 16, 30) }), // 0 Shanghai, 2026-09-11
    ]
    const summary = summarizeUrges(rows, '2026-09-11', 2)
    expect(summary.hours[23]).toBe(1)
    expect(summary.hours[0]).toBe(1)
    expect(summary.hours.reduce((a, b) => a + b, 0)).toBe(2)
  })

  it('sorts triggers by count desc, ties by dictionary order, caps at 5, and drops the blank trigger', () => {
    const rows: Urge[] = [
      makeUrge({ id: 1, trigger: 'b' }),
      makeUrge({ id: 2, trigger: 'b' }),
      makeUrge({ id: 3, trigger: 'a' }),
      makeUrge({ id: 4, trigger: 'a' }),
      makeUrge({ id: 5, trigger: 'c' }),
      makeUrge({ id: 6, trigger: 'd' }),
      makeUrge({ id: 7, trigger: 'e' }),
      makeUrge({ id: 8, trigger: 'f' }),
      makeUrge({ id: 9, trigger: '' }),
    ]
    // `today` has to be the row's own Shanghai date (every row here defaults
    // to `started_at: NOW`) now that summarizeUrges drops an out-of-window
    // row from the trigger tally entirely rather than just its day bucket.
    const summary = summarizeUrges(rows, shanghaiDate(NOW), 1)
    expect(summary.triggers).toEqual([
      { trigger: 'a', count: 2 },
      { trigger: 'b', count: 2 },
      { trigger: 'c', count: 1 },
      { trigger: 'd', count: 1 },
      { trigger: 'e', count: 1 },
    ])
  })

  it('drops a row outside the window from every aggregate, not only the day buckets', () => {
    // days=3 keeps ['2026-09-08', '2026-09-09', '2026-09-10']; a row on
    // today - days ('2026-09-07') is exactly one day short of that window —
    // still returned by a listUrgesSince fetched with a wider fromTs, and
    // must count toward nothing here: not total/passed/opened/unfinished,
    // not hours, not states, not triggers.
    const outside = makeUrge({
      id: 1,
      started_at: Date.UTC(2026, 8, 7, 4, 0), // 2026-09-07 noon Shanghai
      outcome: 'passed',
      state: 'hungry',
      trigger: 'outside-trigger',
    })
    const inside = makeUrge({
      id: 2,
      started_at: Date.UTC(2026, 8, 9, 4, 0), // 2026-09-09 noon Shanghai — inside the window
      outcome: 'opened',
      state: 'angry',
      trigger: 'inside-trigger',
    })
    const summary = summarizeUrges([outside, inside], '2026-09-10', 3)

    expect(summary.total).toBe(1)
    expect(summary.passed).toBe(0)
    expect(summary.opened).toBe(1)
    expect(summary.unfinished).toBe(0)
    expect(summary.hours.reduce((a, b) => a + b, 0)).toBe(1)
    expect(summary.states).toEqual({ hungry: 0, angry: 1, lonely: 0, tired: 0, none: 0, '': 0 })
    expect(summary.triggers).toEqual([{ trigger: 'inside-trigger', count: 1 }])
    const byDate = new Map(summary.days.map((d) => [d.date, d]))
    expect(byDate.get('2026-09-08')).toMatchObject({ total: 0 })
    expect(byDate.get('2026-09-09')).toMatchObject({ total: 1 })
  })

  it('unfinished counts exactly the rows with outcome === null', () => {
    const sameDay = Date.UTC(2026, 8, 10, 4, 0) // 2026-09-10 noon Shanghai
    const rows: Urge[] = [
      makeUrge({ id: 1, started_at: sameDay, outcome: null }),
      makeUrge({ id: 2, started_at: sameDay, outcome: 'passed' }),
      makeUrge({ id: 3, started_at: sameDay, outcome: 'opened' }),
    ]
    const summary = summarizeUrges(rows, '2026-09-10', 1)
    expect(summary.total).toBe(3)
    expect(summary.passed).toBe(1)
    expect(summary.opened).toBe(1)
    expect(summary.unfinished).toBe(1)
    expect(summary.days[0]).toMatchObject({ total: 3, opened: 1, unfinished: 1 })
  })
})
