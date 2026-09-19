// /surf/setup — 「怎么配」 for the 渡 face: edit the trigger chips /surf's
// step 0 offers, plus the two ways to get to /surf without typing its
// address by hand (home screen, Shortcuts/Siri).
//
// Length rules live here, at the route, not inside `surfTriggers` (src/
// types.ts): that reader is a permissive fallback for whatever already made
// it into the column (NULL, garbage, a stray blank line), used every time
// /surf renders its chips. This POST is the one and only place new content
// reaches the column, so it is where "too many lines" and "a line too long"
// get to be a 400 instead of a silent truncation.
//
// Zero client JS, same as every other console page's form (settings.ts,
// todaysetup.ts): plain POST, 303 back to GET.
//
// The entry-instructions section never prints the account's own token —
// only /account does that — it only names where to go get it.

import type { Env, User } from '../types'
import { DEFAULT_SURF_TRIGGERS, SURF_TRIGGER_LEN, SURF_TRIGGER_MAX } from '../types'
import { setUserSurfTriggers } from '../urges'
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
 * The textarea is prefilled with the account's own raw column when it has
 * one, or the four built-in triggers (translated, one per line) when it does
 * not — never `surfTriggers(user)`'s already-deduped/cut view, so re-saving
 * an unedited form round-trips byte for byte.
 */
function renderSurfSetup(request: Request, user: User, t: T, loc: Locale): Response {
  const origin = new URL(request.url).origin
  const prefill = user.surf_triggers ?? DEFAULT_SURF_TRIGGERS.map((source) => t(source)).join('\n')

  const body = `${consoleHeader(user, 'surfsetup', t)}
<main>
<h1>${t('怎么配')}</h1>
<form method="post" action="/surf/setup">
  <div class="field">
    <label for="triggers">${t('冲动来的时候，第一步是认出它从哪来。写下你自己的引子，一行一个，最多八条。留空用默认。')}</label>
    <textarea id="triggers" name="triggers" rows="8">${escapeHtml(prefill)}</textarea>
  </div>
  <div class="actions"><button type="submit" class="primary">${t('保存')}</button></div>
</form>
<section class="card"><h2>${t('入口')}</h2>
  <p>${t('主屏：在 Safari 打开 /surf，分享 → 添加到主屏幕，会得到一个独立的「渡」图标。')}</p>
  <p>${t(
    '快捷指令：新建一个「打开 URL」动作，地址填 {origin}/surf?k=你的令牌（令牌在<a href="/account">账号</a>页），命名为「渡」，就能对 Siri 说。',
    { origin },
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
 * Split on newlines, trim, drop blanks, de-duplicate — same shape as
 * `surfTriggers`'s own read-side pass, but every limit here answers with a
 * 400 instead of quietly cutting the input down to fit.
 */
async function handlePost(request: Request, env: Env, user: User): Promise<Response> {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return bad()
  }
  const raw = form.get('triggers')
  const lines = normalizeLines(typeof raw === 'string' ? raw : '')

  if (lines.length > SURF_TRIGGER_MAX) return bad()
  if (lines.some((line) => line.length > SURF_TRIGGER_LEN)) return bad()

  await setUserSurfTriggers(env.DB, user.id, lines.length === 0 ? null : lines.join('\n'))
  return seeOther('/surf/setup')
}

function normalizeLines(raw: string): string[] {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const rawLine of raw.split('\n')) {
    const trimmed = rawLine.trim()
    if (trimmed.length === 0 || seen.has(trimmed)) continue
    seen.add(trimmed)
    lines.push(trimmed)
  }
  return lines
}

function bad(): Response {
  return new Response('bad request', { status: 400 })
}

function seeOther(location: string): Response {
  return new Response(null, { status: 303, headers: { location, 'cache-control': 'no-store' } })
}

// --- styles -------------------------------------------------------------------
//
// Appended to CONSOLE_CSS, which styles input[type=text/number] but has no
// rule for a textarea yet — this is the first console page to use one.
const SURFSETUP_CSS = `
textarea{display:block;width:100%;font:inherit;font-size:16px;line-height:1.5;
  padding:10px 12px;color:var(--fg);background:transparent;border:1px solid var(--rule);border-radius:10px;
  resize:vertical}
textarea:focus{outline:1px solid var(--ring-prog);outline-offset:0}
`
