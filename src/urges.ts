/**
 * D1 helpers for `urges` (see migrations/0010_urges.sql) plus the pure
 * aggregation `/surf/review` reads off them. Same conventions as the goals
 * section of src/db.ts: every write carries `WHERE user_id = ?`, and a
 * boolean-returning helper answers from `meta.changes` rather than a second
 * SELECT — the id in the URL is global and never proves ownership by itself.
 *
 * `summarizeUrges` is the one export here that touches no D1 binding at all:
 * it takes rows already fetched (by `listUrgesSince`) and turns them into the
 * shape `/surf/review` renders, so a day boundary or an hour bucket can be
 * covered by a plain unit test instead of a database round trip.
 */

import { shanghaiDate } from './db'
import { addDays, shanghaiHour } from './dates'
import type { Urge, UrgeOutcome, UrgeState } from './types'

export async function createUrge(
  db: D1Database,
  u: { userId: number; state: UrgeState | ''; trigger: string; now: number },
): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO urges (user_id, started_at, state, trigger, rounds, note)
       VALUES (?1, ?2, ?3, ?4, 1, '')`,
    )
    .bind(u.userId, u.now, u.state, u.trigger)
    .run()
  return Number(res.meta.last_row_id)
}

export async function bumpUrgeRound(db: D1Database, userId: number, id: number): Promise<boolean> {
  const res = await db
    .prepare('UPDATE urges SET rounds = rounds + 1 WHERE user_id = ?1 AND id = ?2')
    .bind(userId, id)
    .run()
  return (res.meta.changes ?? 0) > 0
}

/**
 * `outcome` moves from NULL to a value exactly once — the `outcome IS NULL`
 * guard is that concurrency check, the same shape as `email IS NULL` on
 * account claiming in src/db.ts. A second `finish` (even with a different
 * outcome) changes nothing and returns false; the caller still answers the
 * request with 200, because a page that was already closed once the first
 * finish landed has no way to know that, and treating its retry as an error
 * would show the person a failure for a step that already succeeded.
 */
export async function finishUrge(
  db: D1Database,
  userId: number,
  id: number,
  outcome: UrgeOutcome,
  now: number,
): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE urges SET outcome = ?3, ended_at = ?4
       WHERE user_id = ?1 AND id = ?2 AND outcome IS NULL`,
    )
    .bind(userId, id, outcome, now)
    .run()
  return (res.meta.changes ?? 0) > 0
}

export async function setUrgeNote(db: D1Database, userId: number, id: number, note: string): Promise<boolean> {
  const res = await db
    .prepare('UPDATE urges SET note = ?3 WHERE user_id = ?1 AND id = ?2')
    .bind(userId, id, note)
    .run()
  return (res.meta.changes ?? 0) > 0
}

export async function getUrge(db: D1Database, userId: number, id: number): Promise<Urge | null> {
  return await db
    .prepare(
      `SELECT id, user_id, started_at, ended_at, outcome, state, trigger, rounds, note
       FROM urges WHERE user_id = ?1 AND id = ?2`,
    )
    .bind(userId, id)
    .first<Urge>()
}

/** `fromTs` 是闭区间下界；结果按 `started_at` 升序，与回看页画图需要的顺序一致。 */
export async function listUrgesSince(db: D1Database, userId: number, fromTs: number): Promise<Urge[]> {
  const res = await db
    .prepare(
      `SELECT id, user_id, started_at, ended_at, outcome, state, trigger, rounds, note
       FROM urges WHERE user_id = ?1 AND started_at >= ?2
       ORDER BY started_at`,
    )
    .bind(userId, fromTs)
    .all<Urge>()
  return res.results
}

/** `raw = null` clears the column back to NULL, i.e. back to the built-in four triggers. */
export async function setUserSurfTriggers(db: D1Database, userId: number, raw: string | null): Promise<void> {
  await db.prepare('UPDATE users SET surf_triggers = ?2 WHERE id = ?1').bind(userId, raw).run()
}

// --- summarizeUrges ----------------------------------------------------------

export interface UrgeDay {
  date: string
  total: number
  opened: number
  unfinished: number
}

export interface UrgeSummary {
  /** 恰好 `days` 天，含今天，按日期升序；`rows` 里没有的日期填零，不是空位。 */
  days: UrgeDay[]
  /** 长度 24，按 `started_at` 的上海小时计数，不分 outcome。 */
  hours: number[]
  states: Record<UrgeState | '', number>
  /** count 降序，同数按 trigger 字典序；最多 5 条；`''`（没选触发场景）不进这张表。 */
  triggers: Array<{ trigger: string; count: number }>
  total: number
  passed: number
  opened: number
  unfinished: number
}

const EMPTY_STATE_COUNTS: Record<UrgeState | '', number> = {
  hungry: 0,
  angry: 0,
  lonely: 0,
  tired: 0,
  none: 0,
  '': 0,
}

/**
 * Pure — no D1 access. `today`/`days` describe the window the same way a
 * caller would ask `listUrgesSince(db, userId, ...)` for it; this function
 * only turns already-fetched rows into the shape `/surf/review` renders, so
 * a day boundary or an hour bucket is a unit test rather than a database
 * round trip.
 */
export function summarizeUrges(rows: Urge[], today: string, days: number): UrgeSummary {
  const byDate = new Map<string, UrgeDay>()
  const dates: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i)
    dates.push(date)
    byDate.set(date, { date, total: 0, opened: 0, unfinished: 0 })
  }

  const hours = new Array<number>(24).fill(0)
  const states: Record<UrgeState | '', number> = { ...EMPTY_STATE_COUNTS }
  const triggerCounts = new Map<string, number>()
  let total = 0
  let passed = 0
  let opened = 0
  let unfinished = 0

  for (const row of rows) {
    // A row outside the [today - (days-1), today] window (an older urge
    // fetched with a wider fromTs than this window needs — /surf/review's
    // own one-day slack is exactly that) is dropped from every aggregate
    // below, not only its day's bucket: this function's whole output must
    // describe exactly the window it was asked for.
    const day = byDate.get(shanghaiDate(row.started_at))
    if (!day) continue

    total++
    if (row.outcome === 'passed') passed++
    else if (row.outcome === 'opened') opened++
    else unfinished++

    day.total++
    if (row.outcome === 'opened') day.opened++
    if (row.outcome === null) day.unfinished++

    const hour = shanghaiHour(row.started_at)
    hours[hour] = (hours[hour] ?? 0) + 1

    states[row.state]++

    if (row.trigger !== '') {
      triggerCounts.set(row.trigger, (triggerCounts.get(row.trigger) ?? 0) + 1)
    }
  }

  const triggers = [...triggerCounts.entries()]
    .map(([trigger, count]) => ({ trigger, count }))
    .sort((a, b) => b.count - a.count || a.trigger.localeCompare(b.trigger))
    .slice(0, 5)

  return {
    days: dates.map((date) => byDate.get(date)!),
    hours,
    states,
    triggers,
    total,
    passed,
    opened,
    unfinished,
  }
}
