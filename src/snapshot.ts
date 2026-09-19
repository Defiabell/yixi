import { shownGoals } from './dates'
import type { GoalDay } from './types'
import { todayGoalLimit } from './types'
import {
  countTaskCheckinsOn, getUserById, listCheckins, listGoals, listUsersWithLiveGoals, shanghaiDate, upsertGoalDay,
} from './db'

/** Legacy midnight expression, accepted during the combined trigger rollout. */
export const SNAPSHOT_CRON = '0 16 * * *'

/**
 * Which calendar day this cron tick is closing out. The trigger fires at
 * 00:00 Shanghai, a moment after the day it is meant to summarize has already
 * ended, so the snapshot names the day that just finished, not the one that
 * just started: back the clock up a minute before converting.
 */
export function snapshotDate(now: number): string {
  return shanghaiDate(now - 60_000)
}

/**
 * Same selection rule as /today, but pinned to `date` instead of "today" —
 * a cron that always ran with `shanghaiDate(Date.now())` would judge
 * expiry against whatever day it happens to execute on, not the day it is
 * snapshotting. Pure; does not write anything.
 *
 * The user row is read for one column: how many cards /today puts on the page
 * for them. Without it `shown` would be a constant 3 while the page showed
 * five, and the 30-day strip on /today/review would read against a
 * denominator that never existed.
 */
export async function snapshotUser(db: D1Database, userId: number, date: string): Promise<GoalDay> {
  const [goals, user] = await Promise.all([listGoals(db, userId), getUserById(db, userId)])
  const shown = shownGoals(goals, date, todayGoalLimit(user ?? {}))
  const checkins = await listCheckins(db, userId, date, date)
  const done = shown.filter((g) => checkins.some((c) => c.goal_id === g.id)).length
  const tasksDone = await countTaskCheckinsOn(db, userId, date)
  return { user_id: userId, date, shown: shown.length, done, tasks_done: tasksDone, ts: Date.now() }
}

/**
 * One row per user who has a live goal, for the day that just ended. A
 * single user's failure is logged and counted, not thrown — one bad row
 * must not stop everyone else's snapshot from being written.
 */
export async function snapshotGoalDays(
  db: D1Database,
  now: number,
): Promise<{ date: string; users: number; failed: number }> {
  const date = snapshotDate(now)
  const userIds = await listUsersWithLiveGoals(db)
  let users = 0
  let failed = 0
  for (const userId of userIds) {
    try {
      const row = await snapshotUser(db, userId, date)
      await upsertGoalDay(db, row)
      users++
    } catch (err) {
      failed++
      console.error(`snapshot failed for user ${userId}`, err)
    }
  }
  return { date, users, failed }
}
