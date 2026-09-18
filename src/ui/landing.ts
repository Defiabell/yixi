import { DEFAULT_THEME, langSwitch, page } from './layout'
import { inAppBrowserPattern } from '../inapp'
import { localeOf, translator } from '../i18n'

/**
 * GET / — what a stranger sees, and now the front door as well: /register and
 * /login are the two links that used to be "ask the person who gave you a
 * token". Wearing the same skin as the breathing page means flipping
 * DEFAULT_THEME re-dresses the whole product at once.
 *
 * The 隐私 section is the part to keep honest rather than flattering. Sealing a
 * copy of the token so people can get it back is strictly weaker than storing
 * only a hash, and this page says so in the same breath as the guarantee that
 * still holds — otherwise the first paragraph is doing marketing.
 */
export function renderLanding(request: Request): Response {
  const url = new URL(request.url)
  const loc = localeOf(request, null)
  const t = translator(loc)

  // The language being read right now is plain text, not a link — a link back
  // to the page you are already standing on is a dead end wearing a pointer.
  // Shared with the signed-out account pages; see `langSwitch` in ./layout.ts.
  // The query goes with it so a link that arrived carrying one keeps it; on the
  // bare `/` this page is normally read at, that is the empty string and the
  // href is the same `?lang=en` it has always been.
  const langLine = langSwitch(loc, url.search)

  return page({
    title: t('一息 —— 打开 App 之前先呼吸十秒，「今日」收好最重要的三件事'),
    theme: DEFAULT_THEME,
    lang: loc,
    css: LANDING_CSS,
    script: INAPP_SCRIPT,
    // The landing page and public guides are discoverable. Private pages stay
    // noindex by default — see PageOptions.indexable.
    indexable: true,
    // One literal where this used to be three concatenated ones: `t()` looks
    // itself up by its whole first argument, so the sentence cannot be built
    // out of pieces.
    description: t('在 iPhone 上打开小红书这类 App 之前，先看着一团墨呼吸十秒，然后再决定进不进去；「今日」一页则收好未来一段时间最重要的三件事，一按就去做。自建的 One Sec 替代品：一个网页加 iOS 快捷指令，不用装 App，跑在 Cloudflare 免费额度里。'),
    // The live origin, not a constant: a self-hosted copy must not name this
    // instance as its canonical URL.
    canonical: url.origin + '/',
    // Static text and no session, so it may sit in a cache for a minute — but
    // the text is no longer the same for every visitor: it follows the
    // language cookie and Accept-Language. `vary` is what the browser's own
    // cache needs to hear. Without it, the footer's `?lang=` link rewrites the
    // cookie and the browser still replays the copy it was already reading,
    // for up to a minute; with it, that copy no longer matches the request and
    // the new language is on screen at once.
    cacheControl: 'public, max-age=60',
    vary: 'Accept-Language, Cookie',
    body: `<main class="doc">
<h1>一息</h1>
<p class="lede">${t('在你打开一个 App 之前，先呼吸十秒。')}</p>

<p class="two">${t('一息做两件事。<b>拦</b>：打开小红书这类 App 之前先呼吸十秒。<b>引</b>：把未来一段时间最重要的三件事放在<a href="/today">今日</a>一页，一按就去做。两件事各自能用，共用一个账号。')}</p>

<p class="inapp" id="inapp" hidden>${t('这一页是从某个 App 的内置浏览器打开的。\n逛可以，<b>但配置那一步不行</b>——内置浏览器不让网页跳去别的 App，而配置里要靠这个验证。\n点右上角的「⋯」，选「在浏览器中打开」。')}</p>

<div class="peek" role="img" aria-label="${t('呼吸页示意：一团墨随呼吸涨落，外圈是倒计时')}">
  <div class="orb">
    <div class="ink" aria-hidden="true"><i class="l1"></i><i class="l2"></i><i class="l3"></i></div>
    <svg class="ring" viewBox="0 0 240 240" aria-hidden="true" focusable="false">
      <circle class="tr" cx="120" cy="120" r="112"></circle>
      <circle class="pg" cx="120" cy="120" r="112"></circle>
    </svg>
  </div>
  <p class="phase" aria-hidden="true"><span class="in">${t('吸气')}</span><span class="out">${t('呼气')}</span></p>
</div>

<p>${t('十秒之后，页面先递给你「算了」，过一会儿才递给你「继续」。\n顺序是故意的——大多数时候你会发现，那一下其实只是手指的惯性。')}</p>

<h2>${t('怎么工作')}</h2>
<ol>
<li>${t('iPhone 的「快捷指令」在你打开某个 App 时，先来这里问一句该不该拦。')}</li>
<li>${t('该拦就跳到呼吸页，倒计时期间没有任何按钮可以点。')}</li>
<li>${t('选「继续」会放行一分半，免得刚跳回去又被自己拦住。')}</li>
</ol>

<h2>${t('它记什么')}</h2>
<p>${t('只记时间、哪个 App、以及你那次是继续了还是放下了。\n过一阵你能看到自己一周被拦了多少次，其中多少次没进去。')}</p>

<h2>${t('关于隐私')}</h2>
<p>${t('注册只要一个邮箱和一个密码。邮箱不发信、不验证，只是你下次登录的用户名。')}</p>
<p>${t('真正的身份是一把 token，快捷指令拿它认人。它加密存在服务器上，\n所以你登录之后还能看回来——代价是数据库和密钥同时泄露时它会跟着泄。\n这是为了「忘了也找得回来」换的，值不值得你自己判断。')}</p>
<p>${t('记录只有你自己看得到。发号的人只看得到聚合次数，看不到任何一条明细——\n不然这东西没人会真的用。')}</p>
<p>${t('上面这几句都可以自己核对：<a href="https://github.com/Defiabell/yixi" rel="noreferrer">代码是开源的</a>。\n不想把这类数据放在别人的服务器上，照 README 部署一份自己的，\n跑在 Cloudflare 免费额度里，不花钱。')}</p>

<h2>${t('长什么样')}</h2>
<p>${t('上面那团就是。倒计时期间页面上没有任何按钮，十秒之后才先出现「算了」。\n<span class="looks">整页看看：<a href="/mock?v=1">墨</a><a href="/mock?v=2">息</a></span>')}</p>

<h2>${t('开始用')}</h2>
<p class="looks go"><a href="/register">${t('注册')}</a><a href="/login">${t('登录')}</a></p>

<p class="foot">${t('已经有别人发给你的 token 了？<a href="/claim">给它绑上邮箱和密码</a>，别重新注册——\n重新注册会拿到一把新的，旧记录就找不回来了。<br>\n配到 iPhone 上的一步一步说明在<a href="/setup">怎么配</a>，登录之后打开就行。<br>\n源码 · <a href="https://github.com/Defiabell/yixi" rel="noreferrer">github.com/Defiabell/yixi</a>')}</p>
<p><a href="/guides/iphone-shortcuts">${t("iPhone 快捷指令教程：打开 App 前先呼吸十秒")}</a><br><a href="/compare/one-sec">${t("一息与 one sec：安装、功能和隐私比较")}</a></p>
<p class="lang">${langLine}</p>
</main>`,
  })
}

const LANDING_CSS = `
/* A live miniature of the breathing page, not a screenshot of one.
 *
 * The landing page is forbidden from making any request of its own (asserted
 * in test/breathe.test.ts), so an image would have to be a base64 data: URI —
 * a couple of hundred kilobytes of markup on a page that is otherwise 5KB, and
 * it would be a still. The thing being sold is the motion, and the motion is
 * already pure CSS on the real page, so it is cheaper AND more honest to run
 * the real thing at 1/2 size.
 *
 * Same ink layers, same ring, same rhythm as /b — INHALE_MS 4s, EXHALE_MS 6s.
 * The one difference is that the real page drives scale from JS via --level,
 * because it has to stay in step with a countdown; here a keyframe does it.
 */
.inapp{margin:1.6rem 0 0;padding:.85rem 1rem;font-size:.88rem;line-height:1.75;
  color:var(--dim);border:1px solid var(--rule);border-radius:10px}
.inapp b{color:var(--fg)}
.peek{display:flex;flex-direction:column;align-items:center;gap:.9rem;margin:2.4rem 0 2.8rem}
.peek .orb{position:relative;width:min(46vw,178px);height:min(46vw,178px);display:grid;place-items:center}
.peek .ring{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg);overflow:visible}
.peek .ring circle{fill:none;stroke-width:1.3;stroke-linecap:round}
.peek .ring .tr{stroke:var(--ring-track)}
.peek .ring .pg{stroke:var(--ring-prog);stroke-dasharray:703.7;stroke-dashoffset:703.7;
  animation:peek-ring 10s linear infinite}
.peek .ink{position:absolute;width:100%;height:100%;will-change:transform,opacity;
  animation:peek-breathe 10s ease-in-out infinite}
.peek .ink i{position:absolute;display:block;border-radius:50%;filter:blur(calc(var(--ink-blur) * .62))}
.peek .ink .l1{left:6%;top:8%;width:86%;height:84%;
  background:radial-gradient(circle at 47% 45%,var(--ink-a) 0%,var(--ink-b) 44%,transparent 68%);
  animation:d1 41s ease-in-out infinite}
.peek .ink .l2{left:14%;top:3%;width:72%;height:78%;opacity:.74;
  background:radial-gradient(circle at 58% 60%,var(--ink-a) 0%,var(--ink-b) 38%,transparent 63%);
  animation:d2 59s ease-in-out infinite}
.peek .ink .l3{left:1%;top:17%;width:80%;height:73%;opacity:.9;
  background:radial-gradient(circle at 40% 56%,var(--ink-b) 0%,transparent 64%);
  animation:d3 73s ease-in-out infinite}
/* Two words cross-faded rather than one word animated: the content property
   cannot be
   animated on an element that already has text, so a keyframe swapping it
   would have left this reading 吸气 while the ink was plainly shrinking. */
.peek .phase{position:relative;margin:0;height:1.2em;width:4em;
  font-size:.8rem;color:var(--faint);letter-spacing:.34em;text-indent:.34em}
/* 4em is two CJK glyphs and their tracking. An English word is longer and is
   not tracked out (BASE_CSS zeroes .phase's letter-spacing under lang=en), so
   it gets its own width and is centred under the orb. Gated on the attribute
   so not one Chinese pixel moves. */
html[lang="en"] .peek .phase{width:6em;text-align:center}
.peek .phase span{position:absolute;inset:0;animation:peek-word 10s steps(1,end) infinite}
.peek .phase .out{animation-name:peek-word-out}
@keyframes peek-breathe{
  0%{transform:scale(.60);opacity:.50}
  40%{transform:scale(1);opacity:1}
  100%{transform:scale(.60);opacity:.50}
}
@keyframes peek-ring{from{stroke-dashoffset:703.7}to{stroke-dashoffset:0}}
/* 吸 4s，呼 6s —— 和上面那团墨共用一条 10s 时间轴，所以字和形状不会各说各的。 */
@keyframes peek-word{0%{opacity:1}40%{opacity:0}100%{opacity:0}}
@keyframes peek-word-out{0%{opacity:0}40%{opacity:1}100%{opacity:1}}
@keyframes d1{0%{transform:translate(0,0) rotate(0deg) scale(1)}50%{transform:translate(2.5%,-3%) rotate(180deg) scale(1.09)}100%{transform:translate(0,0) rotate(360deg) scale(1)}}
@keyframes d2{0%{transform:translate(0,0) rotate(0deg) scale(1.04)}50%{transform:translate(-3%,3%) rotate(-180deg) scale(.94)}100%{transform:translate(0,0) rotate(-360deg) scale(1.04)}}
@keyframes d3{0%{transform:translate(0,0) rotate(0deg) scale(.96)}50%{transform:translate(3%,3.5%) rotate(150deg) scale(1.07)}100%{transform:translate(0,0) rotate(300deg) scale(.96)}}
@media (prefers-reduced-motion:reduce){
  .peek .ink,.peek .ink i,.peek .ring .pg,.peek .phase span{animation:none}
  .peek .phase .out{opacity:0}
  .peek .ink{transform:scale(.86);opacity:.8}
  .peek .ring .pg{stroke-dashoffset:246}
}

.doc{
  max-width:34rem;margin:0 auto;
  padding:calc(env(safe-area-inset-top) + 12vh) 28px calc(env(safe-area-inset-bottom) + 16vh);
}
h1{
  margin:0 0 .4rem;font-size:1.9rem;font-weight:400;
  letter-spacing:.42em;text-indent:.42em;
}
.lede{margin:0 0 1.6rem;color:var(--dim);font-size:.98rem;letter-spacing:.06em}
.two{margin:0 0 2.8rem;color:var(--dim);font-size:15px;line-height:1.75}
.two b{color:var(--fg)}
.two a{color:var(--dim)}
h2{
  margin:3rem 0 .9rem;font-size:.84rem;font-weight:400;color:var(--faint);
  letter-spacing:.3em;text-indent:.3em;
}
h2::before{
  content:"";display:block;width:22px;height:1px;
  background:var(--rule);margin-bottom:1.4rem;
}
p{margin:0 0 1.1rem;color:var(--fg);opacity:.88;letter-spacing:.02em}
ol{margin:0;padding-left:1.3rem;color:var(--fg);opacity:.88}
li{margin-bottom:.55rem;padding-left:.2rem;letter-spacing:.02em}
li::marker{color:var(--faint)}
.looks a{
  display:inline-block;margin-left:.9rem;padding:.2rem .95rem;
  border:1px solid var(--rule);border-radius:999px;
  text-decoration:none;font-size:.85rem;color:var(--dim);
}
/* The one thing on this page anybody is meant to press, so it is the one thing
   wearing the breathing page's own button. */
.looks.go a{margin:0 .8rem 0 0;padding:.5rem 1.6rem;font-size:.95rem;min-height:44px;color:var(--fg)}
.looks.go a:first-child{background:var(--stop-bg);color:var(--stop-fg);border-color:var(--stop-border)}
.foot{margin-top:4rem;color:var(--faint);font-size:.87rem;line-height:1.9}
.foot a{color:var(--dim);text-underline-offset:3px}
.lang{margin:1.4rem 0 0;color:var(--faint);font-size:.85rem}
.lang a{color:var(--dim);text-underline-offset:3px}
`

/**
 * The landing page is edge-cacheable (`public, max-age=60`), so it cannot vary
 * its HTML on User-Agent the way /settings and /setup do — a UA-dependent body
 * behind a shared cache serves one visitor's answer to the next. So the notice
 * ships hidden in every copy and is revealed in the browser instead.
 *
 * The pattern comes from src/inapp.ts rather than being retyped here. Two
 * copies of a list like this drift, and this project has already paid for that
 * once with the scheme denylist.
 *
 * Worth having on this page and not only on /settings: the most likely first
 * contact is a link shared in WeChat, and somebody who signs up there and then
 * cannot make 试跳 work has no way to know the two facts are connected.
 */
const INAPP_SCRIPT = `
(function () {
  if (!/${inAppBrowserPattern()}/i.test(navigator.userAgent || '')) return;
  var el = document.getElementById('inapp');
  if (el) el.hidden = false;
})();
`
