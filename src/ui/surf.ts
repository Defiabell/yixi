// /surf — 「渡」, the ten-minute flow. The third face of the product: not a
// list to read, a thing to walk through while an urge is passing.
//
// Five decisions here are deliberate and must survive future "cleanups":
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
//     step 1 is where the flow would be lost.
//  2. No numeric countdown on step 1, and no skip button. Progress is a ring,
//     because a number invites you to stare at it and tick it down, which is
//     the opposite of the point (the same reasoning as breathe.ts).
//  3. Step 2's asymmetry: 「过去了」 is loud and immediate, 「还想」 arrives
//     800ms later as a small underlined link, and only then offers its own two
//     ways out. Riding it out is meant to be the path of least resistance.
//     This IS the feature — do not "balance" the buttons.
//  4. `start`, `round` and `finish` never block the page. `round` and `finish`
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
import { SURF_ROUND_MS } from '../types'
import { shanghaiDate } from '../db'
import { bumpUrgeRound, createUrge, finishUrge, getUrge, listUrgesSince, summarizeUrges } from '../urges'
import { hasScene, sceneOf, sceneTrigger } from '../surfscenes'
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
    round: SURF_ROUND_MS,
    inhale: INHALE_MS,
    exhale: EXHALE_MS,
    tipMs: TIP_MS,
    inhaleWord: t('吸气'),
    exhaleWord: t('呼气'),
    tips: scene.tips.map((tip) => t(tip)),
    fin: farewellLines(t),
    // Which parting line an unrecorded walk-through gets. A hash of the urge
    // id decides it when there is one; with no id (the start POST never
    // landed) there is nothing to hash, so the server picks the seed.
    seed: now,
    a2hs: iphoneSafari,
  }

  const body = `<main class="flow">
${step0(user, t)}
${step1(scene.tips[0], t)}
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
    bodyAttrs: `class="t-${DEFAULT_THEME}" data-step="0"`,
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

/** Step 1 — the ten minutes. No number, no skip; the ring is the only clock. */
function step1(firstTip: string, t: T): string {
  return `<section class="step" data-step="1">
${orbHtml(t)}
<p class="tip" id="tip">${t(firstTip)}</p>
</section>`
}

/** Step 2 — deciding again. See decision 3 at the top of this file. */
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
 */
function step3(days: Array<{ total: number; opened: number }>, t: T): string {
  const dots = days.map((d) => `<i class="d n${Math.min(3, d.total)}${d.opened > 0 ? ' op' : ''}"></i>`).join('')
  return `<section class="step" data-step="3">
<p class="a1" id="fin"></p>
<p class="a2" id="lost" hidden>${t('这一次没记上。')}</p>
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
body[data-step="3"] .step[data-step="3"]{display:flex}

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

.tip{margin:2.4rem 0 0;font-size:1rem;color:var(--dim);letter-spacing:.12em;text-indent:.12em}

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
body[data-step="1"] .a2hs,body[data-step="2"] .a2hs{display:none}

@media (prefers-reduced-motion:reduce){
  .ink i{animation:none}
}
`

// --- js ----------------------------------------------------------------------

/**
 * The whole flow: four steps, one rAF loop, three requests.
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
var month=document.getElementById('month');

var C=2*Math.PI*112;
ring.style.strokeDasharray=C+' '+C;
ring.style.strokeDashoffset=String(C);

var calm=false;
try{calm=window.matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){}

var urgeId=null,settled=false;
var t0=0,running=false,lastWord='',lastTip=-1,pending=0;

function go(n){
  // The 800ms reveal belongs to step 2 alone. Left running, it un-hides
  // 「还想」 behind a section nobody is looking at any more, and the next
  // pass through step 2 would then start with both halves already showing.
  if(n!==2&&pending){clearTimeout(pending);pending=0}
  doc.setAttribute('data-step',String(n));
  if(n===1)startRing();
  if(n===2)reveal();
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

  if(prog>=1){running=false;go(2);return}
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

if(cfg.a2hs){
  var standalone=false,seen=false;
  try{standalone=window.navigator.standalone===true||window.matchMedia('(display-mode: standalone)').matches}catch(e){}
  try{seen=localStorage.getItem('yixi.surf.a2hs')==='1'}catch(e){}
  var a2hs=document.getElementById('a2hs');
  if(a2hs&&!standalone&&!seen)a2hs.hidden=false;
}

start();
})();`
