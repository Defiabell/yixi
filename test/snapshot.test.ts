import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import worker, { DAILY_CRON } from '../src/index'
import { snapshotDate, snapshotGoalDays, snapshotUser, SNAPSHOT_CRON } from '../src/snapshot'
import {
  createGoal, createTask, listGoalDays, setGoalArchived, setTaskCheckin, setUserTodayGoals, toggleCheckin,
} from '../src/db'

// Fixture date picked far from the real date on purpose, so this file never
// coincidentally passes only because it happens to run on 2031-03-09.
// 2031-03-09 16:00:30 UTC = 2031-03-10 00:00:30 Shanghai → 快照 2031-03-09
const MIDNIGHT = Date.UTC(2031, 2, 9, 16, 0, 30)
const DAY = '2031-03-09'

async function reset(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM goal_task_checkins'),
    env.DB.prepare('DELETE FROM goal_days'),
    env.DB.prepare('DELETE FROM goal_checkins'),
    env.DB.prepare('DELETE FROM goal_tasks'),
    env.DB.prepare('DELETE FROM goals'),
    env.DB.prepare('DELETE FROM users'),
  ])
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, name, token_hash, is_owner, created_at) VALUES (1, 'a', 'h1', 0, 0)"),
    env.DB.prepare("INSERT INTO users (id, name, token_hash, is_owner, created_at) VALUES (2, 'b', 'h2', 0, 0)"),
  ])
}
beforeEach(reset)

describe('snapshotDate', () => {
  it('names the day that just ended', () => {
    expect(snapshotDate(MIDNIGHT)).toBe(DAY)
    expect(snapshotDate(Date.UTC(2031, 2, 9, 4, 0, 0))).toBe(DAY) // 中午跑也是同一天（但中午 cron 不调用它）
  })
  it('names the same day at exactly 16:00:00.000 UTC, the instant the cron itself fires', () => {
    expect(snapshotDate(Date.UTC(2031, 2, 9, 16, 0, 0))).toBe(DAY)
  })
})

describe('snapshotUser', () => {
  it('counts shown as the top three live goals on that day, done among them, and sub-task check-ins that day', async () => {
    const ids = []
    for (const t of ['一', '二', '三', '四']) ids.push(await createGoal(env.DB, { userId: 1, title: t, cue: '', target: '', targetLabel: '', until: null, now: 0 }))
    await toggleCheckin(env.DB, 1, ids[0]!, DAY, 1)
    await toggleCheckin(env.DB, 1, ids[3]!, DAY, 1) // 第四个不在 shown 里，不算 done
    const t = (await createTask(env.DB, { userId: 1, goalId: ids[0]!, title: 'x', now: 0 }))!
    await setTaskCheckin(env.DB, 1, t, DAY, true, Date.UTC(2031, 2, 9, 10, 0))
    expect(await snapshotUser(env.DB, 1, DAY)).toMatchObject({ user_id: 1, date: DAY, shown: 3, done: 1, tasks_done: 1 })
  })

  it('counts check-ins, not finished tasks: the same task on two days is two, and a fourth goal’s task still counts', async () => {
    const ids = []
    for (const t of ['一', '二', '三', '四']) ids.push(await createGoal(env.DB, { userId: 1, title: t, cue: '', target: '', targetLabel: '', until: null, now: 0 }))
    const t1 = (await createTask(env.DB, { userId: 1, goalId: ids[0]!, title: 'x', now: 0 }))!
    const t2 = (await createTask(env.DB, { userId: 1, goalId: ids[3]!, title: 'y', now: 0 }))!
    await setTaskCheckin(env.DB, 1, t1, DAY, true, 1)
    await setTaskCheckin(env.DB, 1, t1, '2031-03-10', true, 1) // 第二天的那一次不算进 DAY
    await setTaskCheckin(env.DB, 1, t2, DAY, true, 1)
    expect((await snapshotUser(env.DB, 1, DAY)).tasks_done).toBe(2)
    expect((await snapshotUser(env.DB, 2, DAY)).tasks_done).toBe(0)
  })

  it('judges expiry as of the snapshot day, not today', async () => {
    await createGoal(env.DB, { userId: 1, title: '过期', cue: '', target: '', targetLabel: '', until: '2031-03-08', now: 0 })
    await createGoal(env.DB, { userId: 1, title: '活', cue: '', target: '', targetLabel: '', until: '2031-03-09', now: 0 })
    expect((await snapshotUser(env.DB, 1, DAY)).shown).toBe(1)
  })
  it('ignores archived goals', async () => {
    const a = await createGoal(env.DB, { userId: 1, title: 'a', cue: '', target: '', targetLabel: '', until: null, now: 0 })
    await createGoal(env.DB, { userId: 1, title: 'b', cue: '', target: '', targetLabel: '', until: null, now: 0 })
    await setGoalArchived(env.DB, 1, a, 1)
    expect((await snapshotUser(env.DB, 1, DAY)).shown).toBe(1)
  })

  // The snapshot has to read the same limit /today rendered against, or
  // goal_days.shown records a denominator the page never put on screen.
  it('counts shown against the user’s own card limit, per user', async () => {
    const ids = []
    for (const t of ['一', '二', '三', '四', '五']) {
      ids.push(await createGoal(env.DB, { userId: 1, title: t, cue: '', target: '', targetLabel: '', until: null, now: 0 }))
      await createGoal(env.DB, { userId: 2, title: t, cue: '', target: '', targetLabel: '', until: null, now: 0 })
    }
    await setUserTodayGoals(env.DB, 1, 1)
    await toggleCheckin(env.DB, 1, ids[0]!, DAY, 1)
    await toggleCheckin(env.DB, 1, ids[1]!, DAY, 1) // 第二个已经不在 shown 里了
    expect(await snapshotUser(env.DB, 1, DAY)).toMatchObject({ shown: 1, done: 1 })
    // 另一个用户没设过，还是默认的三个——两人各按各的数。
    expect((await snapshotUser(env.DB, 2, DAY)).shown).toBe(3)
  })
})

describe('snapshotGoalDays', () => {
  it('writes one row per user with live goals, is idempotent, and skips users without goals', async () => {
    await createGoal(env.DB, { userId: 1, title: 'a', cue: '', target: '', targetLabel: '', until: null, now: 0 })
    const r1 = await snapshotGoalDays(env.DB, MIDNIGHT)
    expect(r1).toEqual({ date: DAY, users: 1, failed: 0 })
    const r2 = await snapshotGoalDays(env.DB, MIDNIGHT)
    expect(r2.users).toBe(1)
    expect(await listGoalDays(env.DB, 1, DAY, DAY)).toHaveLength(1)
    expect(await listGoalDays(env.DB, 2, DAY, DAY)).toEqual([])
  })
})

describe('scheduled()', () => {
  const NOON = Date.UTC(2031, 2, 9, 4, 0)
  const ev = (cron: string, scheduledTime: number) => ({ cron, scheduledTime, noRetry() {} }) as unknown as ScheduledController

  async function seed() {
    await createGoal(env.DB, { userId: 1, title: 'a', cue: '', target: '', targetLabel: '', until: null, now: 0 })
    await env.DB.prepare("INSERT INTO sessions (sid, user_id, app, created_at) VALUES ('stale', 1, 'x', 0)").run()
  }
  async function staleExists() {
    return Boolean(await env.DB.prepare("SELECT sid FROM sessions WHERE sid = 'stale'").first())
  }

  it.each([DAILY_CRON, '0 4 * * *'])('trims only at noon with %s', async (cron) => {
    await seed()
    await worker.scheduled(ev(cron, NOON), env, {} as ExecutionContext)
    expect(await staleExists()).toBe(false)
    expect(await listGoalDays(env.DB, 1, DAY, DAY)).toEqual([])
  })

  it.each([DAILY_CRON, SNAPSHOT_CRON])('snapshots only at midnight with %s using scheduled time', async (cron) => {
    await seed()
    // This fixture is far from wall-clock time: late execution must retain
    // the date from scheduledTime instead of selecting today's date/job.
    await worker.scheduled(ev(cron, MIDNIGHT), env, {} as ExecutionContext)
    expect(await staleExists()).toBe(true)
    expect(await listGoalDays(env.DB, 1, DAY, DAY)).toHaveLength(1)
    await worker.scheduled(ev(cron, MIDNIGHT), env, {} as ExecutionContext)
    expect(await listGoalDays(env.DB, 1, DAY, DAY)).toHaveLength(1)
  })

  it.each([
    ['* * * * *', NOON],
    [DAILY_CRON, Date.UTC(2031, 2, 9, 5, 0)],
    [DAILY_CRON, Date.UTC(2031, 2, 9, 16, 1)],
    [DAILY_CRON, Number.NaN],
    ['0 4 * * *', MIDNIGHT],
    [SNAPSHOT_CRON, NOON],
  ])('rejects unexpected trigger %s at %s without writes', async (cron, time) => {
    await seed()
    await expect(worker.scheduled(ev(cron, time), env, {} as ExecutionContext))
      .rejects.toThrow('Unexpected scheduled trigger or time')
    expect(await staleExists()).toBe(true)
    expect(await listGoalDays(env.DB, 1, DAY, DAY)).toEqual([])
  })
})
