// /surf/review — 「回看」 for the 渡 face: a read-only, 30-day look-back over
// the urges recorded through /surf. Counterpart to progress.ts (goal-tending)
// and review.ts (interception); same card/hero/note/num idioms, same shell
// (CONSOLE_CSS), zero client JS — every number here is computed server-side
// by summarizeUrges (src/urges.ts) and injected as plain HTML.
//
// This page is also the 渡 face's home (FACE_HOME.surf in console.ts) and its
// 「回看」 tab, so it is where a reader lands switching faces from 今日 or
// 拦截 — not /surf itself, which writes an `urges` row the moment it loads.
// `entryBlock` below is the one deliberate escape hatch out of that:
// a single button into the flow, directly under the header and before any
// number, so landing here to browse never doubles as landing here to start
// one. It renders in both the empty and the with-data branch, because the
// dead end it fixes exists in both.
//
// Two cards, and deliberately only two. 「身体」 and 「引子」 used to sit
// below them, counting the answers /surf's own step 0 collected — and that
// step is gone: the flow asks nothing now (see src/ui/surf.ts, decision 0), so
// there is no honest tally left to draw. `summarizeUrges` still computes both,
// which costs nothing and keeps the historical rows readable if they are ever
// wanted again; this page simply does not render them.
//
// The 30-day dot strip deliberately reuses the mark surf.ts's own last-step
// month strip already taught readers: `d n0|n1|n2|n3` for how many urges
// that day, `op` when at least one was opened. This page adds one modifier
// neither surf.ts nor progress.ts needed — `uf`, a day where every urge that
// day was left unfinished (page closed mid-flow, never a `passed`/`opened`
// outcome). Design §7 is explicit that an unfinished row is data, not litter
// to clean up, so it gets its own mark rather than being folded into a plain
// n-class dot.

import type { Env, User } from '../types'
import { listUrgesSince, summarizeUrges, type UrgeDay } from '../urges'
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
 * summary keeps — the same one-day slack `/surf`'s own last step gives itself —
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
      body: `${consoleHeader(user, 'surfreview', t)}\n<main>\n  <h1>${t('回看')}</h1>\n  ${entryBlock(t)}\n  ${emptyState(t)}\n</main>`,
    })
  }

  const body = `${consoleHeader(user, 'surfreview', t)}
<main>
  <h1>${t('回看')}</h1>
  ${entryBlock(t)}
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
</main>`

  return page({
    title: t('回看 · {name}', { name: user.name }),
    theme: DEFAULT_THEME,
    lang: loc,
    css: CONSOLE_CSS + SURFREVIEW_CSS,
    body,
  })
}

/**
 * The one working path into the flow from a page that otherwise only reads.
 * Styled like the console's own `button.primary` (CONSOLE_CSS) but an `<a>`,
 * not a `<button>`: this page carries no `<form>` and no client JS, so a real
 * link is the only way to reach /surf that does not invent a script for it.
 */
function entryBlock(t: T): string {
  return `<a class="entry" href="/surf">${t('现在就渡')} ›</a>
  <p class="note">${t('冲动来的时候，从主屏图标进；这里只看记录。')}</p>`
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

// --- styles -------------------------------------------------------------------
//
// Appended to CONSOLE_CSS, which already carries .card/.note/.num/.empty. The
// `.d`/`.n1-3`/`.op` vocabulary intentionally mirrors surf.ts's own `.month`
// strip (see the header comment) without importing it — the two files do not
// share a CSS constant, same convention progress.ts documents for itself.
const SURFREVIEW_CSS = `
/* Same visual as CONSOLE_CSS's button.primary — pill, filled, the same tokens
   breathe.ts uses for 继续打开 — but that rule only matches a <button>, and
   this page has no <form> to put one in. An anchor styled the same way reads
   as the same weight of action without inventing a script to submit. */
.entry{display:inline-flex;align-items:center;justify-content:center;
  background:var(--stop-bg);color:var(--stop-fg);border:1px solid var(--stop-border);
  border-radius:99px;padding:12px 26px;font-size:16px;min-height:46px;box-sizing:border-box;
  text-decoration:none;margin:2px 0 4px}
.entry:active{opacity:.72}
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
`
