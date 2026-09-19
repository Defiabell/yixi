/**
 * Shared HTML shell and design tokens for every page 一息 serves.
 *
 * Hard constraint: ZERO external requests. No CDN, no web font, no image file,
 * not even a favicon fetch (see the `data:` icon below). Someone opens this page
 * in the exact moment they are reaching for a distraction, often on a bad
 * connection — a single blocking round-trip would defeat the product. Everything
 * ships inline in the first response.
 *
 * Two visual skins live side by side until the owner picks one at /mock:
 *   'ink'    — v1 「墨」  a slow wash of ink breathing in the dark
 *   'breath' — v2 「息」  a hairline ring and a single dot, nothing else
 * They share all markup and all JavaScript; only the tokens below differ.
 */

import { PWA_HEAD } from './pwa'
import { htmlLang, type Locale, type T } from '../i18n'

export type ThemeName = 'ink' | 'breath'

/**
 * What /b renders until the owner compares both skins on-device and decides.
 * Flip this one constant to switch the product's face.
 */
export const DEFAULT_THEME: ThemeName = 'ink'

interface ThemeDef {
  /** Safari address-bar tint, per colour scheme. */
  barLight: string
  barDark: string
  /** Custom-property block, light defaults plus a dark override. */
  tokens: string
}

const THEMES: Record<ThemeName, ThemeDef> = {
  // v1 「墨」 — the canonical look is dark: pale ink drifting on near-black.
  // Light mode is not a washed-out copy of that; it inverts into what ink
  // actually is on paper — dark wash on a 宣纸 ground.
  ink: {
    barLight: '#f3f0e8',
    barDark: '#0d0f11',
    tokens: `
:root{
  --bg:#f3f0e8;
  --fg:#1f1c18;
  --dim:rgba(31,28,24,.56);
  --faint:rgba(31,28,24,.30);
  --rule:rgba(31,28,24,.12);
  --ring-track:rgba(31,28,24,.09);
  --ring-prog:rgba(31,28,24,.42);
  --stop-bg:#1f1c18;
  --stop-fg:#f3f0e8;
  --stop-border:#1f1c18;
  --go-fg:rgba(31,28,24,.52);
  --ink-a:rgba(26,24,22,.58);
  --ink-b:rgba(26,24,22,.13);
  --dot:#1f1c18;
  --ink-blur:16px;
  --font:"Songti SC","Source Han Serif SC","Noto Serif CJK SC",STSong,"SimSun",Georgia,"Times New Roman",serif;
}
@media (prefers-color-scheme:dark){
  :root{
    --bg:#0d0f11;
    --fg:rgba(238,235,228,.92);
    --dim:rgba(238,235,228,.50);
    --faint:rgba(238,235,228,.26);
    --rule:rgba(238,235,228,.10);
    --ring-track:rgba(238,235,228,.08);
    --ring-prog:rgba(238,235,228,.38);
    --stop-bg:rgba(238,235,228,.93);
    --stop-fg:#0d0f11;
    --stop-border:transparent;
    --go-fg:rgba(238,235,228,.42);
    --ink-a:rgba(223,231,236,.30);
    --ink-b:rgba(142,166,184,.07);
    --dot:rgba(238,235,228,.92);
    --ink-blur:20px;
  }
}`,
  },

  // v2 「息」 — no decoration at all. A hairline ring, a dot, a lot of nothing.
  breath: {
    barLight: '#fbfaf8',
    barDark: '#0f1011',
    tokens: `
:root{
  --bg:#fbfaf8;
  --fg:#17181a;
  --dim:rgba(23,24,26,.50);
  --faint:rgba(23,24,26,.26);
  --rule:rgba(23,24,26,.10);
  --ring-track:rgba(23,24,26,.09);
  --ring-prog:rgba(23,24,26,.62);
  --stop-bg:#17181a;
  --stop-fg:#fbfaf8;
  --stop-border:#17181a;
  --go-fg:rgba(23,24,26,.45);
  --ink-a:rgba(23,24,26,.40);
  --ink-b:rgba(23,24,26,.08);
  --dot:#17181a;
  --ink-blur:16px;
  --font:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,"Helvetica Neue",sans-serif;
}
@media (prefers-color-scheme:dark){
  :root{
    --bg:#0f1011;
    --fg:#eceae7;
    --dim:rgba(236,234,231,.50);
    --faint:rgba(236,234,231,.26);
    --rule:rgba(236,234,231,.11);
    --ring-track:rgba(236,234,231,.10);
    --ring-prog:rgba(236,234,231,.66);
    --stop-bg:#eceae7;
    --stop-fg:#0f1011;
    --stop-border:transparent;
    --go-fg:rgba(236,234,231,.44);
    --ink-a:rgba(236,234,231,.34);
    --ink-b:rgba(236,234,231,.06);
    --dot:#eceae7;
  }
}`,
  },
}

/**
 * What the /mock switcher calls each skin. The two names are copy rather than
 * data — they are read, not matched on — so they go through the translator
 * like every other string a visitor sees, which is also why they live here
 * and not in `ThemeDef` where nothing could wrap them.
 */
export function themeTitle(name: ThemeName, t: T): string {
  return name === 'ink' ? t('墨') : t('息')
}

/** `?v=1` -> ink, `?v=2` -> breath, anything else -> the current default. */
export function themeFromParam(v: string | null): ThemeName {
  if (v === '1' || v === 'ink') return 'ink'
  if (v === '2' || v === 'breath') return 'breath'
  return DEFAULT_THEME
}

export function themeParam(name: ThemeName): '1' | '2' {
  return name === 'ink' ? '1' : '2'
}

/**
 * The one and only external origin this product is allowed to talk to, and the
 * single break in the "zero external requests" rule at the top of this file.
 *
 * WHY THE EXCEPTION EXISTS. /register is open to anyone who reads the (public)
 * README, and a per-IP throttle alone does not stop a script spread over a few
 * hundred addresses. Turnstile is the only bot check available that does not
 * require running one, and its widget is a script served from Cloudflare's own
 * host — there is no self-hosted build of it. So the choice was "no bot
 * protection" or "one external origin on one page", and this is the second.
 *
 * WHERE THE BREAK IS. Exactly one page, exactly one origin, and only while
 * Turnstile is configured: `pageOptions.turnstile` is what widens the policy,
 * and only src/ui/account.ts's /register handler ever sets it — and only when
 * both keys are present. Every other page (the breathing page, /review,
 * /setup, /settings, /login, /claim, /recover, the landing
 * page) is served with the byte-identical `default-src 'none'` policy it had
 * before Turnstile existed, so none of them can reach any external host. That
 * is a property of the code rather than a promise: the flag that relaxes the
 * CSP is the same flag that emits the loader, so neither can appear without the
 * other, and no caller can name a different host.
 */
const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com'

/** `async defer`: it must never be on the critical path of rendering the form. */
const TURNSTILE_LOADER = `<script src="${TURNSTILE_ORIGIN}/turnstile/v0/api.js" async defer></script>`

/**
 * Content-Security-Policy is how the "zero external requests" rule stops being
 * a promise and starts being enforced: nothing may load from anywhere.
 *
 * `connect-src 'self'` is load-bearing — sendBeacon('/resolve') is a connect-src
 * fetch and would be blocked without it. Note that no directive here restricts
 * the top-level `location.href = 'xhsdiscover://'` jump; `navigate-to` was never
 * shipped by any browser, so the scheme hand-off is untouched by this policy.
 *
 * With `turnstile` on, three directives gain `TURNSTILE_ORIGIN` and nothing
 * else: `script-src` for api.js, `frame-src` for the iframe the widget actually
 * draws itself in (without it the challenge silently never appears, because
 * frame-src falls back to `default-src 'none'`), and `connect-src` for the
 * calls api.js makes back to its own host while solving. `default-src 'none'`
 * still covers everything else even on that page.
 */
function contentSecurityPolicy(turnstile: boolean): string {
  const external = turnstile ? ` ${TURNSTILE_ORIGIN}` : ''
  const directives = [
    "default-src 'none'",
    `script-src 'unsafe-inline'${external}`,
    "style-src 'unsafe-inline'",
    `connect-src 'self'${external}`,
    'img-src data:',
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ]
  if (turnstile) directives.push(`frame-src ${TURNSTILE_ORIGIN}`)
  return directives.join('; ')
}

const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0}
[hidden]{display:none!important}
html{-webkit-text-size-adjust:100%;color-scheme:light dark}
body{
  min-height:100vh;
  min-height:100svh;
  background:var(--bg);
  color:var(--fg);
  font-family:var(--font);
  font-size:16px;
  line-height:1.8;
  -webkit-font-smoothing:antialiased;
  overscroll-behavior:none;
  -webkit-tap-highlight-color:transparent;
}
button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;-webkit-appearance:none;appearance:none;touch-action:manipulation}
a{color:inherit}
::selection{background:var(--fg);color:var(--bg)}
.sp{letter-spacing:.28em;text-indent:.28em}
html[lang=en] .sp,html[lang=en] .brand,html[lang=en] .prelude,html[lang=en] .phase,html[lang=en] .fin,html[lang=en] .a1,html[lang=en] .a2,html[lang=en] h2{letter-spacing:0;text-indent:0}
`

export interface PageOptions {
  title: string
  theme: ThemeName
  /**
   * Which language to declare and to zero the CJK letter-spacing/text-indent
   * rules for. Defaults to 'zh' — every existing caller that has not been
   * converted yet keeps rendering byte-for-byte what it always has.
   */
  lang?: Locale
  /** Page-specific CSS, appended after the reset and the theme tokens. */
  css?: string
  body: string
  /** Inline script, injected at the end of <body>. No modules, no imports. */
  script?: string
  bodyAttrs?: string
  status?: number
  /** Defaults to `no-store`; session pages must never be replayed from cache. */
  cacheControl?: string
  /**
   * `Vary`, for the one page that is both cacheable and language-dependent.
   *
   * The browser's own cache is what this is for. A response whose body follows
   * the `yixi_lang` cookie or `Accept-Language` has to name those headers, or
   * the copy a visitor is already reading stays fresh and on screen for up to
   * a minute after the footer's `?lang=` link has changed the cookie — the
   * switch would simply look broken. (Not for Cloudflare's edge: it does not
   * store a Worker-generated response, and honours no `Vary` but
   * `Accept-Encoding`.) Every other page here is `no-store` and needs none of
   * it.
   */
  vary?: string
  /**
   * Load the Turnstile widget script and widen the CSP by exactly one origin.
   * The only caller is /register, and only when a widget is configured. One flag
   * for both halves on purpose — a page cannot end up with the loader and no
   * policy for it, or a relaxed policy it does not use.
   */
  turnstile?: boolean
  /**
   * Let search engines index this page. Defaults to false, which emits
   * `noindex,nofollow`.
   *
   * Default-deny is the point. Pages other than the landing page and public guides are
   * either somebody's own record (/review, /settings, /account) or a URL with
   * a live session in it (/b?s=…, /claim, /recover) — none of that belongs in
   * an index, and a page added later should be private until somebody decides
   * otherwise rather than the other way round.
   */
  indexable?: boolean
  /**
   * `<meta name="description">` and `og:description`. Without one, a search
   * engine writes its own snippet out of whatever text it finds first, which
   * on the landing page is the in-app-browser warning.
   */
  description?: string
  /**
   * Absolute URL of this page, for `<link rel="canonical">` and `og:url`.
   * Pass the live request's own origin — hardcoding the public instance would
   * make every self-hosted copy declare somebody else's domain as canonical
   * and hand it the ranking.
   */
  canonical?: string
  /**
   * The manifest/touch-icon/app-title block inlined into `<head>`. Defaults
   * to `PWA_HEAD` — every existing caller keeps pointing at 一息's own
   * manifest and icon. `/surf`'s pages pass `SURF_PWA_HEAD` so "add to
   * home screen" there creates a second, independent icon rather than a
   * shortcut into the same installed app.
   */
  pwaHead?: string
}

/**
 * The description/canonical/Open Graph block, empty unless the caller asked
 * for one. Kept out of the template above because it is the only part of the
 * head that is conditional in three different ways, and inlining it there
 * turns a readable document into a nest of ternaries.
 */
function socialTags(o: PageOptions): string {
  const tags: string[] = []
  if (o.description) tags.push(`<meta name="description" content="${escapeHtml(o.description)}">`)
  if (o.canonical) tags.push(`<link rel="canonical" href="${escapeHtml(o.canonical)}">`)
  // og:* only for a page that is meant to be seen by strangers. A private page
  // has nothing to gain from a rich unfurl and something to lose: chat clients
  // fetch these URLs server-side, so a session page would be opened by a bot.
  if (o.indexable) {
    tags.push(`<meta property="og:title" content="${escapeHtml(o.title)}">`)
    if (o.description) tags.push(`<meta property="og:description" content="${escapeHtml(o.description)}">`)
    if (o.canonical) tags.push(`<meta property="og:url" content="${escapeHtml(o.canonical)}">`)
    tags.push('<meta property="og:type" content="website">')
    tags.push('<meta name="twitter:card" content="summary">')
  }
  return tags.length > 0 ? '\n' + tags.join('\n') : ''
}

export function pageHtml(o: PageOptions): string {
  const skin = THEMES[o.theme]
  return `<!doctype html>
<html lang="${htmlLang(o.lang ?? 'zh')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" media="(prefers-color-scheme:light)" content="${skin.barLight}">
<meta name="theme-color" media="(prefers-color-scheme:dark)" content="${skin.barDark}">
${o.indexable ? '' : '<meta name="robots" content="noindex,nofollow">\n'}<link rel="icon" href="data:,">
${o.pwaHead ?? PWA_HEAD}
<title>${escapeHtml(o.title)}</title>${socialTags(o)}
<style>${skin.tokens}${BASE_CSS}${o.css ?? ''}</style>${o.turnstile ? '\n' + TURNSTILE_LOADER : ''}
</head>
<body${o.bodyAttrs ? ' ' + o.bodyAttrs : ''}>
${o.body}
${o.script ? `<script>${o.script}</script>` : ''}
</body>
</html>`
}

export function page(o: PageOptions): Response {
  return new Response(pageHtml(o), {
    status: o.status ?? 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': o.cacheControl ?? 'no-store',
      ...(o.vary ? { vary: o.vary } : {}),
      'content-security-policy': contentSecurityPolicy(o.turnstile === true),
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    },
  })
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * JSON safe to paste inside a `<script>` element of any kind.
 *
 * Three characters JSON itself leaves alone but HTML does not: `<`, so the
 * payload cannot close the tag (`</script>` inside a string would end the
 * element even in the middle of a JSON string), and U+2028/U+2029, which are
 * line terminators to a JavaScript parser and would break a string literal in
 * half. Everything else JSON.stringify has already made safe.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/**
 * Config handed to the inline script as an inert JSON island rather than as
 * generated JavaScript. App labels and URL schemes are user-supplied (via
 * /settings), so they must never be able to become code — see `jsonForScript`.
 */
export function jsonScript(id: string, value: unknown): string {
  return `<script type="application/json" id="${id}">${jsonForScript(value)}</script>`
}

/**
 * The BODY of a single-quoted JavaScript string literal — the quotes are the
 * caller's, so that the caller can decide what happens to them.
 *
 * There is one caller shape: `onclick="return confirm('…')"`, a JavaScript
 * string nested inside a double-quoted HTML attribute, with a translated
 * sentence in the middle. Two escapings are needed and they compose in one
 * order only — JavaScript first, HTML second:
 *
 *     onclick="return confirm('${escapeHtml(jsSingleQuotedBody(t('…')))}')"
 *
 * A `'` in a translation becomes `\'` here and then `\&#39;` after
 * `escapeHtml`; the HTML parser hands `\'` to JavaScript, which reads it as an
 * escaped apostrophe rather than the end of the string. A `"` survives as
 * `&quot;` and is an ordinary character inside single quotes. The quotes stay
 * out of this function precisely so `escapeHtml` cannot turn the delimiters
 * themselves into `&#39;` — which would work, but would rewrite bytes that
 * every existing Chinese page already emits.
 */
export function jsSingleQuotedBody(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

// --- a line to copy -----------------------------------------------------------
//
// The two 「怎么配」 pages exist to move a handful of exact strings off a screen
// and into somewhere else: an address into Safari, a finished gate URL into the
// Shortcuts editor, a token into a password manager. Printing them inside
// <code> or a bare `user-select:all` block makes that a three-gesture job on
// the phone this product is written for — tap, hunt for 「拷贝」 in the iOS
// callout, hope the selection took the whole line. One button does it.
//
// Two shapes, one component. A URL somebody should be able to *open* is a real
// <a href>, so a tap goes there and a long press offers 「拷贝链接」; a line
// that is only ever pasted somewhere else (a gate URL with a token in it, the
// token itself) stays plain text and keeps `user-select:all`, because a link
// that navigates to it would put the token in Safari History for good.

export interface CopyLineOptions {
  /** The exact characters to copy. Also what is shown; escaped here, so pass it raw. */
  text: string
  /** Show the text as a link to this address. Leave it out for a paste-only line. */
  href?: string
  /** A quiet line above saying what this is. Plain text — it is escaped here. */
  label?: string
  /**
   * What this line is, for the button's `aria-label` — 「复制小红书」 rather
   * than the sixth 「复制」 in a row. Escaped here.
   */
  name?: string
  /** The table-cell variant: no bottom margin, smaller type. */
  tight?: boolean
  /**
   * This line is not the real string yet — a placeholder stands where the
   * token will be — so it gets no button.
   *
   * A 「复制」 that puts `<先点上面的「显示」>` on the clipboard and then says
   * 「已复制」 is worse than no button at all: the reader pastes it into the
   * Shortcuts editor and the only thing that ever tells them is a
   * `kCFErrorDomainCFNetwork` this page's own troubleshooting section says is
   * undiagnosable. The text box stays, `user-select:all` and all, exactly as
   * it was before any of this existed.
   */
  incomplete?: boolean
}

/**
 * One line plus its button. The payload is the element's own text rather than
 * a `data-` attribute holding a second copy of it: one string on the page
 * cannot drift from the other, and what gets copied is by construction what
 * the reader can see.
 */
export function copyLine(t: T, o: CopyLineOptions): string {
  const shown = escapeHtml(o.text)
  const body = o.href === undefined ? shown : `<a href="${escapeHtml(o.href)}">${shown}</a>`
  // `sel` only on the paste-only shape: `user-select:all` over a link turns a
  // tap meant to open it into a selection.
  const textClass = o.href === undefined ? 'cpl-t sel' : 'cpl-t'
  const head = o.label === undefined ? '' : `\n  <p class="cpl-k">${escapeHtml(o.label)}</p>`
  const button =
    o.incomplete === true
      ? ''
      : `<button class="cpl-b" type="button"${
          o.name === undefined ? '' : ` aria-label="${escapeHtml(t('复制{name}', { name: o.name }))}"`
        }>${t('复制')}</button>`
  return `<div class="cpl${o.tight === true ? ' tight' : ''}${o.incomplete === true ? ' bare' : ''}">${head}
  <div class="cpl-r"><span class="${textClass}">${body}</span>${button}</div>
</div>`
}

/**
 * Wiring for every copy line on the page, in one pass.
 *
 * The same behaviour src/ui/account.ts's own `copyScript` gives the token card,
 * generalised from one element pair to N: clipboard where there is one, and
 * where there is not — `navigator.clipboard` needs a secure context, which
 * `wrangler dev` over plain http is not — select the line's contents so iOS
 * offers 「拷贝」 on the long-press menu. A button that silently does nothing is
 * worse than no button.
 *
 * Built per request rather than held as a constant, because the two words it
 * puts on the button are copy like any other; `jsonForScript` rather than
 * quotes of our own, because a translation is allowed an apostrophe and this is
 * a classic `<script>`, where the parser looks for `</script` inside the string
 * before JavaScript ever sees it.
 *
 * Where this has to be more than account.ts's one-button version: with six
 * buttons on /setup, 「已复制」 left standing on a button is a claim about the
 * clipboard that stops being true the moment the next one is pressed. Copy
 * 小红书's line, then 起点读书's, and two buttons say 已复制 while the
 * clipboard holds one string — which is the exact mix-up the per-app lines
 * exist to prevent. So every button goes back to its own original label before
 * the pressed one speaks, and 「已复制」 clears itself after two seconds: it is
 * an event, not a state.
 *
 * The selection fallback is the one label that does NOT time out. It is an
 * instruction rather than a confirmation — the long press it asks for has not
 * happened yet — and taking it away mid-gesture would be its own small bug. It
 * clears the next time any button is pressed, like everything else.
 */
export function copyLinesScript(t: T): string {
  return `
(function(){
  var rows=document.querySelectorAll('.cpl-r'),all=[],timer=null;
  function restore(){
    if(timer){clearTimeout(timer);timer=null}
    for(var j=0;j<all.length;j++)all[j].b.textContent=all[j].l;
  }
  for(var i=0;i<rows.length;i++){(function(row){
    var text=row.querySelector('.cpl-t'),btn=row.querySelector('.cpl-b');
    if(!text||!btn)return;
    all.push({b:btn,l:btn.textContent});
    function select(){
      var r=document.createRange();r.selectNodeContents(text);
      var sel=window.getSelection();
      if(sel){sel.removeAllRanges();sel.addRange(r)}
      restore();
      btn.textContent=${jsonForScript(t('长按拷贝'))};
    }
    btn.addEventListener('click',function(){
      var s=text.textContent||'';
      if(navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(s).then(function(){
          restore();
          btn.textContent=${jsonForScript(t('已复制'))};
          timer=setTimeout(restore,2000);
        },select);
      }else{select()}
    });
  })(rows[i])}
})();`
}

/**
 * Appended by the two pages that use `copyLine`, and by nothing else — every
 * other page has to keep rendering byte for byte what it did before.
 *
 * The quiet furniture the 怎么配 pages already wear: the `--rule` ground of
 * `pre.copy`, the `--num` face figures and URLs are set in, `var(--dim)` for
 * the button, the way `button.linky` is dim rather than accented. Nothing here
 * is a colour this product does not already use.
 *
 * The row is a flexbox rather than a button floated over the text: at 390px a
 * gate URL with a 32-character token in it is far wider than the screen, and an
 * overlaid button would sit on top of whichever characters happened to be
 * scrolled under it. The text scrolls sideways inside its own box — the same
 * `overflow-x:auto` `pre.copy` has always had — and the button is a fixed
 * column beside it, 44px tall at the tightest, with a hairline of page ground
 * between the two so they never read as one slab.
 */
export const COPY_LINE_CSS = `
.cpl{margin:0 0 1rem;max-width:100%}
.cpl.tight{margin:0}
.cpl-k{margin:0 0 .35rem;font-size:.86rem;color:var(--dim);line-height:1.5}
.cpl-r{display:flex;align-items:stretch;background:var(--rule);border-radius:10px;max-width:100%}
.cpl-t{
  flex:1 1 auto;min-width:0;
  font-family:var(--num);font-size:.88rem;line-height:1.7;
  padding:12px 0 12px 14px;
  overflow-x:auto;white-space:pre;
}
.cpl.tight .cpl-t{padding:8px 0 8px 10px;font-size:.82rem}
/* No button beside it, so the text box closes its own right edge. */
.cpl.bare .cpl-t{padding-right:14px}
.cpl.bare.tight .cpl-t{padding-right:10px}
.cpl-t.sel{-webkit-user-select:all;user-select:all}
.cpl-t a{color:inherit;text-underline-offset:3px}
.cpl-b{
  flex:0 0 auto;align-self:stretch;
  min-height:44px;min-width:44px;padding:0 14px;
  font-size:.86rem;color:var(--dim);white-space:nowrap;
  border-left:1px solid var(--bg);border-radius:0 10px 10px 0;
}
.cpl-b:active{opacity:.6}
`

/**
 * The two language names, the one being read rendered as plain text rather
 * than as a link back to the page the reader is already standing on.
 *
 * Shared by the landing page's footer and the signed-out account shell so the
 * switcher cannot drift into two designs. Each name is written in its own
 * language — 「中文」 is what a Chinese reader looks for even on an English
 * page — so neither goes through `t`.
 *
 * `search` is the current URL's query string, and passing it is the difference
 * between switching language and losing where you were going: `?lang=en` on its
 * own *replaces* the query, so tapping English on `/login?next=/settings` used
 * to sign you in and then drop you on /review. Every other param is carried
 * across and only `lang` is rewritten. With no query at all the result is the
 * bare `?lang=en` this emitted before, byte for byte — which is what keeps the
 * landing page's Chinese output where it was.
 *
 * `URLSearchParams` does the encoding, so a param a visitor put in the address
 * bar cannot break out of the attribute (`"`, `<` and `&` all come back
 * percent-encoded); `escapeHtml` over the whole href is belt and braces, and
 * turns the separators this function itself writes into `&amp;`.
 */
export function langSwitch(loc: Locale, search = ''): string {
  const href = (target: Locale): string => {
    const params = new URLSearchParams(search)
    params.delete('lang')
    params.append('lang', target)
    return escapeHtml('?' + params.toString())
  }
  return loc === 'en'
    ? `English · <a href="${href('zh')}">中文</a>`
    : `<a href="${href('en')}">English</a> · 中文`
}
