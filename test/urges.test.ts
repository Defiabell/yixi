// D1 CRUD for `urges` (see migrations/0010_urges.sql) plus the pure
// `summarizeUrges` aggregation and the `shanghaiHour` / `surfTriggers` helpers
// it and the rest of /surf depend on. Same reset() shape as
// test/goals-db.test.ts: two users, everything scoped by user_id.

import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { shanghaiHour } from '../src/dates'
import { getUserById } from '../src/db'
import {
  bumpUrgeRound,
  createUrge,
  finishUrge,
  getUrge,
  listUrgesSince,
  setUrgeNote,
  setUserSurfTriggers,
  summarizeUrges,
} from '../src/urges'
import { DEFAULT_SURF_TRIGGERS, surfTriggers } from '../src/types'
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

async function surfTriggersColumn(userId: number): Promise<string | null> {
  const row = await env.DB.prepare('SELECT surf_triggers FROM users WHERE id = ?1').bind(userId).first<{
    surf_triggers: string | null
  }>()
  return row ? row.surf_triggers : null
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

describe('setUrgeNote', () => {
  it('writes the note for the owner only', async () => {
    const id = await createUrge(env.DB, { userId: 1, state: '', trigger: '', now: NOW })
    expect(await setUrgeNote(env.DB, 2, id, '别人的话')).toBe(false)
    expect((await getUrge(env.DB, 1, id))!.note).toBe('')
    expect(await setUrgeNote(env.DB, 1, id, '下次先做二十个深蹲')).toBe(true)
    expect((await getUrge(env.DB, 1, id))!.note).toBe('下次先做二十个深蹲')
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

describe('setUserSurfTriggers', () => {
  it('writes the raw column, and null resets it to the default (no D1 row for the other user touched)', async () => {
    await setUserSurfTriggers(env.DB, 1, 'a\nb')
    expect(await surfTriggersColumn(1)).toBe('a\nb')
    expect(await surfTriggersColumn(2)).toBeNull()
    expect(surfTriggers({ surf_triggers: await surfTriggersColumn(1) })).toEqual(['a', 'b'])

    await setUserSurfTriggers(env.DB, 1, null)
    expect(await surfTriggersColumn(1)).toBeNull()
    expect(surfTriggers({ surf_triggers: await surfTriggersColumn(1) })).toEqual([...DEFAULT_SURF_TRIGGERS])
  })

  it('round-trips through getUserById, the shape every request-path User read uses', async () => {
    await setUserSurfTriggers(env.DB, 1, '躺床上刷手机\n运动后血糖低')
    const configured = await getUserById(env.DB, 1)
    expect(configured).not.toBeNull()
    expect(surfTriggers(configured!)).toEqual(['躺床上刷手机', '运动后血糖低'])

    await setUserSurfTriggers(env.DB, 1, null)
    const reset = await getUserById(env.DB, 1)
    expect(reset).not.toBeNull()
    expect(surfTriggers(reset!)).toEqual([...DEFAULT_SURF_TRIGGERS])
  })
})

describe('surfTriggers', () => {
  it('falls back to the built-in four when unset', () => {
    expect(surfTriggers({ surf_triggers: null })).toEqual([...DEFAULT_SURF_TRIGGERS])
    expect(surfTriggers({ surf_triggers: undefined })).toEqual([...DEFAULT_SURF_TRIGGERS])
  })

  it('trims whitespace, drops empty lines, and dedupes on the trimmed value', () => {
    expect(surfTriggers({ surf_triggers: 'a\n\n a \nb' })).toEqual(['a', 'b'])
  })

  it('caps at 8 lines', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `场景${i}`)
    expect(surfTriggers({ surf_triggers: lines.join('\n') })).toEqual(lines.slice(0, 8))
  })

  it('truncates a single line at 20 characters', () => {
    const long = '一'.repeat(30)
    expect(surfTriggers({ surf_triggers: long })).toEqual([long.slice(0, 20)])
  })

  it('a blank-only configuration falls back to the default too', () => {
    expect(surfTriggers({ surf_triggers: '   \n\n  ' })).toEqual([...DEFAULT_SURF_TRIGGERS])
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
    const summary = summarizeUrges(rows, '2026-09-10', 1)
    expect(summary.triggers).toEqual([
      { trigger: 'a', count: 2 },
      { trigger: 'b', count: 2 },
      { trigger: 'c', count: 1 },
      { trigger: 'd', count: 1 },
      { trigger: 'e', count: 1 },
    ])
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
