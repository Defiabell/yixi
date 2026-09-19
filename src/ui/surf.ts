// /surf — 「渡」, the ten-minute flow. The third face of the product: not a
// list to read, a thing to walk through while an urge is passing.
//
// Four decisions here are deliberate and must survive future "cleanups":
//
//  1. ONE document, five steps. Every step is server-rendered into the same
//     HTML and switched by `body[data-step]`; no step costs a round trip. The
//     page is opened at the exact moment somebody is reaching for a
//     distraction, often on a bad connection — a spinner between step 1 and
//     step 2 is where the flow would be lost.
//  2. No numeric countdown on step 2, and no skip button. Progress is a ring,
//     because a number invites you to stare at it and tick it down, which is
//     the opposite of the point (the same reasoning as breathe.ts).
//  3. Step 3's asymmetry: 「过去了」 is loud and immediate, 「还想」 arrives
//     800ms later as a small underlined link, and only then offers its own two
//     ways out. Riding it out is meant to be the path of least resistance.
//     This IS the feature — do not "balance" the buttons.
//  4. `round`, `finish` and `note` go out through `navigator.sendBeacon` with a
//     non-awaited `keepalive` fetch behind it, never `await` (CONTRIBUTING §2).
//     They fire from a page that is about to be closed or backgrounded; an
//     awaited request is a record that never lands.
//
// 「我点开了」 is an outcome, not a failure. Nothing on this page is red,
// nothing congratulates, nothing scolds — opening it is information about the
// environment, and the one follow-up question asks what to change next time.

import type { Env, UrgeState, User } from '../types'
import { SURF_NOTE_LEN, SURF_ROUND_MS, SURF_TRIGGER_LEN, URGE_STATES, surfTriggers } from '../types'
import { shanghaiDate } from '../db'
import {
  bumpUrgeRound,
  createUrge,
  finishUrge,
  getUrge,
  listUrgesSince,
  setUrgeNote,
  summarizeUrges,
} from '../urges'
import { DEFAULT_THEME, escapeHtml, jsonScript, page } from './layout'
import { EXHALE_MS, INHALE_MS, ORB_CSS, orbHtml } from './breathing'
import { SURF_PWA_HEAD } from './pwa'
import { inAppBrowserOf } from '../inapp'
import { localeOf, translator, type Locale, type T } from '../i18n'

/** How long one body-exit suggestion stays on screen before the next. */
const TIP_MS = 20_000
/** 「还想」 trails 「过去了」 by this much — see decision 3 above. */
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

function isState(raw: string): raw is UrgeState {
  return (URGE_STATES as readonly string[]).includes(raw)
}

/**
 * '' is 「没选」 and is allowed — somebody can tap a trigger chip and nothing
 * else. `null` means the value is neither empty nor one of the five, which is
 * a bug in our own script rather than a shape to guess at, and the caller
 * answers it with a 400.
 */
function readState(raw: string): UrgeState | '' | null {
  if (raw === '') return ''
  return isState(raw) ? raw : null
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
    const state = readState(field(form, 'state'))
    if (state === null) return bad()
    // The trigger is free text the account typed at /surf/setup, so it is cut
    // to length here rather than refused: this POST fires from inside the
    // flow, and a 400 would strand somebody mid-urge over a long chip label.
    const trigger = field(form, 'trigger').slice(0, SURF_TRIGGER_LEN)
    const id = await createUrge(env.DB, { userId: user.id, state, trigger, now })
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

  if (op === 'note') {
    const id = intId(field(form, 'id'))
    if (id === null) return bad()
    const note = field(form, 'note')
    // Unlike `trigger`, this one is refused rather than cut: the note is the
    // person's own sentence, and silently losing its ending is worse than
    // saying no to a body only our own script can produce (the input carries
    // maxlength, so reaching this is already a client that went around it).
    if (note.length > SURF_NOTE_LEN) return bad()
    if (!(await setUrgeNote(env.DB, user.id, id, note))) return notFound()
    return asJson ? ok({ ok: true }) : back()
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

  // Every string the script shows travels in this island, never in the script
  // itself: one constant, the same bytes in both languages.
  const cfg = {
    round: SURF_ROUND_MS,
    inhale: INHALE_MS,
    exhale: EXHALE_MS,
    tipMs: TIP_MS,
    noteMax: SURF_NOTE_LEN,
    inhaleWord: t('吸气'),
    exhaleWord: t('呼气'),
    tips: tipLines(t),
    fin: farewellLines(t),
    // Which parting line an unrecorded walk-through gets. A hash of the urge
    // id decides it when there is one; with no id (the start POST never
    // landed) there is nothing to hash, so the server picks the seed.
    seed: now,
    a2hs: iphoneSafari,
  }

  const body = `<main class="flow">
${step0(user, t)}
${step1(t)}
${step2(t)}
${step3(t)}
${step4(month.days, t)}
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
    bodyAttrs: `class="t-${DEFAULT_THEME}" data-step="0"`,
    body,
    script: SURF_JS,
  })
}

/** The three body exits step 2 rotates through, twenty seconds each. */
function tipLines(t: T): string[] {
  return [t('二十个深蹲。'), t('冷水洗脸。'), t('出门走五分钟。')]
}

/** The five body states, in the order the chips are laid out. */
function stateChips(t: T): Array<[UrgeState, string]> {
  return [
    ['hungry', t('饿')],
    ['angry', t('烦')],
    ['lonely', t('孤独')],
    ['tired', t('累')],
    ['none', t('都不是')],
  ]
}

/**
 * Step 0 — noticing. Two questions, one chip each; picking both starts the
 * record and moves on, with no submit button to find.
 *
 * `data-trigger` carries the SOURCE text (the account's own words, or the zh
 * literal behind a built-in chip), not the translated label: that is what goes
 * into the row, so the same trigger aggregates into one bar on /surf/review
 * whichever language it was picked in.
 */
function step0(user: User, t: T): string {
  const states = stateChips(t)
    .map((pair) => `<button type="button" class="chip" aria-pressed="false" data-state="${pair[0]}">${pair[1]}</button>`)
    .join('')
  const triggers = surfTriggers(user)
    .map(
      (source) =>
        `<button type="button" class="chip" aria-pressed="false" data-trigger="${escapeHtml(source)}">${escapeHtml(t(source))}</button>`,
    )
    .join('')
  return `<section class="step" data-step="0">
<h1>${t('冲动来了。')}</h1>
<p class="q">${t('此刻，身体是哪一种？')}</p>
<div class="chips">${states}</div>
<p class="q">${t('是什么把它引来的？')}</p>
<div class="chips">${triggers}<button type="button" class="chip" aria-pressed="false" data-trigger="">${t('其他')}</button></div>
</section>`
}

/** Step 1 — stand up. The whole point is to be somewhere else holding nothing. */
function step1(t: T): string {
  return `<section class="step" data-step="1">
<p class="a1">${t('放下手机，去另一个房间。')}</p>
<p class="a2">${t('回来再点。')}</p>
<button type="button" class="stop" id="up">${t('我起来了')}</button>
</section>`
}

/** Step 2 — the ten minutes. No number, no skip; the ring is the only clock. */
function step2(t: T): string {
  return `<section class="step" data-step="2">
${orbHtml(t)}
<p class="tip" id="tip">${tipLines(t)[0]}</p>
</section>`
}

/** Step 3 — deciding again. See decision 3 at the top of this file. */
function step3(t: T): string {
  return `<section class="step" data-step="3">
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
 * Step 4 — the end. A parting line, the one optional question, and this
 * month's dots.
 *
 * The dots are rendered here rather than fetched: the row for the walk-through
 * that just ended is written by a beacon whose answer nobody waits for, so the
 * client paints today's dot itself from what it knows.
 */
function step4(days: Array<{ total: number; opened: number }>, t: T): string {
  const dots = days.map((d) => `<i class="d n${Math.min(3, d.total)}${d.opened > 0 ? ' op' : ''}"></i>`).join('')
  return `<section class="step" data-step="4">
<p class="a1" id="fin"></p>
<p class="a2" id="lost" hidden>${t('这一次没记上。')}</p>
<div class="note" id="noteWrap" hidden>
<input id="note" type="text" maxlength="${SURF_NOTE_LEN}" autocomplete="off" enterkeyhint="done" placeholder="${escapeHtml(t('下次哪一步换成什么？'))}">
<div class="noteact">
<button type="button" class="stop" id="noteSave">${t('记下')}</button>
<button type="button" class="go" id="noteSkip">${t('不写了')}</button>
</div>
</div>
<div class="month" id="month">${dots}</div>
<a class="linky" href="/surf">${t('再来一次')}</a>
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
body[data-step="3"] .step[data-step="3"],
body[data-step="4"] .step[data-step="4"]{display:flex}

.step h1{margin:0 0 1.8rem;font-size:1.5rem;font-weight:500;letter-spacing:.14em;text-indent:.14em}
.q{margin:0 0 .9rem;font-size:.95rem;color:var(--dim);letter-spacing:.1em;text-indent:.1em}
.q+.chips{margin-bottom:2.2rem}
.chips{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;max-width:22rem}
.chip{
  min-height:44px;padding:0 18px;border-radius:999px;
  border:1px solid var(--rule);color:var(--dim);
  font-size:1rem;letter-spacing:.06em;text-indent:.06em;
  transition:background .2s ease,color .2s ease;
}
.chip.on{background:var(--stop-bg);color:var(--stop-fg);border-color:var(--stop-border)}
.chip:active{opacity:.72}

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

.tip{margin:2.4rem 0 0;font-size:1rem;color:var(--dim);letter-spacing:.12em;text-indent:.12em}

.note{display:flex;flex-direction:column;align-items:center;width:100%;max-width:20rem;margin-top:1.8rem}
.note input{
  width:100%;font:inherit;font-size:16px;padding:12px 14px;text-align:center;
  color:var(--fg);background:transparent;border:1px solid var(--rule);border-radius:12px;
}
.noteact{display:flex;flex-direction:column;align-items:center}
.noteact .stop{margin-top:1.4rem;padding:.85rem 2.6rem;font-size:1rem}

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

.ns{position:fixed;left:0;right:0;bottom:14vh;margin:0;padding:0 32px;text-align:center;color:var(--dim);font-size:.9rem}

.a2hs{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));
  border:1px solid var(--rule);border-radius:14px;padding:12px 14px;background:var(--bg);
  display:flex;gap:12px;align-items:center;font-size:13px;line-height:1.7;color:var(--dim);box-shadow:0 6px 24px rgba(0,0,0,.08)}
.a2hs p{margin:0;flex:1}
.a2hs button.linky{color:var(--dim);font-size:14px;text-decoration:underline;text-underline-offset:3px;padding:11px 0;min-height:44px}
/* The ten minutes are not the moment to sell an icon. */
body[data-step="1"] .a2hs,body[data-step="2"] .a2hs,body[data-step="3"] .a2hs{display:none}

@media (prefers-reduced-motion:reduce){
  .ink i{animation:none}
  .chip{transition-duration:.01ms}
}
`

// --- js ----------------------------------------------------------------------

/**
 * The whole flow: five steps, one rAF loop, three beacons.
 *
 * WHY NOTHING IS AWAITED. `round`, `finish` and `note` are sent from a page
 * that may be closed or backgrounded a moment later. sendBeacon hands the
 * request to the browser and returns immediately; the fallback is
 * `fetch(..., {keepalive:true})` NOT awaited. An `await` anywhere in here is
 * the shape of a record that silently never lands. CONTRIBUTING section 2.
 * `start` is the one exception and it is a `.then()`, not an `await`: the id it
 * returns is what the other three address, and nothing navigates on that tap.
 *
 * WHY THE rAF TIMESTAMP AND NOT A COUNTER. The ten minutes are measured as
 * `now - t0` inside one requestAnimationFrame loop, `now` being the timestamp
 * rAF itself hands the callback, so a phone that locks the screen for four
 * minutes comes back with four minutes gone rather than with a timer that
 * stopped counting. The same elapsed value drives the breath, the phase word,
 * the tip carousel and the ring, so none of them can drift apart.
 *
 * WHY NO COPY IS IN HERE. Every string comes from the config island, so this
 * constant is the same bytes in both languages.
 */
const SURF_JS = `(function(){
var cfg=JSON.parse(document.getElementById('cfg').textContent);
var IN=cfg.inhale,OUT=cfg.exhale,CYCLE=IN+OUT,ROUND=cfg.round,TIPMS=cfg.tipMs;

var root=document.documentElement,doc=document.body;
var ring=document.getElementById('ring'),phase=document.getElementById('phase'),tip=document.getElementById('tip');
var still=document.getElementById('still'),more=document.getElementById('more');
var fin=document.getElementById('fin'),lost=document.getElementById('lost');
var noteWrap=document.getElementById('noteWrap'),note=document.getElementById('note');
var month=document.getElementById('month');

var C=2*Math.PI*112;
ring.style.strokeDasharray=C+' '+C;
ring.style.strokeDashoffset=String(C);

var calm=false;
try{calm=window.matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){}

var urgeId=null,state=null,trigger=null,settled=false;
var t0=0,running=false,lastWord='',lastTip=-1,pending=0;

function go(n){
  // The 800ms reveal belongs to step 3 alone. Left running, it un-hides
  // 「还想」 behind a section nobody is looking at any more, and the next
  // pass through step 3 would then start with both halves already showing.
  if(n!==3&&pending){clearTimeout(pending);pending=0}
  doc.setAttribute('data-step',String(n));
  if(n===2)startRing();
  if(n===3)reveal();
}

function startRing(){
  t0=0;lastTip=-1;
  if(running)return;
  running=true;
  requestAnimationFrame(frame);
}

function frame(now){
  if(!running)return;
  if(!t0)t0=now;
  var el=now-t0;

  var c=el%CYCLE,inhaling=c<IN;
  var p=inhaling?c/IN:(c-IN)/OUT;
  var e=.5-.5*Math.cos(Math.PI*Math.min(1,p));
  var level=inhaling?e:1-e;
  root.style.setProperty('--level',calm?'0.55':level.toFixed(4));

  var word=inhaling?cfg.inhaleWord:cfg.exhaleWord;
  if(word!==lastWord){lastWord=word;phase.textContent=word}

  var k=Math.floor(el/TIPMS)%cfg.tips.length;
  if(k!==lastTip){lastTip=k;tip.textContent=cfg.tips[k]}

  var prog=Math.min(1,el/ROUND);
  ring.style.strokeDashoffset=String(C*(1-prog));

  if(prog>=1){running=false;go(3);return}
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
  var payload=new URLSearchParams({op:'start',state:state,trigger:trigger});
  fetch('/surf',{method:'POST',body:payload,headers:{'x-yixi':'fetch'},credentials:'same-origin'})
    .then(function(r){return r.json()})
    .then(function(d){if(d&&typeof d.id==='number')urgeId=d.id})
    .catch(function(){});
  go(1);
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
  if(outcome==='opened')noteWrap.hidden=false;
  go(4);
}

function saveNote(){
  var v=note.value.trim();
  if(v&&urgeId!==null)report({op:'note',id:String(urgeId),note:v.slice(0,cfg.noteMax)});
  noteWrap.hidden=true;
}

function mark(chip){
  var group=chip.parentNode.querySelectorAll('.chip'),i;
  for(i=0;i<group.length;i++){group[i].classList.remove('on');group[i].setAttribute('aria-pressed','false')}
  chip.classList.add('on');chip.setAttribute('aria-pressed','true');
}

document.addEventListener('click',function(ev){
  var el=ev.target;
  if(!el||!el.closest)return;

  var chip=el.closest('.chip');
  if(chip){
    if(chip.hasAttribute('data-state'))state=chip.getAttribute('data-state');
    else trigger=chip.getAttribute('data-trigger');
    mark(chip);
    if(state!==null&&trigger!==null)start();
    return;
  }
  if(el.closest('#up')){go(2);return}
  if(el.closest('#still')){still.hidden=true;more.hidden=false;return}
  if(el.closest('#again')){
    if(urgeId!==null)report({op:'round',id:String(urgeId)});
    go(2);
    return;
  }
  if(el.closest('#passed')){finish('passed');return}
  if(el.closest('#opened')){finish('opened');return}
  if(el.closest('#noteSave')){saveNote();return}
  if(el.closest('#noteSkip')){noteWrap.hidden=true;return}
  if(el.closest('#a2hs-x')){
    var box=document.getElementById('a2hs');
    if(box)box.hidden=true;
    try{localStorage.setItem('yixi.surf.a2hs','1')}catch(e){}
  }
});

if(cfg.a2hs){
  var standalone=false,seen=false;
  try{standalone=window.navigator.standalone===true||window.matchMedia('(display-mode: standalone)').matches}catch(e){}
  try{seen=localStorage.getItem('yixi.surf.a2hs')==='1'}catch(e){}
  var a2hs=document.getElementById('a2hs');
  if(a2hs&&!standalone&&!seen)a2hs.hidden=false;
}
})();`
