// /surf — 「渡」, the ten-minute flow. The third face of the product: not a
// list to read, a thing to walk through while an urge is passing.
//
// Six decisions here are deliberate and must survive future "cleanups":
//
//  0. ZERO CHOICES IN THE FLOW. The only interaction this page offers while an
//     urge is on somebody is a button that moves them forward — no chips, no
//     tags, no options, no typing. Choosing costs energy, and that energy is
//     exactly what the urge is competing for. Everything personal (which
//     scene, which line) was decided once at /surf/setup and is rendered in
//     from `users.surf_scene`; this page never asks. The one real decision
//     left is step 2's 「过去了」/「还想」, which is the product itself.
//  1. ONE document, four steps. Every step is server-rendered into the same
//     HTML and switched by `body[data-step]`; no step costs a round trip. The
//     page is opened at the exact moment somebody is reaching for a
//     distraction, often on a bad connection — a spinner between step 0 and
//     step 1 is where the flow would be lost. Step 1's five segments are the
//     same trick one level down, switched by `body[data-seg]`.
//  2. STEP 1 OCCUPIES THE READER, it does not ask them to watch a circle
//     breathe for ten minutes. That is what v2 did, and the owner's verdict
//     was that it does not take attention off anything. Craving is held up by
//     mental imagery (elaborated-intrusion theory: Kavanagh/Andrade/May), so
//     what displaces it is loading the visuospatial sketchpad and moving the
//     body — Skorka-Brown 2014 got a measurable drop out of three minutes of
//     Tetris. Breathing works on arousal that has already come down, which is
//     why it is now segment e and not the whole step. Five segments, in that
//     order: hands, eyes, surroundings, body, breath. None of them can be
//     skipped and none can be gone back to.
//  3. No numeric countdown on step 1, and no skip button. Progress is a ring
//     and two hairline bars, because a number invites you to stare at it and
//     tick it down, which is the opposite of the point (the same reasoning as
//     breathe.ts). The one exception is the 「第 N 个」 line segment d shows
//     to a reader who asked for reduced motion, who has no moving dot to
//     count along with instead.
//  4. Step 2's asymmetry: 「过去了」 is loud and immediate, 「还想」 arrives
//     800ms later as a small underlined link, and only then offers its own two
//     ways out. Riding it out is meant to be the path of least resistance.
//     This IS the feature — do not "balance" the buttons.
//  5. `start`, `round` and `finish` never block the page. `round` and `finish`
//     go out through `navigator.sendBeacon` with a non-awaited `keepalive`
//     fetch behind it, never `await` (CONTRIBUTING §2); `start` fires on load
//     with a `.then()` for the id the other two address. They fire from a page
//     that is about to be closed or backgrounded; an awaited request is a
//     record that never lands.
//
// 「我点开了」 is an outcome, not a failure. Nothing on this page is red,
// nothing congratulates, nothing scolds — opening it is information about the
// environment, and the closing line is the same either way.

import type { Env, User } from '../types'
import { SURF_RESUME_MS, SURF_ROUND_MS } from '../types'
import { shanghaiDate } from '../db'
import { bumpUrgeRound, createUrge, findOpenUrge, finishUrge, getUrge, listUrgesSince, summarizeUrges } from '../urges'
import { hasScene, sceneOf, sceneTrigger, type Scene } from '../surfscenes'
import { DEFAULT_THEME, escapeHtml, jsonScript, page } from './layout'
import { EXHALE_MS, INHALE_MS, ORB_CSS, orbHtml } from './breathing'
import { SURF_PWA_HEAD } from './pwa'
import { inAppBrowserOf } from '../inapp'
import { localeOf, translator, type Locale, type T } from '../i18n'

/**
 * Segment b, 「眼睛的事」: sixty dots to hit, or a hundred and fifty seconds,
 * whichever comes first. Sixty is about two and a half minutes of hunting at
 * the pace the gap below sets, which is on the order of the three minutes of
 * Tetris that measurably moved craving; the time limit is there so a reader
 * who cannot find the dot (one hand full, a cracked screen) is not stuck.
 */
const TAPS = 60
const TAP_MS = 150_000
/**
 * How long a hit dot stays gone before it reappears somewhere else. The delay
 * is the point: a dot that reappears instantly can be tracked without looking
 * away from where the last one was, and tracking is not searching.
 */
const TAP_GAP_MS = 150
const TAP_GAP_SPAN_MS = 250
/**
 * The dot's diameter, in px, and the whole reason it is a number here rather
 * than a line of CSS: the script positions it with `calc()` off this same
 * value, so the target cannot drift outside its area. 56 is Apple's 44px
 * minimum with room to spare, for a thumb aiming in the dark.
 */
const TAP_DOT_PX = 56
/** Segment d, 「身体的事」: twenty beats, two seconds each. */
const BEATS = 20
const BEAT_MS = 2_000
/** Segment e, 「呼吸」: two minutes of the orb, and the end of step 1. */
const BREATHE_MS = 120_000
/** 「还想」 trails 「过去了」 by this much — see decision 4 above. */
const STILL_DELAY_MS = 800

export async function handleSurf(request: Request, env: Env, user: User): Promise<Response> {
  if (request.method === 'GET') {
    // One translator per request, built here and handed down — never a module
    // variable: a single isolate serves many requests at once.
    const loc = localeOf(request, user)
    return await render(request, env, user, loc, translator(loc))
  }
  if (request.method === 'POST') return await handlePost(request, env, user)
  return new Response('method not allowed', { status: 405, headers: { allow: 'GET, POST' } })
}

/**
 * The five parting lines, one of which ends every walk-through. Quiet: no
 * praise, no lecture, and the same words whether the urge passed or not.
 *
 * A function of `t` rather than a constant, because each one has to reach the
 * translator as a static literal (see src/i18n/index.ts). The order is
 * load-bearing: the page script indexes into it by a hash of the urge id, so a
 * reload keeps the same line and the same record says the same thing in either
 * language.
 */
export function farewellLines(t: T): string[] {
  return [
    t('就到这里。'),
    t('这一阵过去了。'),
    t('你看着它，它就小了。'),
    t('记下了。明天还是新的一天。'),
    t('放下就好。'),
  ]
}

/**
 * Segment c, 「周围的事」: 5-4-3-2-1 grounding, one line at a time, each ended
 * by 「好了」. Five senses in descending count, which is the form this exercise
 * has always had — the descent is what makes it finishable, and naming things
 * that are actually in the room is what puts the room back in front of the
 * picture the urge is running.
 *
 * A function of `t` for the same reason `farewellLines` is: each line has to
 * reach the translator as a static literal. The order is the exercise.
 */
export function groundingLines(t: T): [string, string, string, string, string] {
  return [
    t('找出房间里五样蓝色的东西。'),
    t('听出四种不同的声音。'),
    t('摸三种不同的质地。'),
    t('闻两种气味。'),
    t('说出一样你此刻尝到的味道。'),
  ]
}

// --- POST --------------------------------------------------------------------

function field(form: FormData, key: string): string {
  const v = form.get(key)
  return typeof v === 'string' ? v.trim() : ''
}
function intId(raw: string): number | null {
  return /^\d{1,12}$/.test(raw) ? Number(raw) : null
}
function back(): Response {
  return new Response(null, { status: 303, headers: { location: '/surf', 'cache-control': 'no-store' } })
}
function bad(): Response {
  return new Response('bad request', { status: 400 })
}
function notFound(): Response {
  return new Response('not found', { status: 404 })
}
function ok(payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

async function handlePost(request: Request, env: Env, user: User): Promise<Response> {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return bad()
  }
  const op = field(form, 'op')
  const now = Date.now()
  // Only the page's own script sends this header; a request without it —
  // this page has no `<form>`, so in practice that is curl or a test — gets
  // the 303 it would have got anyway. Same-origin is enforced by the SameSite
  // cookie and CSP `form-action 'self'`; this bit only tells us who is asking.
  const asJson = request.headers.get('x-yixi') === 'fetch'

  if (op === 'start') {
    // `start` fires on every load of this page, not on a tap (decision 5 at
    // the top of this file) — a reload, a mis-tap that bounces straight back,
    // or iOS restoring a backgrounded tab all replay it. Resuming whatever
    // open row already exists inside SURF_RESUME_MS, instead of opening a new
    // one every time, is what keeps one urge one row instead of inflating
    // 「三十天 N 次」 with rows that are really the same walk-through.
    const open = await findOpenUrge(env.DB, user.id, now - SURF_RESUME_MS)
    if (open) return asJson ? ok({ id: open.id }) : back()
    // No fields. The client has nothing to say here and is not asked for
    // anything: the scene was chosen at /surf/setup, so the row's `trigger`
    // comes off the account rather than off a form the flow would have had to
    // show somebody. `state` is the body question v1 asked and v2 does not.
    const trigger = sceneTrigger(user)
    const id = await createUrge(env.DB, { userId: user.id, state: '', trigger, now })
    return asJson ? ok({ id }) : back()
  }

  if (op === 'round') {
    const id = intId(field(form, 'id'))
    if (id === null) return bad()
    // The helper's own WHERE user_id = ? is the ownership check; no rows
    // changed means the id belongs to somebody else (or to nobody).
    if (!(await bumpUrgeRound(env.DB, user.id, id))) return notFound()
    return asJson ? ok({ ok: true }) : back()
  }

  if (op === 'finish') {
    const id = intId(field(form, 'id'))
    if (id === null) return bad()
    const outcome = field(form, 'outcome')
    if (outcome !== 'passed' && outcome !== 'opened') return bad()
    const changed = await finishUrge(env.DB, user.id, id, outcome, now)
    // Two different things look identical from `finishUrge` alone: a row that
    // was already settled, and a row that is not ours. The first is a retry
    // from a page that was closed before its first beacon was acknowledged —
    // 200, nothing changed. The second is a 404. One extra read tells them
    // apart, and only on the path that is already unusual.
    if (!changed && !(await getUrge(env.DB, user.id, id))) return notFound()
    return asJson ? ok({ ok: true, changed }) : back()
  }

  return bad()
}

// --- GET ---------------------------------------------------------------------

async function render(request: Request, env: Env, user: User, loc: Locale, t: T): Promise<Response> {
  const now = Date.now()
  const today = shanghaiDate(now)
  // Days elapsed this month, today included — one dot each.
  const dayOfMonth = Number(today.slice(8, 10))
  // One day of slack past the first of the month covers the Shanghai offset
  // without any date arithmetic of its own; `summarizeUrges` drops whatever
  // falls outside the window it is given.
  const rows = await listUrgesSince(env.DB, user.id, now - dayOfMonth * 24 * 60 * 60 * 1000)
  const month = summarizeUrges(rows, today, dayOfMonth)

  const ua = request.headers.get('user-agent') ?? ''
  const iphoneSafari = /iPhone/.test(ua) && /Safari/.test(ua) && inAppBrowserOf(request) === null

  const { scene } = sceneOf(user)

  // Every string the script shows travels in this island, never in the script
  // itself: one constant, the same bytes in both languages.
  const cfg = {
    inhale: INHALE_MS,
    exhale: EXHALE_MS,
    inhaleWord: t('吸气'),
    exhaleWord: t('呼气'),
    // Segment c's five lines, and the only counted line in the flow — the one
    // segment d shows in place of the beating dot under reduced motion. The
    // `{n}` is left unfilled on purpose: the script substitutes it per beat,
    // which is why this is the one `t()` on the page with no params.
    around: groundingLines(t),
    nth: t('第 {n} 个'),
    // null for every scene but 深夜加餐, whose body task is not twenty of
    // anything — see `Scene.bodyMs` in ../surfscenes.
    bodyMs: scene.bodyMs,
    fin: farewellLines(t),
    // Which parting line an unrecorded walk-through gets. A hash of the urge
    // id decides it when there is one; with no id (the start POST never
    // landed) there is nothing to hash, so the server picks the seed.
    seed: now,
    a2hs: iphoneSafari,
  }

  const body = `<main class="flow">
${step0(user, t)}
${step1(scene, t)}
${step2(t)}
${step3(month.days, t)}
</main>
${iphoneSafari ? banner(t) : ''}
<noscript><p class="ns">${t('这一页需要 JavaScript。回到主屏幕重新打开就好。')}</p></noscript>
${jsonScript('cfg', cfg)}`

  return page({
    title: t('渡 · 一息'),
    theme: DEFAULT_THEME,
    lang: loc,
    // Its own manifest and touch icon: added to the home screen, 「渡」 has to
    // become a second app rather than a shortcut into the one /today installed.
    pwaHead: SURF_PWA_HEAD,
    // The orb reads `--level` and `body.t-*`, both of which live in SURF_CSS
    // below rather than in ORB_CSS — see the note there.
    css: ORB_CSS + SURF_CSS,
    // `data-seg` is step 1's own switch, set here as well as by the script so
    // the first segment is already the visible one before a single frame runs.
    bodyAttrs: `class="t-${DEFAULT_THEME}" data-step="0" data-seg="a"`,
    body,
    script: SURF_JS,
  })
}

/**
 * Step 0 — the whole of the opening. One sentence about this reader's own
 * scene, their own line if they wrote one, and one button.
 *
 * Nothing here is a question. The record is already being written by the time
 * this is read: the page script POSTs `start` on load, without waiting for a
 * tap, so a walk-through that gets abandoned three seconds in still leaves the
 * row that says an urge happened.
 *
 * The link to /surf/setup is the single exception to decision 0 above, and it
 * only exists for an account that has never been there: without a scene the
 * copy is the neutral default, and there has to be some way to find out that
 * it can be their own. Once one is configured the link is gone for good.
 */
function step0(user: User, t: T): string {
  const { scene } = sceneOf(user)
  const own = typeof user.surf_line === 'string' ? user.surf_line.trim() : ''
  return `<section class="step" data-step="0">
<h1>${t('冲动来了。')}</h1>
<p class="line">${t(scene.opening)}</p>
${own === '' ? '' : `<p class="line own">${escapeHtml(own)}</p>\n`}<button type="button" class="stop" id="up">${t('我起来了')}</button>
<p class="a2">${t('放下手机，去另一个房间。回来再点。')}</p>
${hasScene(user) ? '' : `<a class="linky" href="/surf/setup">${t('先告诉我这是哪一种')} ›</a>\n`}</section>`
}

/** One hairline cell per thing to be done — `n` of them, all empty. */
function cells(n: number): string {
  return '<i></i>'.repeat(n)
}

/**
 * Step 1 — five segments, in order, none skippable. See decision 2 at the top
 * of this file for why it is five things to do rather than ten minutes of
 * watching one thing.
 *
 * The orb goes LAST in the markup and is pulled back above nothing by
 * `order:2`: it is the overall ring for all five segments (a fifth per
 * segment), a coin-sized hairline while there is something to do and the full
 * breathing orb once segment e arrives. One `#ring`, not one per segment —
 * five ring elements would be five things to keep in step with each other.
 *
 * Everything the script needs to reach is an id, and every id here is checked
 * against the script as text by test/surf.test.ts: workerd has no DOM, so a
 * rename in one place and not the other would freeze the flow on step 0 with
 * the suite still green.
 */
function step1(scene: Scene, t: T): string {
  return `<section class="step" data-step="1">
<div class="seg" data-seg="a">
<p class="segt">${t('手上的事')}</p>
<p class="task">${t(scene.handTask)}</p>
<button type="button" class="stop" id="did-a">${t('做完了')}</button>
</div>
<div class="seg" data-seg="b">
<p class="segt">${t('眼睛的事')}</p>
<p class="hint">${t('点它。')}</p>
<div class="zone"><button type="button" class="tapdot" id="tapdot" aria-label="${t('点它。')}" hidden></button></div>
<div class="bar" id="bar-b" aria-hidden="true">${cells(TAPS)}</div>
</div>
<div class="seg" data-seg="c">
<p class="segt">${t('周围的事')}</p>
<p class="task" id="around">${groundingLines(t)[0]}</p>
<button type="button" class="stop" id="did-c">${t('好了')}</button>
</div>
<div class="seg" data-seg="d">
<p class="segt">${t('身体的事')}</p>
<p class="task">${t(scene.bodyTask)}</p>
<p class="hint">${t('跟着它。')}</p>
<div class="beatwrap" id="beatwrap"><i class="beat" id="beat" aria-hidden="true"></i></div>
<p class="nth" id="nth" hidden></p>
<div class="bar" id="bar-d" aria-hidden="true">${cells(BEATS)}</div>
</div>
<div class="seg" data-seg="e">
<p class="segt">${t('呼吸')}</p>
</div>
${orbHtml(t)}
</section>`
}

/** Step 2 — deciding again. See decision 4 at the top of this file. */
function step2(t: T): string {
  return `<section class="step" data-step="2">
<p class="a1">${t('十分钟了。')}</p>
<button type="button" class="stop" id="passed">${t('过去了')}</button>
<button type="button" class="go" id="still" hidden>${t('还想')}</button>
<div class="more" id="more" hidden>
<button type="button" class="go" id="again">${t('再来十分钟')}</button>
<button type="button" class="go" id="opened">${t('我点开了')}</button>
</div>
</section>`
}

/**
 * Step 3 — the end. A parting line and this month's dots, and nothing to
 * answer: v1 asked 「下次哪一步换成什么？」 here, and typing is a choice like
 * any other, made at the one moment somebody has least to spend on it.
 *
 * The dots are rendered here rather than fetched: the row for the walk-through
 * that just ended is written by a beacon whose answer nobody waits for, so the
 * client paints today's dot itself from what it knows.
 *
 * The two links below 「再来一次」 are the only way out of the flow into
 * review or setup — every other step stays exactly as it was (decision 0
 * above: zero choices while an urge is being surfed). They only appear once
 * the walk-through is over, which is also the one moment 「回看」/「怎么配」
 * cost nothing: the record for this urge is already reported by the time this
 * step is on screen.
 */
function step3(days: Array<{ total: number; opened: number }>, t: T): string {
  const dots = days.map((d) => `<i class="d n${Math.min(3, d.total)}${d.opened > 0 ? ' op' : ''}"></i>`).join('')
  return `<section class="step" data-step="3">
<p class="a1" id="fin"></p>
<p class="a2" id="lost" hidden>${t('这一次没记上。')}</p>
<div class="month" id="month">${dots}</div>
<a class="linky" href="/surf">${t('再来一次')}</a>
<div class="linkrow">
<a class="linky" href="/surf/review">${t('回看')} ›</a>
<a class="linky" href="/surf/setup">${t('怎么配')} ›</a>
</div>
</section>`
}

/**
 * The same banner /today carries, with its own dismissal key: 「渡」 installs
 * as a separate home-screen app, so somebody who has already added 一息 still
 * needs to be told about this one.
 */
function banner(t: T): string {
  return `<aside class="a2hs" id="a2hs" hidden>
  <p>${t('添加到主屏幕，下次一步就到。')}</p>
  <button type="button" class="linky" id="a2hs-x">${t('知道了')}</button>
</aside>`
}

// --- css ---------------------------------------------------------------------

/**
 * `:root{--level:.5}` and the reduced-motion `.ink i{animation:none}` rule are
 * here rather than in ORB_CSS on purpose: neither is textually adjacent to the
 * orb block in breathe.ts's own stylesheet, and test/breathe.test.ts pins the
 * rendered /b page by SHA-256, so moving them would have forced breathe.ts to
 * reorder its CSS. Both are still required wherever the orb is used — without
 * the custom property the wash sits at whatever the last frame left, and
 * without the media rule the ink keeps drifting for a reader who asked for
 * stillness. See the comment on ORB_CSS in ./breathing.ts.
 *
 * `.stop`/`.go`/`.a1`/`.a2` are copied from breathe.ts rather than shared:
 * those are the buttons and the closing lines, not the breath, and the two
 * pages are free to let them drift (this one is a step larger throughout,
 * because it is read at arm's length in the dark).
 */
const SURF_CSS = `
:root{--level:.5}

.step{
  display:none;
  min-height:100vh;min-height:100svh;
  flex-direction:column;align-items:center;justify-content:center;
  padding:calc(env(safe-area-inset-top) + 8vh) 24px calc(env(safe-area-inset-bottom) + 7vh);
  text-align:center;font-size:17px;
}
body[data-step="0"] .step[data-step="0"],
body[data-step="1"] .step[data-step="1"],
body[data-step="2"] .step[data-step="2"],
body[data-step="3"] .step[data-step="3"]{display:flex}

/* --- step 1's five segments ------------------------------------------------
   The same mechanism one level down: all five are in the document and
   body[data-seg] decides which one is on screen. The order property is what
   lets the orb sit last in the markup and still render under whichever
   segment is showing — see the note on step1() for why one ring, not five. */
.seg{display:none;order:1;flex-direction:column;align-items:center;width:100%;max-width:21rem}
body[data-seg="a"] .seg[data-seg="a"],
body[data-seg="b"] .seg[data-seg="b"],
body[data-seg="c"] .seg[data-seg="c"],
body[data-seg="d"] .seg[data-seg="d"],
body[data-seg="e"] .seg[data-seg="e"]{display:flex}

.segt{margin:0 0 1.7rem;font-size:.8rem;color:var(--faint);letter-spacing:.42em;text-indent:.42em}
.task{margin:0;font-size:1.3rem;line-height:1.95;color:var(--fg);letter-spacing:.1em;text-indent:.1em}
.hint{margin:1.4rem 0 0;font-size:.9rem;color:var(--faint);letter-spacing:.34em;text-indent:.34em}
/* The one place in the flow a number appears: what a reader who asked for
   reduced motion gets instead of a dot to follow (decision 3 above). */
.nth{margin:1.3rem 0 0;font-size:.95rem;color:var(--dim);letter-spacing:.2em;text-indent:.2em;font-variant-numeric:tabular-nums}

/* Sixty cells for the dots in segment b, twenty for the beats in segment d.
   A count made visible without a numeral to tick down — the same reason this
   step has never had a countdown. */
.bar{display:flex;gap:2px;width:100%;max-width:19rem;margin-top:2rem}
.bar i{flex:1 1 0;height:2px;border-radius:1px;background:var(--ring-track)}
.bar i.on{background:var(--ring-prog)}

/* Segment b's hunting ground. touch-action:none on both the area and the dot
   is load-bearing and it is why the script listens for pointerdown rather than
   click: iOS holds a tap for ~300ms in case it is the first half of a
   double-tap zoom, and at roughly one dot a second that reads as a page
   dropping every other hit. The dot is positioned in calc() off its own
   diameter, so the whole ${TAP_DOT_PX}px target stays inside the area at any
   screen size — a percentage alone lets half of it hang off the right edge. */
.zone{position:relative;width:100%;height:min(40vh,320px);margin-top:1.2rem;touch-action:none}
.tapdot{
  position:absolute;width:${TAP_DOT_PX}px;height:${TAP_DOT_PX}px;padding:0;
  border-radius:50%;background:var(--dot);transform:translate(-50%,-50%);
  touch-action:none;
}
.tapdot:active{opacity:.78}

/* Segment d's beat. Nothing animates it here: the script sets the scale off
   the same rAF clock as everything else, and sets nothing at all for a reader
   who asked for stillness — who gets the counted line instead. */
.beatwrap{display:grid;place-items:center;width:100%;height:150px;margin-top:1.2rem}
.beat{display:block;width:86px;height:86px;border-radius:50%;background:var(--dot);will-change:transform}

/* The overall ring: the orb from breathing.ts, on screen through all five
   segments, one fifth of the circle per segment finished. Coin-sized with the
   wash, the dot and the phase word out of the way while there is something to
   do; full size and breathing once segment e arrives. The stroke is widened to
   compensate for the viewBox being drawn at a sixth of its usual size — 7 in a
   240 viewBox at 44px is the same 1.3px hairline the big orb has. */
.orbwrap{order:2;margin-top:2.4rem}
body[data-step="1"]:not([data-seg="e"]) .orb{width:44px;height:44px}
body[data-step="1"]:not([data-seg="e"]) .ring circle{stroke-width:7}
body[data-step="1"]:not([data-seg="e"]) .ink,
body[data-step="1"]:not([data-seg="e"]) .dot,
body[data-step="1"]:not([data-seg="e"]) .phase{display:none}

.step h1{margin:0 0 1.8rem;font-size:1.5rem;font-weight:500;letter-spacing:.14em;text-indent:.14em}
/* The scene's one sentence, and under it whatever the reader wrote for
   themselves — a step quieter, so the two do not compete. */
.line{margin:0;max-width:20rem;font-size:1.06rem;line-height:2;color:var(--dim);letter-spacing:.1em;text-indent:.1em}
.line.own{margin-top:.9rem;color:var(--faint);font-size:.98rem}

.a1{margin:0;font-size:1.22rem;line-height:2;color:var(--fg);letter-spacing:.12em;text-indent:.12em}
.a2{margin:.2rem 0 0;font-size:.9rem;color:var(--faint);letter-spacing:.1em;text-indent:.1em}

.stop{
  margin-top:2.2rem;padding:1.05rem 3.6rem;border-radius:999px;
  background:var(--stop-bg);color:var(--stop-fg);border:1px solid var(--stop-border);
  font-size:1.06rem;letter-spacing:.34em;text-indent:.34em;
}
.stop:active{opacity:.82}
.go{
  margin-top:1.4rem;min-height:44px;padding:.7rem 1.2rem;color:var(--go-fg);
  font-size:.88rem;letter-spacing:.22em;text-indent:.22em;
  text-decoration:underline;text-underline-offset:6px;text-decoration-thickness:1px;
  text-decoration-color:var(--rule);
}
.more{display:flex;flex-direction:column;align-items:center}

/* One dot per day so far this month: darker with the day's count, ringed when
   something was opened. No streak, no gap counter — those are the same claim
   about character that section 0 of the design says this page must not make. */
.month{display:flex;flex-wrap:wrap;gap:7px;justify-content:center;max-width:19rem;margin-top:2.6rem}
.month .d{display:block;width:9px;height:9px;border-radius:50%;border:1px solid var(--ring-track)}
.month .d.n1{background:var(--ring-prog);opacity:.45;border-color:transparent}
.month .d.n2{background:var(--ring-prog);opacity:.72;border-color:transparent}
.month .d.n3{background:var(--ring-prog);opacity:1;border-color:transparent}
.month .d.op{border:1px solid var(--dot);background:transparent;opacity:1}

a.linky{margin-top:2.4rem;min-height:44px;padding:11px 0;color:var(--dim);font-size:14px}

/* The two step-3 exits, side by side under 再来一次: a lighter tier than that
   link, so a row that only ever shows once the walk-through is over does not
   compete with it for attention. */
.linkrow{display:flex;gap:28px;margin-top:1.2rem;flex-wrap:wrap;justify-content:center}
.linkrow a.linky{margin-top:0}

.ns{position:fixed;left:0;right:0;bottom:14vh;margin:0;padding:0 32px;text-align:center;color:var(--dim);font-size:.9rem}

.a2hs{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));
  border:1px solid var(--rule);border-radius:14px;padding:12px 14px;background:var(--bg);
  display:flex;gap:12px;align-items:center;font-size:13px;line-height:1.7;color:var(--dim);box-shadow:0 6px 24px rgba(0,0,0,.08)}
.a2hs p{margin:0;flex:1}
.a2hs button.linky{color:var(--dim);font-size:14px;text-decoration:underline;text-underline-offset:3px;padding:11px 0;min-height:44px}
/* Neither step 1 nor the first screen — which carries the /surf/setup
   link for a first visit — are the moment to sell an icon. Only the closing
   step, once the walk-through is over, offers it. */
body[data-step="0"] .a2hs,body[data-step="1"] .a2hs,body[data-step="2"] .a2hs{display:none}

@media (prefers-reduced-motion:reduce){
  .ink i{animation:none}
}
`

// --- js ----------------------------------------------------------------------

/**
 * The whole flow: four steps, five segments inside step 1, one rAF loop, three
 * requests.
 *
 * WHY START FIRES ON LOAD. The row is opened the moment the page is, not when
 * somebody taps: an urge that was interrupted by closing the tab is still an
 * urge that happened, and asking for a tap first would have made the record
 * conditional on the one thing this page refuses to ask for. It is a `.then()`
 * rather than an `await` — the id it returns is what the other two requests
 * address, and nothing on screen waits for it.
 *
 * WHY NOTHING IS AWAITED. `round` and `finish` are sent from a page that may
 * be closed or backgrounded a moment later. sendBeacon hands the request to
 * the browser and returns immediately; the fallback is
 * `fetch(..., {keepalive:true})` NOT awaited. An `await` anywhere in here is
 * the shape of a record that silently never lands. CONTRIBUTING section 2.
 *
 * WHY THE rAF TIMESTAMP AND NOT A COUNTER. Elapsed time is `now - t0` inside
 * one requestAnimationFrame loop, `now` being the timestamp rAF itself hands
 * the callback, so a phone that locks the screen for four minutes comes back
 * with four minutes gone rather than with a timer that stopped counting. There
 * are two of these clocks and one loop: `t0` is the whole of step 1 and only
 * ever feeds the fifteen-minute backstop, `segT0` restarts with each segment
 * and is what every segment measures itself against. One loop means the beat,
 * the breath, the bars and the ring cannot drift apart.
 *
 * WHY ONE FUNCTION PER SEGMENT. `segA`…`segE` sit in `SEQ` in the order they
 * run, and `nextSeg` is the only thing that walks it: no segment knows which
 * one comes after it, so there is no second place for the order to be written
 * down and disagree. There is no way back and no way to skip — `nextSeg` only
 * ever moves forward, and the end of the list is step 2.
 *
 * WHY NO COPY IS IN HERE. Every string comes from the config island, so this
 * constant is the same bytes in both languages. The timings are the opposite:
 * they are this page's own choreography, interpolated in from the constants at
 * the top of this file so there is one copy of each number.
 */
const SURF_JS = `(function(){
var cfg=JSON.parse(document.getElementById('cfg').textContent);
var IN=cfg.inhale,OUT=cfg.exhale,CYCLE=IN+OUT;
var CAP=${SURF_ROUND_MS};
var TAPS=${TAPS},TAPMS=${TAP_MS},GAP=${TAP_GAP_MS},SPAN=${TAP_GAP_SPAN_MS},DOT=${TAP_DOT_PX};
var BEATS=${BEATS},BEATMS=${BEAT_MS},BREATHE=${BREATHE_MS};
// Twenty beats unless the scene says its body task has nothing to count, in
// which case the segment is simply that many milliseconds long.
var COUNTED=typeof cfg.bodyMs!=='number',BODYMS=COUNTED?BEATS*BEATMS:cfg.bodyMs;

var root=document.documentElement,doc=document.body;
var ring=document.getElementById('ring'),phase=document.getElementById('phase');
var tapdot=document.getElementById('tapdot');
var barB=document.getElementById('bar-b'),barD=document.getElementById('bar-d');
var beatwrap=document.getElementById('beatwrap'),beat=document.getElementById('beat');
var nth=document.getElementById('nth'),around=document.getElementById('around');
var still=document.getElementById('still'),more=document.getElementById('more');
var fin=document.getElementById('fin'),lost=document.getElementById('lost');
var month=document.getElementById('month');

var C=2*Math.PI*112;
ring.style.strokeDasharray=C+' '+C;
ring.style.strokeDashoffset=String(C);

var calm=false;
try{calm=window.matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){}

var urgeId=null,settled=false;
var t0=0,running=false,lastWord='',pending=0;
// Where step 1 is: which segment, when that segment started, and how far
// through it we are (0-1). The ring is drawn from the last of these plus the
// first, so one finished segment is one fifth however it ended.
var segi=0,segT0=0,segProg=0;
var taps=0,beats=0,said=0,onB=-1,onD=-1,gap=0;

function go(n){
  // The 800ms reveal belongs to step 2 alone. Left running, it un-hides
  // 「还想」 behind a section nobody is looking at any more, and the next
  // pass through step 2 would then start with both halves already showing.
  if(n!==2&&pending){clearTimeout(pending);pending=0}
  doc.setAttribute('data-step',String(n));
  if(n===1)startSegs();
  if(n===2)reveal();
}

// --- step 1's five segments --------------------------------------------------

var SEQ=[segA,segB,segC,segD,segE];
var KEYS=['a','b','c','d','e'];

function startSegs(){
  t0=0;
  enterSeg(0);
  if(running)return;
  running=true;
  requestAnimationFrame(frame);
}

function enterSeg(i){
  segi=i;segT0=0;segProg=0;
  doc.setAttribute('data-seg',KEYS[i]);
  drawRing();
  SEQ[i]();
}

// Forward only. The end of the list is step 2 — 「再来十分钟」 comes back in
// through go(1), which starts the whole walk again from segment a.
function nextSeg(){
  if(segi+1>=SEQ.length){running=false;go(2);return}
  enterSeg(segi+1);
}

function drawRing(){
  var prog=Math.min(1,(segi+Math.min(1,Math.max(0,segProg)))/SEQ.length);
  ring.style.strokeDashoffset=String(C*(1-prog));
}

// Both hairlines, cell by cell. Only the count changes, so the write is
// guarded: sixty className assignments a frame is sixty for nothing.
function paint(bar,n){
  var cells=bar.children,i;
  for(i=0;i<cells.length;i++)cells[i].className=i<n?'on':'';
}
function fillB(n){if(n!==onB){onB=n;paint(barB,n)}}
function fillD(n){if(n!==onD){onD=n;paint(barD,n)}}

/**
 * Segment a — the errand. No clock of its own: the reader is meant to be out
 * of the room, and a segment that ended while they were gone would put them
 * back in front of a page that had moved on without them. The button is the
 * only way out, and the fifteen-minute backstop is the only thing behind it.
 */
function segA(){}

/** Segment b — sixty dots, or TAPMS, whichever comes first. */
function segB(){
  taps=0;onB=-1;fillB(0);
  if(gap){clearTimeout(gap);gap=0}
  place();
}

// A fraction of the area, in calc() off the dot's own diameter so the whole
// target stays inside it whatever the screen is. translate(-50%,-50%) in the
// stylesheet is the other half of that: this is the dot's centre.
function spot(f){return 'calc('+(DOT/2)+'px + (100% - '+DOT+'px) * '+f.toFixed(4)+')'}

function place(){
  if(KEYS[segi]!=='b')return;
  tapdot.style.left=spot(Math.random());
  tapdot.style.top=spot(Math.random());
  tapdot.hidden=false;
}

function tickB(el){
  // Whichever of the two is further along, so the ring keeps moving for a
  // reader who has stopped tapping and will leave on the time limit.
  segProg=Math.max(taps/TAPS,el/TAPMS);
  fillB(taps);
  if(el>=TAPMS)nextSeg();
}

/** Segment c — 5-4-3-2-1, one line and one 「好了」 at a time. */
function segC(){
  said=0;
  around.textContent=cfg.around[0];
}

function sayNext(){
  said++;
  if(said>=cfg.around.length){nextSeg();return}
  around.textContent=cfg.around[said];
  segProg=said/cfg.around.length;
}

/** Segment d — the body, with the dot keeping time for it. */
function segD(){
  beats=0;onD=-1;fillD(0);
  beat.style.transform='';
  // Reduced motion: the dot would be the only thing moving on the screen and
  // it is what the reader was asked to follow, so it goes and the count comes
  // instead. An uncounted body task has no count to show, and the hairline is
  // what is left.
  beatwrap.hidden=calm;
  nth.hidden=!(calm&&COUNTED);
  if(calm&&COUNTED)nth.textContent=nthOf(1);
}

function nthOf(n){return String(cfg.nth).replace('{n}',String(n))}

function tickD(el){
  segProg=el/BODYMS;
  if(COUNTED){
    var k=Math.min(BEATS,Math.floor(el/BEATMS));
    // Two seconds: up for one, down for one, eased at both ends so there is a
    // top of the breath to arrive at rather than a bounce.
    var c=el%BEATMS,half=BEATMS/2,rise=c<half;
    var p=rise?c/half:1-(c-half)/half;
    var e=.5-.5*Math.cos(Math.PI*Math.min(1,Math.max(0,p)));
    if(!calm)beat.style.transform='scale('+(.5+.5*e).toFixed(4)+')';
    if(k!==beats){
      beats=k;
      if(calm&&COUNTED)nth.textContent=nthOf(Math.min(BEATS,k+1));
    }
    fillD(k);
  }else{
    fillD(Math.min(BEATS,Math.floor(segProg*BEATS)));
  }
  if(el>=BODYMS)nextSeg();
}

/** Segment e — the breath, on arousal that four segments have already taken
 *  the top off. The orb grows to full size by stylesheet alone. */
function segE(){lastWord=''}

function tickE(el){
  var c=el%CYCLE,inhaling=c<IN;
  var p=inhaling?c/IN:(c-IN)/OUT;
  var e=.5-.5*Math.cos(Math.PI*Math.min(1,p));
  var level=inhaling?e:1-e;
  root.style.setProperty('--level',calm?'0.55':level.toFixed(4));

  var word=inhaling?cfg.inhaleWord:cfg.exhaleWord;
  if(word!==lastWord){lastWord=word;phase.textContent=word}

  segProg=el/BREATHE;
  if(el>=BREATHE)nextSeg();
}

function frame(now){
  if(!running)return;
  if(!t0)t0=now;
  if(!segT0)segT0=now;

  // The backstop, ahead of every segment: two of the five can only be ended by
  // a tap, and a phone put down mid-errand must still reach step 2.
  if(now-t0>=CAP){running=false;go(2);return}

  var el=now-segT0,key=KEYS[segi];
  if(key==='b')tickB(el);
  else if(key==='d')tickD(el);
  else if(key==='e')tickE(el);

  if(!running)return;
  drawRing();
  requestAnimationFrame(frame);
}

function showStill(){still.hidden=false}

function reveal(){
  still.hidden=true;more.hidden=true;
  if(pending)clearTimeout(pending);
  pending=setTimeout(showStill,${STILL_DELAY_MS});
}

function report(params){
  var p=new URLSearchParams(params);
  try{if(navigator.sendBeacon&&navigator.sendBeacon('/surf',p))return}catch(e){}
  try{fetch('/surf',{method:'POST',body:p,keepalive:true,headers:{'x-yixi':'fetch'}}).catch(function(){})}catch(e){}
}

function start(){
  var payload=new URLSearchParams({op:'start'});
  fetch('/surf',{method:'POST',body:payload,headers:{'x-yixi':'fetch'},credentials:'same-origin'})
    .then(function(r){return r.json()})
    .then(function(d){if(d&&typeof d.id==='number')urgeId=d.id})
    .catch(function(){});
}

function pick(){
  var lines=cfg.fin,n=lines.length;
  if(!n)return '';
  if(urgeId===null)return lines[cfg.seed%n];
  var s=String(urgeId),h=0;
  for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;
  return lines[h%n];
}

// Today is the last dot in the row the server drew, and it was drawn before
// this walk-through existed. One step darker, ringed if it was opened.
function bumpToday(outcome){
  if(!month)return;
  var dots=month.querySelectorAll('i.d'),last=dots[dots.length-1];
  if(!last)return;
  var n=0,i;
  for(i=3;i>=0;i--){if(last.classList.contains('n'+i)){n=i;break}}
  last.classList.remove('n'+n);
  last.classList.add('n'+Math.min(3,n+1));
  if(outcome==='opened')last.classList.add('op');
}

function finish(outcome){
  if(settled)return;
  settled=true;running=false;
  fin.textContent=pick();
  if(urgeId===null){
    // No id means the start POST never landed, so there is no row and nothing
    // to draw: a dot painted here would vanish on the next reload, which reads
    // as the page losing the walk-through a second time.
    lost.hidden=false;
  }else{
    report({op:'finish',id:String(urgeId),outcome:outcome});
    bumpToday(outcome);
  }
  go(3);
}

document.addEventListener('click',function(ev){
  var el=ev.target;
  if(!el||!el.closest)return;

  if(el.closest('#up')){go(1);return}
  // The two segments a person ends themselves. 「做完了」 is the whole of
  // segment a; 「好了」 is one of five in segment c, and the fifth is its end.
  if(el.closest('#did-a')){nextSeg();return}
  if(el.closest('#did-c')){sayNext();return}
  if(el.closest('#still')){still.hidden=true;more.hidden=false;return}
  if(el.closest('#again')){
    if(urgeId!==null)report({op:'round',id:String(urgeId)});
    go(1);
    return;
  }
  if(el.closest('#passed')){finish('passed');return}
  if(el.closest('#opened')){finish('opened');return}
  if(el.closest('#a2hs-x')){
    var box=document.getElementById('a2hs');
    if(box)box.hidden=true;
    try{localStorage.setItem('yixi.surf.a2hs','1')}catch(e){}
  }
});

// pointerdown, not click: iOS holds a tap for ~300ms in case a second one
// follows, and at roughly one dot a second that reads as a page that keeps
// missing. touch-action:none on the dot and its area (see the stylesheet) is
// what makes the down event final rather than the start of a possible scroll.
// The listener is the dot's own, which is also how 「点空白处不算」 is enforced:
// there is nothing to listen to on the empty space.
tapdot.addEventListener('pointerdown',function(ev){
  if(KEYS[segi]!=='b')return;
  ev.preventDefault();
  taps++;
  tapdot.hidden=true;
  if(taps>=TAPS){fillB(TAPS);nextSeg();return}
  if(gap)clearTimeout(gap);
  gap=setTimeout(place,GAP+Math.random()*SPAN);
});

if(cfg.a2hs){
  var standalone=false,seen=false;
  try{standalone=window.navigator.standalone===true||window.matchMedia('(display-mode: standalone)').matches}catch(e){}
  try{seen=localStorage.getItem('yixi.surf.a2hs')==='1'}catch(e){}
  var a2hs=document.getElementById('a2hs');
  if(a2hs&&!standalone&&!seen)a2hs.hidden=false;
}

start();
})();`
