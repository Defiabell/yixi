// /surf/setup — 「怎么配」 for the 渡 face: the one and only place the flow is
// personalised, plus the two ways to get to /surf without typing its address
// by hand (home screen, Shortcuts/Siri).
//
// Everything this page asks is asked HERE so that /surf can ask nothing. One
// scene, chosen once, decides the opening line and the three body exits the
// ten minutes rotate through; one optional sentence is whatever the reader
// wants their own worst moment to hear. The flow page then has a single
// interaction on it, and somebody with an urge already running does not have
// to spend anything on picking a category first.
//
// Length rules live here, at the route: this POST is the one and only place
// new content reaches `users.surf_scene`/`users.surf_line`, so it is where
// 「too long」 and 「nothing typed」 get to be a 400 rather than a silent
// truncation. `sceneOf` on the read side stays permissive on purpose — it is
// handed whatever already made it into the column, and a reader mid-urge must
// get a whole page out of it whatever that is.
//
// Zero client JS, same as every other console page's form (settings.ts,
// todaysetup.ts): plain POST, 303 back to GET. That is also why the custom
// text box is always visible rather than revealed by picking 「其他」 — there
// is no script here to reveal it with, and a box that does nothing until the
// radio beside it is picked reads fine.
//
// The entry-instructions section never prints the account's own token —
// only /account does that — it only names where to go get it.

import type { Env, User } from '../types'
import { SURF_LINE_LEN, SURF_SCENE_LEN } from '../types'
import { SCENE_KEYS, SCENES, hasScene, isSceneKey, sceneOf, storedScene } from '../surfscenes'
import { setUserSurfScene } from '../urges'
import { DEFAULT_THEME, escapeHtml, page } from './layout'
import { CONSOLE_CSS, consoleHeader } from './console'
import { localeOf, translator, type Locale, type T } from '../i18n'

export async function handleSurfSetup(request: Request, env: Env, user: User): Promise<Response> {
  const loc = localeOf(request, user)
  const t = translator(loc)
  if (request.method === 'GET') return renderSurfSetup(request, user, t, loc)
  if (request.method === 'POST') return await handlePost(request, env, user)
  return new Response('method not allowed', { status: 405, headers: { allow: 'GET, POST' } })
}

/**
 * Nothing is pre-selected for an account that has never been here: the radios
 * carry `required` instead, so the browser asks for a pick rather than the
 * form quietly submitting somebody else's default. A default scene would be a
 * guess about the most private thing this product stores.
 */
function renderSurfSetup(request: Request, user: User, t: T, loc: Locale): Response {
  const origin = new URL(request.url).origin
  const chosen = hasScene(user) ? sceneOf(user).scene.key : null
  // `sceneOf(user).label` rather than `sceneTrigger(user)`: the latter now
  // carries the `custom:` namespace prefix (see src/surfscenes.ts), and this
  // box wants the reader's own bare words back, not the storage encoding.
  // Safe against the '冲动' fallback — `chosen === 'custom'` only holds when
  // `hasScene(user)` is true, which is exactly the case `label` has real text.
  const custom = chosen === 'custom' ? sceneOf(user).label : ''
  const line = typeof user.surf_line === 'string' ? user.surf_line : ''

  const options = SCENE_KEYS.map((key) => {
    const mark = key === chosen ? ' checked' : ''
    return `    <label class="opt"><input type="radio" name="scene" value="${key}" required${mark}><span>${t(SCENES[key].label)}</span></label>`
  }).join('\n')

  const body = `${consoleHeader(user, 'surfsetup', t)}
<main>
<h1>${t('怎么配')}</h1>
<p class="lede">${t('只需选一次。之后冲动来了，打开就是流程，不再问你任何问题。')}</p>
<form method="post" action="/surf/setup">
  <div class="opts">
${options}
    <input id="custom" type="text" name="custom" maxlength="${SURF_SCENE_LEN}" value="${escapeHtml(custom)}" autocomplete="off" placeholder="${escapeHtml(t('自己写一个'))}" aria-label="${escapeHtml(t('自己写一个'))}">
  </div>
  <div class="field">
    <label for="line">${t('想对那一刻的自己说的一句话')}</label>
    <input id="line" type="text" name="line" maxlength="${SURF_LINE_LEN}" value="${escapeHtml(line)}" autocomplete="off">
  </div>
  <div class="actions"><button type="submit" class="primary">${t('保存')}</button></div>
</form>
<section class="card"><h2>${t('入口')}</h2>
  <p>${t('主屏：在 Safari 打开 /surf，分享 → 添加到主屏幕，会得到一个独立的「渡」图标。')}</p>
  <p>${t(
    '快捷指令：新建一个「打开 URL」动作，地址填 {origin}/surf?k=你的令牌（令牌在<a href="/account">账号</a>页），命名为「渡」，就能对 Siri 说。',
    // `fillParams` (src/i18n/index.ts) does no escaping of its own — it just
    // splices `origin` into the template — so this call site has to escape it
    // itself before it reaches HTML, the same discipline as `custom`/`line`
    // above. `origin` is `new URL(request.url).origin`, so this is normally
    // inert, but nothing downstream re-validates the Host header either.
    { origin: escapeHtml(origin) },
  )}</p>
</section>
</main>`

  return page({
    title: t('怎么配 · 一息'),
    theme: DEFAULT_THEME,
    lang: loc,
    css: CONSOLE_CSS + SURFSETUP_CSS,
    body,
  })
}

/**
 * Every limit answers with a 400 rather than storing a cut-down version. The
 * custom text is only looked at when 「其他」 is the pick — a leftover in that
 * box from a previous visit must not be able to refuse a save of one of the
 * four presets.
 */
async function handlePost(request: Request, env: Env, user: User): Promise<Response> {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return bad()
  }

  const scene = field(form, 'scene')
  if (!isSceneKey(scene)) return bad()
  const custom = field(form, 'custom')
  if (scene === 'custom' && (custom === '' || custom.length > SURF_SCENE_LEN)) return bad()
  const line = field(form, 'line')
  if (line.length > SURF_LINE_LEN) return bad()

  await setUserSurfScene(env.DB, user.id, storedScene(scene, custom), line === '' ? null : line)
  return seeOther('/surf/setup')
}

function field(form: FormData, key: string): string {
  const v = form.get(key)
  return typeof v === 'string' ? v.trim() : ''
}

function bad(): Response {
  return new Response('bad request', { status: 400 })
}

function seeOther(location: string): Response {
  return new Response(null, { status: 303, headers: { location, 'cache-control': 'no-store' } })
}

// --- styles -------------------------------------------------------------------
//
// Appended to CONSOLE_CSS, which styles `label` as a small dim caption above a
// field — the wrong shape for a radio row, where the word is the target you
// tap. `.opt` restores full size and colour and gives the row the 44px iOS
// touch height; the class beats the bare element selector, so the caption rule
// still applies to the one real caption on this page.
const SURFSETUP_CSS = `
.opts{margin:0 0 18px}
.opt{display:flex;align-items:center;gap:12px;min-height:44px;margin:0;font-size:16px;color:var(--fg);line-height:1.5}
.opt input{width:20px;height:20px;accent-color:var(--fg);margin:0;flex:0 0 auto}
/* Indented under 「其他」, and narrow: ten characters is the whole point. It is
   the one control on this page outside a .opt row, so it has to earn its own
   44px iOS touch height rather than inherit one from that class. */
input#custom{margin:4px 0 0 32px;width:auto;max-width:14rem;min-height:44px}
`
