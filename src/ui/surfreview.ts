// /surf/review — 「回看」 for the 渡 face: a read-only, 30-day look-back over
// the urges recorded through /surf. Counterpart to progress.ts (goal-tending)
// and review.ts (interception); same card/hero/note/num idioms, same shell
// (CONSOLE_CSS), zero client JS — every number here is computed server-side
// by summarizeUrges (src/urges.ts) and injected as plain HTML.
//
// The 30-day dot strip deliberately reuses the mark surf.ts's own step-4
// month strip already taught readers: `d n0|n1|n2|n3` for how many urges
// that day, `op` when at least one was opened. This page adds one modifier
// neither surf.ts nor progress.ts needed — `uf`, a day where every urge that
// day was left unfinished (page closed mid-flow, never a `passed`/`opened`
// outcome). Design §7 is explicit that an unfinished row is data, not litter
// to clean up, so it gets its own mark rather than being folded into a plain
// n-class dot.

import type { Env, UrgeState, User } from '../types'
import { URGE_STATES } from '../types'
import { listUrgesSince, summarizeUrges, type UrgeDay, type UrgeSummary } from '../urges'
import { shanghaiDate } from '../db'
import { monthDay } from '../dates'
import { DEFAULT_THEME, escapeHtml, page } from './layout'
import { CONSOLE_CSS, consoleHeader } from './console'
import { localeOf, translator, type T } from '../i18n'

const REVIEW_DAYS = 30

/**
 * GET-only, per the router: no form on this page, nothing to POST.
 *
 * The window handed to `listUrgesSince` is one day wider than the 30 the
 * summary keeps — the same one-day slack `/surf`'s own step 4 gives itself —
 * so the Asia/Shanghai offset can never quietly drop the oldest day of the
 * strip.
 */
export async function renderSurfReview(request: Request, env: Env, user: User): Promise<Response> {
  const loc = localeOf(request, user)
  const t = translator(loc)
  const now = Date.now()
  const today = shanghaiDate(now)
  const rows = await listUrgesSince(env.DB, user.id, now - (REVIEW_DAYS + 1) * 24 * 60 * 60 * 1000)
  const summary = summarizeUrges(rows, today, REVIEW_DAYS)

  if (summary.total === 0) {
    return page({
      title: t('回看 · {name}', { name: user.name }),
      theme: DEFAULT_THEME,
      lang: loc,
      css: CONSOLE_CSS + SURFREVIEW_CSS,
      body: `${consoleHeader(user, 'surfreview', t)}\n<main>\n  <h1>${t('回看')}</h1>\n  ${emptyState(t)}\n</main>`,
    })
  }

  const body = `${consoleHeader(user, 'surfreview', t)}
<main>
  <h1>${t('回看')}</h1>
  <p class="tri">
    <span>${t('三十天 {n} 次', { n: summary.total })}</span>
    <span>${t('过去了 {n}', { n: summary.passed })}</span>
    <span>${t('点开了 {n}', { n: summary.opened })}</span>
  </p>
  ${summary.unfinished > 0 ? `<p class="note">${t('另有 {n} 次没走完。', { n: summary.unfinished })}</p>` : ''}
  <section class="card"><h2>${t('三十天')}</h2>
    <div class="month" aria-label="${t('最近三十天每天的冲动次数')}">${dayDots(summary.days)}</div>
    <div class="daylabels"><span>${escapeHtml(monthDay(summary.days[0]!.date, loc))}</span><span>${escapeHtml(monthDay(today, loc))}</span></div>
  </section>
  <section class="card"><h2>${t('几点')}</h2>
    <div class="hours" aria-label="${t('每小时的冲动次数分布')}">${hourBars(summary.hours)}</div>
    <div class="hourlabels"><span>0</span><span>6</span><span>12</span><span>18</span></div>
  </section>
  <section class="card"><h2>${t('身体')}</h2>${stateRows(summary, t)}</section>
  <section class="card"><h2>${t('引子')}</h2>${triggerRows(summary, t)}</section>
</main>`

  return page({
    title: t('回看 · {name}', { name: user.name }),
    theme: DEFAULT_THEME,
    lang: loc,
    css: CONSOLE_CSS + SURFREVIEW_CSS,
    body,
  })
}

function emptyState(t: T): string {
  return `<p class="empty">${t('还没有记录。冲动来的时候，点主屏上的「渡」。')}</p>`
}

/** 30 dots, oldest first — `summary.days` is already that shape and length. */
function dayDots(days: UrgeDay[]): string {
  return days
    .map((d) => {
      let cls = `d n${Math.min(3, d.total)}`
      // `op` wins over `uf`: a day with at least one opened urge is marked by
      // that, even if the same day also has a separate unfinished row.
      if (d.opened > 0) cls += ' op'
      else if (d.total > 0 && d.unfinished === d.total) cls += ' uf'
      return `<i class="${cls}"></i>`
    })
    .join('')
}

/** 24 bars, midnight through 23:00, height proportional to the busiest hour. */
function hourBars(hours: number[]): string {
  const max = Math.max(...hours)
  return hours.map((n) => `<i class="bar" style="--h:${max === 0 ? '0' : (n / max).toFixed(2)}"></i>`).join('')
}

/** The five body-state chips /surf itself offers, same words, same order. */
function stateLabel(state: UrgeState, t: T): string {
  switch (state) {
    case 'hungry':
      return t('饿')
    case 'angry':
      return t('烦')
    case 'lonely':
      return t('孤独')
    case 'tired':
      return t('累')
    case 'none':
      return t('都不是')
  }
}

/** One row per non-zero state, count descending; all-zero is its own note. */
function stateRows(summary: UrgeSummary, t: T): string {
  const rows = URGE_STATES.map((s) => ({ label: stateLabel(s, t), n: summary.states[s] }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n)
  if (rows.length === 0) return `<p class="note flat">${t('还没有记录。')}</p>`
  return `<ul class="sl">${rows.map((r) => `<li><span>${escapeHtml(r.label)}</span><span class="num">${r.n}</span></li>`).join('')}</ul>`
}

/**
 * `summary.triggers` already carries the sort, the cap at 5, and the
 * exclusion of `''` (no trigger picked) — this only turns it into HTML.
 * Escaped because a trigger is the account's own free text (or a built-in
 * chip's zh source, itself just a plain string): `t(tr.trigger)` translates
 * a recognised default, and falls back to the stored text unchanged for
 * anything it does not recognise, same as /surf's own chip labels.
 */
function triggerRows(summary: UrgeSummary, t: T): string {
  if (summary.triggers.length === 0) return `<p class="note flat">${t('还没有记录。')}</p>`
  return `<ul class="sl">${summary.triggers
    .map((tr) => `<li><span>${escapeHtml(t(tr.trigger))}</span><span class="num">${tr.count}</span></li>`)
    .join('')}</ul>`
}

// --- styles -------------------------------------------------------------------
//
// Appended to CONSOLE_CSS, which already carries .card/.note/.num/.empty. The
// `.d`/`.n1-3`/`.op` vocabulary intentionally mirrors surf.ts's own `.month`
// strip (see the header comment) without importing it — the two files do not
// share a CSS constant, same convention progress.ts documents for itself.
const SURFREVIEW_CSS = `
.tri{display:flex;flex-wrap:wrap;gap:8px 20px;margin:2px 0 10px;font-size:15px;color:var(--dim)}
.tri span{color:var(--fg)}
.month{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:8px}
.month .d{display:block;width:9px;height:9px;border-radius:50%;border:1px solid var(--ring-track)}
.month .d.n1{background:var(--ring-prog);opacity:.45;border-color:transparent}
.month .d.n2{background:var(--ring-prog);opacity:.72;border-color:transparent}
.month .d.n3{background:var(--ring-prog);opacity:1;border-color:transparent}
.month .d.op{border:1px solid var(--dot);background:transparent;opacity:1}
/* Dashed, not solid — a day nothing was decided about reads as open, not as
   another shade of the same fill n1-n3 already use. */
.month .d.uf{border-style:dashed;border-color:var(--dim)}
.daylabels{display:flex;justify-content:space-between;font-size:12px;color:var(--faint)}
.hours{display:flex;align-items:flex-end;gap:2px;height:44px;margin-bottom:8px}
.hours .bar{flex:1;min-width:0;border-radius:2px 2px 1px 1px;background:var(--ring-prog);
  height:calc(4px + var(--h,0) * 40px)}
.hourlabels{display:flex;justify-content:space-between;font-size:12px;color:var(--faint)}
ul.sl{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:0}
ul.sl li{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:9px 0;border-top:1px solid var(--rule)}
ul.sl li:first-child{border-top:0;padding-top:0}
`
