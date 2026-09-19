// /surf/review — the 30-day look-back over urges recorded through /surf.
// Read-only, server-rendered, zero client JS: every assertion below reads
// the HTML `renderSurfReview` returns, never a client-side script.

import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderSurfReview } from '../src/ui/surfreview'
import { createUrge, finishUrge } from '../src/urges'
import { shanghaiDate } from '../src/db'
import { addDays, monthDay } from '../src/dates'
import type { User } from '../src/types'

const BASE = 'https://yixi.example.workers.dev'
const NOW = Date.now()
const TODAY = shanghaiDate(NOW)

const user: User = { id: 1, name: '张三', is_owner: 0, created_at: 0 }
const other: User = { id: 2, name: '李四', is_owner: 0, created_at: 0 }

/** Epoch ms for a Shanghai-local date + time, same idiom as progress.test.ts. */
function tsAt(date: string, time = '09:00:00'): number {
  return Date.parse(`${date}T${time}+08:00`)
}

async function reset(): Promise<void> {
  await env.DB.batch([env.DB.prepare('DELETE FROM urges'), env.DB.prepare('DELETE FROM users')])
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, name, token_hash, is_owner, created_at) VALUES (1, '张三', 'h1', 0, 0)"),
    env.DB.prepare("INSERT INTO users (id, name, token_hash, is_owner, created_at) VALUES (2, '李四', 'h2', 0, 0)"),
  ])
}
beforeEach(reset)

async function render(u: User = user, query = ''): Promise<string> {
  const res = await renderSurfReview(new Request(`${BASE}/surf/review${query}`), env, u)
  expect(res.status).toBe(200)
  return await res.text()
}

function mainOf(html: string): string {
  const m = html.match(/<main>([\s\S]*?)<\/main>/)
  expect(m, 'no <main> found').toBeTruthy()
  return m![1]!
}

/** One row through the same D1 helpers /surf's own POST handler uses. */
async function urge(
  u: { userId: number; state: 'hungry' | 'angry' | 'lonely' | 'tired' | 'none'; trigger: string; date: string; time?: string },
  outcome: 'passed' | 'opened' | null,
): Promise<void> {
  const now = tsAt(u.date, u.time)
  const id = await createUrge(env.DB, { userId: u.userId, state: u.state, trigger: u.trigger, now })
  if (outcome !== null) await finishUrge(env.DB, u.userId, id, outcome, now)
}

describe('empty state', () => {
  it('shows the empty state when nothing was ever recorded', async () => {
    const main = mainOf(await render())
    expect(main).toContain('还没有记录。冲动来的时候，点主屏上的「渡」。')
    expect(main).not.toContain('class="card"')
  })

  it('still renders the shared 渡 nav with 回看 current', async () => {
    const html = await render()
    expect(html).toMatch(/<a href="\/surf\/review" class="on" aria-current="page"/)
  })

  it("does not leak another account's urges into an empty page", async () => {
    await urge({ userId: other.id, state: 'tired', trigger: '', date: TODAY }, 'passed')
    const main = mainOf(await render(user))
    expect(main).toContain('还没有记录。')
  })
})

/**
 * Five days carry data, spread across the 30-day window, chosen so every
 * section of the page has something real to check:
 *
 *   TODAY-29 (oldest day in the window) — 1 passed.                 n1
 *   TODAY-20                            — 1 opened, 1 passed.       n2 op
 *   TODAY-10                            — 3 left unfinished.        n3 uf
 *   TODAY-5 at 23:55 Asia/Shanghai      — 1 passed, crossing the
 *                                         UTC midnight boundary.    n1
 *   TODAY                               — 2 opened, 1 passed,
 *                                         1 unfinished.             n3 op
 *
 * States: tired x5, hungry x3, angry x2, lonely x1, none x0 (must not
 * render). Triggers: a default chip x4, a custom one carrying `<b>` x3 (must
 * come out escaped), and `''` (no trigger picked) x4, which must never reach
 * the triggers card at all.
 */
async function setupScenario(): Promise<void> {
  const CUSTOM = '自定义<b>触发</b>'
  const DEFAULT = '躺床上刷手机'

  await urge({ userId: 1, state: 'tired', trigger: DEFAULT, date: addDays(TODAY, -29) }, 'passed')

  await urge({ userId: 1, state: 'tired', trigger: DEFAULT, date: addDays(TODAY, -20), time: '09:00:00' }, 'opened')
  await urge({ userId: 1, state: 'hungry', trigger: DEFAULT, date: addDays(TODAY, -20), time: '10:00:00' }, 'passed')

  await urge({ userId: 1, state: 'tired', trigger: CUSTOM, date: addDays(TODAY, -10), time: '08:00:00' }, null)
  await urge({ userId: 1, state: 'hungry', trigger: CUSTOM, date: addDays(TODAY, -10), time: '09:00:00' }, null)
  await urge({ userId: 1, state: 'angry', trigger: CUSTOM, date: addDays(TODAY, -10), time: '10:00:00' }, null)

  await urge({ userId: 1, state: 'tired', trigger: DEFAULT, date: addDays(TODAY, -5), time: '23:55:00' }, 'passed')

  await urge({ userId: 1, state: 'lonely', trigger: '', date: TODAY, time: '07:00:00' }, 'opened')
  await urge({ userId: 1, state: 'angry', trigger: '', date: TODAY, time: '08:00:00' }, 'opened')
  await urge({ userId: 1, state: 'hungry', trigger: '', date: TODAY, time: '09:00:00' }, 'passed')
  await urge({ userId: 1, state: 'tired', trigger: '', date: TODAY, time: '10:00:00' }, null)
}

describe('with data', () => {
  it('totals 三十天/过去了/点开了 across every recorded urge, and foots the unfinished count', async () => {
    await setupScenario()
    const main = mainOf(await render())
    expect(main).toContain('三十天 11 次')
    expect(main).toContain('过去了 4')
    expect(main).toContain('点开了 3')
    expect(main).toContain('另有 4 次没走完。')
  })

  it('does not count a row from outside the 30-day window even though listUrgesSince fetches a day of slack beyond it', async () => {
    // TODAY-30 sits one day beyond the oldest day the 30-day window keeps
    // (TODAY-29), but renderSurfReview's own one-day fetch slack
    // (REVIEW_DAYS+1) still hands this row to summarizeUrges — which must
    // still drop it from 三十天/过去了/点开了, not merely from a day dot.
    await urge({ userId: 1, state: 'tired', trigger: '躺床上刷手机', date: addDays(TODAY, -30) }, 'passed')
    await urge({ userId: 1, state: 'hungry', trigger: '', date: TODAY }, 'opened')
    const main = mainOf(await render())
    expect(main).toContain('三十天 1 次')
    expect(main).toContain('过去了 0')
    expect(main).toContain('点开了 1')
  })

  it('omits the unfinished footnote once nothing is unfinished', async () => {
    await urge({ userId: 1, state: 'tired', trigger: '', date: TODAY }, 'passed')
    const main = mainOf(await render())
    expect(main).not.toContain('没走完')
  })

  it('draws 30 day-dots, today rightmost, marked n0-3/op/uf, and attributes a 23:55 urge to its own day not the next', async () => {
    await setupScenario()
    const main = mainOf(await render())
    const dots = main.match(/<i class="d[^"]*">/g) ?? []
    expect(dots).toHaveLength(30)

    const idx = (offset: number) => offset + 29 // days[] runs TODAY-29 .. TODAY, ascending
    expect(dots[idx(-29)]).toBe('<i class="d n1">')
    expect(dots[idx(-20)]).toBe('<i class="d n2 op">')
    expect(dots[idx(-10)]).toBe('<i class="d n3 uf">')
    // The 23:55 Asia/Shanghai urge lands on TODAY-5, not TODAY-4 — proving the
    // day bucket follows shanghaiDate(), not the UTC calendar day.
    expect(dots[idx(-5)]).toBe('<i class="d n1">')
    expect(dots[idx(-4)]).toBe('<i class="d n0">')
    expect(dots[idx(0)]).toBe('<i class="d n3 op">')

    const withData = new Set([idx(-29), idx(-20), idx(-10), idx(-5), idx(0)])
    const blanks = dots.filter((_, i) => !withData.has(i))
    expect(blanks).toHaveLength(25)
    for (const d of blanks) expect(d).toBe('<i class="d n0">')
  })

  it('labels both ends of the 30-day strip with the actual calendar dates', async () => {
    await setupScenario()
    const main = mainOf(await render())
    expect(main).toContain(
      `<div class="daylabels"><span>${monthDay(addDays(TODAY, -29), 'zh')}</span><span>${monthDay(TODAY, 'zh')}</span></div>`,
    )
  })

  it('draws 24 hour bars, height proportional to the busiest hour', async () => {
    await setupScenario()
    const main = mainOf(await render())
    const bars = main.match(/<i class="bar" style="--h:[^"]*">/g) ?? []
    expect(bars).toHaveLength(24)
    // hour 9 carries 4 of the 11 urges — the busiest — so it is the one bar at --h:1.00.
    expect(bars[9]).toBe('<i class="bar" style="--h:1.00">')
    expect(bars[8]).toBe('<i class="bar" style="--h:0.50">')
    expect(bars[10]).toBe('<i class="bar" style="--h:0.75">')
    expect(bars[7]).toBe('<i class="bar" style="--h:0.25">')
    expect(bars[23]).toBe('<i class="bar" style="--h:0.25">')
    const untouched = bars.filter((_, h) => ![7, 8, 9, 10, 23].includes(h))
    for (const b of untouched) expect(b).toBe('<i class="bar" style="--h:0.00">')
  })

  it('lists the five body states, count descending, zero states omitted', async () => {
    await setupScenario()
    const main = mainOf(await render())
    expect(main).toContain('<li><span>累</span><span class="num">5</span></li>')
    expect(main).toContain('<li><span>饿</span><span class="num">3</span></li>')
    expect(main).toContain('<li><span>烦</span><span class="num">2</span></li>')
    expect(main).toContain('<li><span>孤独</span><span class="num">1</span></li>')
    expect(main).not.toContain('都不是')
    // Order: 累 (5) before 饿 (3) before 烦 (2) before 孤独 (1).
    expect(main.indexOf('累')).toBeLessThan(main.indexOf('饿'))
    expect(main.indexOf('饿')).toBeLessThan(main.indexOf('烦'))
    expect(main.indexOf('烦')).toBeLessThan(main.indexOf('孤独'))
  })

  it('lists triggers count descending, escapes free text, and drops the empty (其他) bucket', async () => {
    await setupScenario()
    const main = mainOf(await render())
    expect(main).toContain('<li><span>躺床上刷手机</span><span class="num">4</span></li>')
    expect(main).toContain('<li><span>自定义&lt;b&gt;触发&lt;/b&gt;</span><span class="num">3</span></li>')
    expect(main).not.toContain('<b>触发</b>')
    expect(main.indexOf('躺床上刷手机')).toBeLessThan(main.indexOf('自定义'))
  })

  it('renders in English with no residual Chinese and no Chinese punctuation', async () => {
    // A scenario built only from things that have an English translation —
    // states and the one built-in trigger chip. setupScenario()'s custom
    // trigger ('自定义<b>触发</b>') is deliberately not one of those (an
    // account's own free text is never machine-translated), so it is left
    // out here rather than making this test tolerate residual Chinese.
    await urge({ userId: user.id, state: 'tired', trigger: '躺床上刷手机', date: addDays(TODAY, -1) }, 'passed')
    await urge({ userId: user.id, state: 'hungry', trigger: '', date: TODAY }, 'opened')
    await urge({ userId: user.id, state: 'hungry', trigger: '', date: TODAY }, null)
    const main = mainOf(await render(user, '?lang=en'))
    expect(main).toContain('Surfed 3 times in 30 days')
    expect(main).toContain('Passed 1')
    expect(main).toContain('Opened it 1')
    expect(main).toContain('Another 1 were not finished')
    expect(main).toContain('Lying in bed scrolling')
    expect(main).not.toMatch(/[一-鿿]/)
    expect(main).not.toMatch(/[「」，。！？；：（）]/)
  })

  it('stays calm — no exclamation marks', async () => {
    await setupScenario()
    const main = mainOf(await render())
    expect(main).not.toContain('!')
    expect(main).not.toContain('！')
  })
})
