// 'YYYY-MM-DD' date-string arithmetic shared by /today and /goals. Pure
// functions, no Date.now() inside either of them — every caller supplies
// "today" itself, so tests can pin it and the two pages can never drift on
// what day it is.

import type { Goal } from './types'
import type { Locale } from './i18n'

export function isExpired(goal: Pick<Goal, 'until'>, today: string): boolean {
  return goal.until !== null && goal.until < today
}

/**
 * Non-archived goals not expired as of `date`, in the order they were given.
 * This is the one selection rule /today, /today/review and the midnight
 * snapshot must never drift apart on — it used to be copy-pasted three times
 * (`goals.filter(g => g.archived_at === null && !isExpired(g, date))`), which
 * is exactly the shape of bug where one copy gets fixed and the other two
 * don't.
 */
export function liveGoals<T extends Pick<Goal, 'archived_at' | 'until'>>(goals: T[], date: string): T[] {
  return goals.filter((g) => g.archived_at === null && !isExpired(g, date))
}

/**
 * The first `limit` of `liveGoals` — the exact set /today puts a card on.
 *
 * `limit` is the reader's own setting, `todayGoalLimit(user)` in src/types.ts,
 * and it is required rather than defaulted on purpose. /today, /today/review
 * and the midnight snapshot all have to agree on it, or `goal_days.shown`
 * records a number of cards the page never showed — and a default is exactly
 * how a fifth reader would compile, typecheck and silently record 3 while the
 * page drew 5. Making it mandatory costs one argument and buys a compile error
 * instead of a wrong number in a table that is written once and never rewritten.
 */
export function shownGoals<T extends Pick<Goal, 'archived_at' | 'until'>>(
  goals: T[],
  date: string,
  limit: number,
): T[] {
  return liveGoals(goals, date).slice(0, limit)
}

// --- how a day is written out ------------------------------------------------
//
// Not `Intl.DateTimeFormat`: workerd ships a full ICU, but the two formats the
// design asks for are 「9 月 13 日 · 周日」 and 「Sep 13 · Sunday」, and neither
// is a locale pattern any CLDR skeleton produces — the middot, the omitted
// year and the 周 prefix are this product's own. Two tables and a template are
// shorter than fighting a formatter into that shape, and cannot drift when the
// runtime's ICU data is updated under us.
//
// These tables are the one place in src/ui's neighbourhood where Chinese sits
// outside `t()` on purpose: `prettyDate` is a locale-parameterised function,
// not a translated string, so wrapping 「日」 or 「周」 in a dictionary key that
// no sentence ever uses would only make the guard's job harder to read.

const WEEKDAYS_ZH = ['日', '一', '二', '三', '四', '五', '六']
const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WEEKDAYS_EN_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The weekday of a 'YYYY-MM-DD' date, 0 = Sunday, read in UTC on the parts. */
function weekdayIndex(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** The full weekday name in `loc` — 「周日」 / 「Sunday」. */
export function weekdayName(ymd: string, loc: Locale): string {
  const i = weekdayIndex(ymd)
  return loc === 'en' ? WEEKDAYS_EN[i]! : `周${WEEKDAYS_ZH[i]!}`
}

/**
 * One column of /review's week chart: 「一」 / 「Mon」. The chart gives each of
 * seven days a slice of a phone's width, so this is the short form in both
 * languages — 「Monday」 under a 40px column would wrap or be clipped.
 */
export function shortWeekday(ymd: string, loc: Locale): string {
  const i = weekdayIndex(ymd)
  return loc === 'en' ? WEEKDAYS_EN_SHORT[i]! : WEEKDAYS_ZH[i]!
}

/**
 * A day with no year and no weekday: 「9 月 13 日」 / 「Sep 13」. /review dates
 * its own 「today」 card with this; `prettyDate` below is this plus the weekday.
 *
 * A string that is not a date at all comes back unchanged rather than as
 * 「NaN 月 NaN 日」 — the one caller passes `shanghaiDate()` output, so this is
 * belt and braces rather than a live path.
 */
export function monthDay(ymd: string, loc: Locale): string {
  const [, rawMonth, rawDay] = ymd.split('-')
  if (!rawMonth || !rawDay) return ymd
  const m = Number(rawMonth)
  const d = Number(rawDay)
  return loc === 'en' ? `${MONTHS_EN[m - 1] ?? rawMonth} ${d}` : `${m} 月 ${d} 日`
}

/**
 * The day line at the top of /today: 「9 月 13 日 · 周日」 in Chinese, 「Sep 13
 * · Sunday」 in English. No year in either — the page is about today.
 */
export function prettyDate(ymd: string, loc: Locale): string {
  return `${monthDay(ymd, loc)} · ${weekdayName(ymd, loc)}`
}

/** 'YYYY-MM-DD' ± n days, computed in UTC on the date parts so no zone drifts it. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}

// --- shanghaiHour -----------------------------------------------------------
//
// /surf/review's 24-slot hour distribution needs the hour-of-day half of the
// same Asia/Shanghai reading src/db.ts's shanghaiDate() takes for the date
// half — they must never drift onto different clocks, or a slot chart and its
// own day totals would disagree about which side of midnight an urge fell on.

const HOUR_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Shanghai',
  hour: 'numeric',
  hour12: false,
})

/**
 * 0-23, Asia/Shanghai. `hour12: false` still hands back `'24'` for local
 * midnight rather than `'0'` — an Intl quirk, not a Shanghai one — so that
 * case is folded back to 0 explicitly instead of trusting the formatter's
 * own range.
 */
export function shanghaiHour(ts: number): number {
  const formatted = HOUR_FORMATTER.format(new Date(ts))
  const hour = Number(formatted)
  return hour === 24 ? 0 : hour
}
