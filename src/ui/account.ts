// The account pages: register, sign in, bind an old token, reset a password,
// and the one page that shows somebody their own gate token again.
//
// What these replaced: the owner minting a token by hand at /admin and sending
// it over a chat app. That worked for three people and for nobody after them,
// and it had no answer at all for "I lost it".
//
// THE CLOSED LOOP, which is the only thing on these pages worth explaining
// carefully to a reader:
//
//   forgot the password → reset it with the token       (/recover)
//   forgot the token    → sign in and read it back      (/account)
//   lost both           → nothing. The account is gone.
//
// There is no mail in the middle because there is no mail service, deliberately
// (see the header of src/account.ts). That makes the last line real rather than
// theoretical, so /register states it in those words, above the form, before
// anyone types anything. A person who finds out about it later, at the moment
// they need it, has been lied to by omission.
//
// Everything here is a plain HTML form with POST/redirect/GET. No fetch, no
// framework, no client-side validation that the server does not repeat: these
// pages are opened one-handed on a phone, often on the connection that made
// somebody reach for the phone in the first place.
//
// Language: every handler builds one translator per request and hands it down.
// The three signed-out pages resolve their language from the request alone
// (`localeOf(request, null)` — there is no account yet to ask); /account asks
// the account first, since somebody who has chosen a language has chosen it
// here.

import type { Env, User } from '../types'
import {
  accountErrorMessage,
  accountSummary,
  changePassword,
  claimAccount,
  login,
  logout,
  rotateToken,
  register,
  resetPasswordWithToken,
  revealToken,
  type AccountError,
} from '../account'
import { sessionIdFrom } from '../auth'
import { shanghaiDate } from '../db'
import { TURNSTILE_FIELD, turnstileKeys, verifyTurnstile } from '../turnstile'
import { CONSOLE_CSS, consoleHeader, faceFromRequest, type Face } from './console'
import { localeOf, msg, translator, type Locale, type T } from '../i18n'
import { DEFAULT_THEME, escapeHtml, jsonForScript, langSwitch, page } from './layout'

/**
 * Mirrors src/account.ts, which is the authority and re-checks every one of
 * them. These exist only so the `minlength`/`maxlength` attributes and the
 * sentence printed next to a field cannot drift apart from each other.
 */
const PASSWORD_MIN = 8
const PASSWORD_MAX = 200
const EMAIL_MAX = 254
const NAME_MAX = 40

// Written where the failure is, translated where the page is: a module-level
// constant cannot call a per-request `t()`, so `msg()` marks the Chinese source
// for test/i18n.test.ts's guard and every use site passes it through its own
// translator. Same technique as the tab labels in ./console.ts.
const FORM_UNREADABLE = msg('表单没读出来，重试一次。')

// --- /register --------------------------------------------------------------

export async function handleRegister(request: Request, env: Env): Promise<Response> {
  // No account to ask yet, so the request itself decides the language.
  const loc = localeOf(request, null)
  const t = translator(loc)

  // Read once and reuse: the site key renders the widget, the secret verifies
  // it, and a deployment with neither renders no widget and verifies nothing.
  const turnstile = turnstileKeys(env)
  const siteKey = turnstile?.siteKey ?? null

  // Everything every render of this page needs before it has anything to say.
  // `search` is here rather than at each call site so the footer switcher keeps
  // the query on the four error renders too, not just on the first GET.
  const base = { siteKey, loc, t, search: new URL(request.url).search }

  if (request.method === 'GET') return registerPage(base)
  if (request.method !== 'POST') return methodNotAllowed()

  const form = await readForm(request)
  if (!form) return registerPage({ ...base, error: t(FORM_UNREADABLE), status: 400 })

  const draft: SignupDraft = { email: field(form, 'email'), name: field(form, 'name') }
  const password = secret(form, 'password')

  // Deliberately the first thing checked, ahead of the password-match test and
  // well ahead of register()'s PBKDF2. Not only to save the work: this page is
  // the one place in the product that answers "is this address already
  // registered" (see SECURITY.md — it is an unavoidable leak in a signup form
  // with no verification mail), so putting the challenge first means that
  // oracle costs a solved challenge too, not just a cheap POST.
  //
  // Reads as a no-op when no widget is configured; that is the whole fail-open
  // design, and src/turnstile.ts explains what it costs.
  const human = await verifyTurnstile(turnstile, field(form, TURNSTILE_FIELD))
  if (!human.allow) {
    // One sentence for every way this can fail — no token, expired token,
    // replayed token, forged token — in the same spirit as /login below. The
    // outcome type does not even carry the reason, so this cannot drift.
    return registerPage({ ...base, draft, error: t(CHALLENGE_FAILED), status: 400 })
  }

  // Whether two boxes match is a question about this form, not about the
  // account, so it never reaches src/account.ts.
  if (password !== secret(form, 'password2')) {
    return registerPage({ ...base, draft, error: t(MISMATCH), status: 400 })
  }

  const res = await register(env, { email: draft.email, password, name: draft.name || undefined })
  if (!res.ok) {
    // Being told the address is taken is useless without a way to act on it,
    // and retyping it into a form the user has to go find is the friction that
    // makes people register a second throwaway account instead.
    const action =
      res.error === 'email_taken'
        ? { href: `/login?email=${encodeURIComponent(draft.email)}`, label: t('去登录 →') }
        : undefined
    return registerPage({ ...base, draft, error: accountErrorMessage(res.error, t), status: 400, action })
  }

  // 303 rather than rendering the account page from this POST: a phone that
  // pull-to-refreshes on the result would otherwise re-submit a registration.
  return seeOther('/account?new=1', res.setCookie)
}

interface SignupDraft {
  email: string
  name: string
}

/** What every page function on this file needs before it can say anything. */
interface Lang {
  loc: Locale
  t: T
}

interface RegisterOptions extends Lang {
  /** Non-null only when a Turnstile widget is configured; see src/turnstile.ts. */
  siteKey: string | null
  draft?: SignupDraft
  error?: string
  status?: number
  action?: { href: string; label: string }
  /** The request's query string, for the footer switcher; see `langSwitch`. */
  search?: string
}

function registerPage(o: RegisterOptions): Response {
  const d = o.draft
  const t = o.t
  return gatePage({
    title: t('注册 · 一息'),
    lang: o.loc,
    t,
    langSwitch: true,
    ...(o.search ? { search: o.search } : {}),
    status: o.status,
    // The only page in the product that loads anything from another host, and
    // only while a widget is actually configured. layout.ts explains the break.
    turnstile: o.siteKey !== null,
    body: `<h1>${t('注册')}</h1>
<p class="lede">${t('注册之后你会拿到一把 <b>token</b>。iPhone 的「快捷指令」拿它认出你，你被拦下的每一条记录也都记在它名下。它就是这个账号本身。')}</p>
${banner(o.error, 'bad', o.action)}

<section class="card deal">
  <h2>${t('先说清楚代价')}</h2>
  <p>${t('这里<b>没有邮件服务</b>。邮箱不发信、不验证，也不能用来找回密码——它只是你下次登录时的用户名。')}</p>
  <p>${t('能救你的是两样东西，它们互为备份：')}</p>
  <ul>
    <li>${t('<b>忘了密码</b> —— 用 token 重置。在<a href="/recover">重置那一页</a>把 token 贴进去，直接设一个新的。')}</li>
    <li>${t('<b>忘了 token</b> —— 用密码登录，账号页上点一下就能看到它。它是加密存在服务器上的。')}</li>
    <li>${t('<b>两样都丢了</b> —— <b>没有办法</b>。没有验证邮件、没有客服、没有后门。这个账号连同里面所有记录都拿不回来，只能重新注册一个空的。')}</li>
  </ul>
  <p class="note flat">${t('这个闭环是故意做成这样的：一个自己用的小工具不值得为它接一整套邮件系统，代价就是你得自己留住其中一样。注册完先把 token 存进密码管理器，一分钟的事。')}</p>
</section>

<section class="card">
  <form method="post" action="/register">
    ${emailField('f-reg-email', d?.email ?? '', 'username', t)}
    <div class="field">
      <label for="f-reg-name">${t('名字 · 选填，只显示在这几个页面上')}</label>
      <input id="f-reg-name" type="text" name="name" value="${escapeHtml(d?.name ?? '')}"
        maxlength="${NAME_MAX}" autocomplete="nickname" placeholder="${t('留空就用邮箱 @ 前面那截')}">
    </div>
    ${passwordField('f-reg-pw', 'password', t('密码 · 至少 {min} 位', { min: PASSWORD_MIN }), 'new-password')}
    ${passwordField('f-reg-pw2', 'password2', t('再打一遍'), 'new-password')}
    ${turnstileWidget(o.siteKey, o.loc, t)}
    <div class="actions">
      <button class="primary" type="submit">${t('注册')}</button>
    </div>
  </form>
</section>

<p class="foot">${t('已经有账号了？<a href="/login">登录</a>。<br>\n手里已经有一把别人发给你的 token？<a href="/claim">给它绑上邮箱和密码</a>，别在这里重新注册——重新注册会拿到一把新的，旧记录就找不回来了。')}</p>`,
  })
}

// --- /login -----------------------------------------------------------------

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const loc = localeOf(request, null)
  const t = translator(loc)
  const url = new URL(request.url)
  const q = url.searchParams
  const next = safeNext(q.get('next'), request.url)
  // Kept for the footer switcher, so tapping English on /login?next=/settings
  // does not quietly throw the destination away. See `langSwitch`.
  const search = url.search

  if (request.method === 'GET') {
    // Arriving either from the "already registered" banner with the address
    // already typed once, or from a signed-out tap on a console link. Both
    // deserve to land where they were going.
    const prefill = q.get('email') ?? ''
    return loginPage({ loc, t, search, ...(prefill ? { email: prefill } : {}), next })
  }
  if (request.method !== 'POST') return methodNotAllowed()

  const form = await readForm(request)
  if (!form) return loginPage({ loc, t, search, error: t(FORM_UNREADABLE), status: 400 })

  const email = field(form, 'email')
  const res = await login(env, { email, password: secret(form, 'password') })

  // Note what is missing: any branch on *why* it failed. src/account.ts collapses
  // "no such address", "malformed address" and "wrong password" into one error
  // code and burns the same PBKDF2 work in all three cases, and this page must
  // not undo that by wording them apart. Given what /review contains, "does this
  // person use 一息" is itself worth hiding, so the failed response — message,
  // status, and every byte of markup — is identical for a stranger and for a
  // real account with a typo'd password.
  if (!res.ok) return loginPage({ loc, t, search, email, error: accountErrorMessage(res.error, t), status: 401, next })
  return seeOther(next ?? '/review', res.setCookie)
}

interface LoginOptions extends Lang {
  email?: string
  next?: string
  error?: string
  status?: number
  /** The request's query string, for the footer switcher; see `langSwitch`. */
  search?: string
}

function loginPage(o: LoginOptions): Response {
  const t = o.t
  return gatePage({
    title: t('登录 · 一息'),
    lang: o.loc,
    t,
    langSwitch: true,
    ...(o.search ? { search: o.search } : {}),
    status: o.status,
    body: `<h1>${t('登录')}</h1>
<p class="lede">${t('登录只是为了让你在这几个页面上看到自己的记录和 token。快捷指令那边不受影响，它认的一直是 token。')}</p>
${banner(o.error)}

<section class="card">
  <form method="post" action="${o.next ? `/login?next=${encodeURIComponent(o.next)}` : '/login'}">
    ${emailField('f-in-email', o.email ?? '', 'username', t)}
    ${passwordField('f-in-pw', 'password', t('密码'), 'current-password')}
    <div class="actions">
      <button class="primary" type="submit">${t('登录')}</button>
    </div>
  </form>
</section>

<p class="foot">${t('忘了密码？<a href="/recover">用 token 重置</a>。<br>\n还没有账号？<a href="/register">注册一个</a>。')}</p>`,
  })
}

// --- /claim -----------------------------------------------------------------

/**
 * Binding an email and password onto a token that predates accounts.
 *
 * This page exists because registering afresh mints a *different* token, which
 * would quietly abandon the holder's history, their app config and — for the
 * owner, whose own token is the oldest one there is — their `is_owner` flag.
 * Anybody arriving with a token in hand belongs here, not on /register.
 */
export async function handleClaim(request: Request, env: Env): Promise<Response> {
  const loc = localeOf(request, null)
  const t = translator(loc)

  if (request.method === 'GET') return claimPage({ loc, t })
  if (request.method !== 'POST') return methodNotAllowed()

  const form = await readForm(request)
  if (!form) return claimPage({ loc, t, error: t(FORM_UNREADABLE), status: 400 })

  const draft: SignupDraft = { email: field(form, 'email'), name: field(form, 'name') }
  const password = secret(form, 'password')
  if (password !== secret(form, 'password2')) {
    return claimPage({ loc, t, draft, error: t(MISMATCH), status: 400 })
  }

  const res = await claimAccount(env, {
    // Trimmed, unlike a password: a token pasted with a stray space is the
    // single most common way this whole product fails to work (see /setup).
    token: field(form, 'token'),
    email: draft.email,
    password,
    name: draft.name || undefined,
  })
  if (!res.ok) return claimPage({ loc, t, draft, error: accountErrorMessage(res.error, t), status: 400 })
  return seeOther('/account?claimed=1', res.setCookie)
}

interface ClaimOptions extends Lang {
  draft?: SignupDraft
  error?: string
  status?: number
}

function claimPage(o: ClaimOptions): Response {
  const d = o.draft
  const t = o.t
  return gatePage({
    title: t('绑定 · 一息'),
    lang: o.loc,
    t,
    status: o.status,
    body: `<h1>${t('给已有的 token 绑账号')}</h1>
<p class="lede">${t('你手里那把 token 是发号时代给出去的，只有哈希存在服务器上。绑一次邮箱和密码，以后忘了它就能登录看回来。')}</p>
${banner(o.error)}

<section class="card">
  <form method="post" action="/claim">
    ${tokenField('f-cl-token', t)}
    ${emailField('f-cl-email', d?.email ?? '', 'username', t)}
    <div class="field">
      <label for="f-cl-name">${t('名字 · 选填，留空就沿用现在这个')}</label>
      <input id="f-cl-name" type="text" name="name" value="${escapeHtml(d?.name ?? '')}"
        maxlength="${NAME_MAX}" autocomplete="nickname">
    </div>
    ${passwordField('f-cl-pw', 'password', t('密码 · 至少 {min} 位', { min: PASSWORD_MIN }), 'new-password')}
    ${passwordField('f-cl-pw2', 'password2', t('再打一遍'), 'new-password')}
    <div class="actions">
      <button class="primary" type="submit">${t('绑定')}</button>
    </div>
  </form>
  <p class="note">${t('token 本身不变，快捷指令不用改。绑定只是多给这个账号一条登录的路。')}</p>
</section>

<p class="foot">${t('没有 token，只是想开始用？<a href="/register">注册一个新的</a>。')}</p>`,
  })
}

// --- /recover ---------------------------------------------------------------

export async function handleRecover(request: Request, env: Env): Promise<Response> {
  const loc = localeOf(request, null)
  const t = translator(loc)

  if (request.method === 'GET') return recoverPage({ loc, t })
  if (request.method !== 'POST') return methodNotAllowed()

  const form = await readForm(request)
  if (!form) return recoverPage({ loc, t, error: t(FORM_UNREADABLE), status: 400 })

  const password = secret(form, 'password')
  if (password !== secret(form, 'password2')) return recoverPage({ loc, t, error: t(MISMATCH), status: 400 })

  const res = await resetPasswordWithToken(env, { token: field(form, 'token'), password })
  // The token is never echoed back into the re-rendered form. Retyping it is a
  // nuisance; leaving somebody's gate credential sitting in the markup of an
  // error page is worse.
  if (!res.ok) return recoverPage({ loc, t, error: accountErrorMessage(res.error, t), status: 400 })
  return seeOther('/account?reset=1', res.setCookie)
}

interface RecoverOptions extends Lang {
  error?: string
  status?: number
}

function recoverPage(o: RecoverOptions): Response {
  const t = o.t
  return gatePage({
    title: t('重置密码 · 一息'),
    lang: o.loc,
    t,
    status: o.status,
    body: `<h1>${t('用 token 重置密码')}</h1>
<p class="lede">${t('这里不发验证邮件。能证明你是你的，是你手里那把 token——它是 128 位随机数，比一封能被人翻走的邮件更硬。')}</p>
${banner(o.error)}

<section class="card">
  <form method="post" action="/recover">
    ${tokenField('f-rc-token', t)}
    ${passwordField('f-rc-pw', 'password', t('新密码 · 至少 {min} 位', { min: PASSWORD_MIN }), 'new-password')}
    ${passwordField('f-rc-pw2', 'password2', t('再打一遍'), 'new-password')}
    <div class="actions">
      <button class="primary" type="submit">${t('重置并登录')}</button>
    </div>
  </form>
  <p class="note">${t('token 一般在你当初配快捷指令时那条「文本」动作里，或者在你的密码管理器里。重置之后 <b>token 不变</b>，快捷指令照常工作；但所有已经登录的浏览器都会被踢下线，只留你手上这一个。')}</p>
</section>

<p class="foot">${t('token 也丢了？那这个账号真的回不来了，只能<a href="/register">重新注册一个空的</a>。<br>\n密码想起来了？<a href="/login">去登录</a>。')}</p>`,
  })
}

// --- /account ---------------------------------------------------------------

export async function handleAccount(request: Request, env: Env, user: User): Promise<Response> {
  // The one page where the account's own stored language outranks the browser's
  // — it is where that language was chosen.
  const loc = localeOf(request, user)
  const t = translator(loc)
  // /account is of no face (see console.ts's module header), so its own header
  // borrows whichever face the reader was last on rather than always falling
  // back to 拦截 — the bug this cookie exists to fix.
  const face = faceFromRequest(request) ?? undefined

  if (request.method === 'GET') {
    const q = new URL(request.url).searchParams
    return await accountPage(env, user, {
      loc,
      t,
      face,
      reveal: q.get('show') === '1',
      welcome: q.has('new') ? 'new' : q.has('claimed') ? 'claimed' : q.has('reset') ? 'reset' : q.has('saved') ? 'saved' : null,
    })
  }
  if (request.method !== 'POST') return methodNotAllowed()

  const form = await readForm(request)
  if (!form) return await accountPage(env, user, { loc, t, face, error: t(FORM_UNREADABLE), status: 400 })

  const op = field(form, 'op')

  if (op === 'logout') {
    return seeOther('/', await logout(env, sessionIdFrom(request)))
  }

  if (op === 'rotate') {
    const res = await rotateToken(env, { user, currentPassword: secret(form, 'current') })
    if (!res.ok) {
      const message =
        res.error === 'invalid_credentials' ? t(WRONG_CURRENT_PASSWORD) : accountErrorMessage(res.error, t)
      return await accountPage(env, user, { loc, t, face, error: message, status: 400 })
    }
    // Rendered, not redirected: a 303 would drop the plaintext, and putting it
    // in the redirect's query string would write the new credential straight
    // into browser history — the thing rotation was called on to fix.
    return await accountPage(env, user, { loc, t, face, rotated: res.token })
  }

  if (op !== 'password') {
    return await accountPage(env, user, { loc, t, face, error: t('不认识这个操作。'), status: 400 })
  }

  const next = secret(form, 'password')
  if (next !== secret(form, 'password2')) {
    return await accountPage(env, user, { loc, t, face, error: t(MISMATCH), status: 400 })
  }

  const res = await changePassword(env, {
    user,
    currentPassword: secret(form, 'current'),
    newPassword: next,
  })
  if (!res.ok) {
    return await accountPage(env, user, { loc, t, face, error: passwordChangeMessage(res.error, t), status: 400 })
  }
  // changePassword drops every session including this one, so the fresh cookie
  // it hands back has to ride along or the redirect below lands on a 401.
  return seeOther('/account?saved=1', res.setCookie)
}

/**
 * `invalid_credentials` means something different on this form than it does on
 * /login: the session already says who you are, so the only thing that can be
 * wrong is the current-password box. Saying "邮箱或密码不对" here would send
 * somebody hunting for a typo in a field that is not on the page.
 */
function passwordChangeMessage(error: AccountError, t: T): string {
  return error === 'invalid_credentials' ? t(WRONG_CURRENT_PASSWORD) : accountErrorMessage(error, t)
}

const WRONG_CURRENT_PASSWORD = msg('当前密码不对。')

type Welcome = 'new' | 'claimed' | 'reset' | 'saved' | null

/**
 * The only remedy for a leaked token, and the only place it is offered.
 *
 * Deliberately not one tap: rotating invalidates the credential every automation
 * on the phone is using, so an accidental rotation means the tool silently stops
 * working until every Shortcut is edited. The password requirement is both an
 * authorisation check and a speed bump.
 */
function rotateCard(t: T): string {
  return `<section class="card">
  <h2 class="card-title">${t('换一把新 token')}</h2>
  <p class="note">${t('泄漏了才需要这么做。<b>旧 token 立刻失效</b>，你手机上每一条用到它的快捷指令都得把网址里的\n  <span class="mono">k=</span> 换成新的，改完之前那些 App 不会再被拦。改密码不会换 token，两者互不影响。')}</p>
  <form method="post" action="/account">
    <div class="field">
      <label for="f-rot">${t('当前密码')}</label>
      <input id="f-rot" type="password" name="current" required autocomplete="current-password">
    </div>
    <button class="danger" type="submit" name="op" value="rotate">${t('换一把')}</button>
  </form>
</section>`
}

/** Printed once. The plaintext exists only inside this one response. */
function rotatedCard(token: string, t: T): string {
  return `<section class="card">
  <h2 class="card-title">${t('新 token')}</h2>
  <p class="note">${t('<b>只显示这一次。</b>现在就存进密码管理器，然后去把快捷指令里的网址换掉。')}</p>
  <p class="reveal"><span class="mono tok" id="tok">${escapeHtml(token)}</span>
    <button class="linky" type="button" id="cp">${t('复制')}</button></p>
  <p class="note">${t('旧的那把已经不认了。去<a href="/setup?show=1">怎么配</a>拿现成的整行网址。')}</p>
</section>`
}

interface AccountOptions extends Lang {
  reveal?: boolean
  /** The freshly issued token, printed once and never retrievable this way again. */
  rotated?: string
  welcome?: Welcome
  error?: string
  status?: number
  /** The face to render the header as — see `handleAccount`'s own comment. */
  face?: Face
}

async function accountPage(env: Env, user: User, o: AccountOptions): Promise<Response> {
  const t = o.t
  const summary = await accountSummary(env, user)
  // Asked for only on the request that is going to print it. The default render
  // cannot leak a token it never fetched — the masking is not a CSS trick over
  // a value that is sitting in the markup anyway.
  const token = o.reveal ? await revealToken(env, user) : null

  return page({
    title: t('账号 · {name}', { name: user.name }),
    theme: DEFAULT_THEME,
    lang: o.loc,
    css: CONSOLE_CSS + ACCOUNT_CSS,
    status: o.status ?? 200,
    body: `${consoleHeader(user, 'account', t, o.face)}
<main>
  <h1>${t('账号')}</h1>
  ${banner(o.error, 'bad')}
  ${welcomeBanner(o.welcome ?? null, t)}

  <section class="card">
    <div class="card-head">
      <span class="name">${escapeHtml(user.name)}</span>
      <span class="key">#${user.id}</span>
      ${user.is_owner ? '<span class="badge">owner</span>' : ''}
    </div>
    <p class="flat">${summary.email ? `<span class="mono">${escapeHtml(summary.email)}</span>` : `<span class="none">${t('还没有绑定邮箱')}</span>`}</p>
    <p class="note">${t('加入于 <span class="num">{date}</span>', { date: escapeHtml(shanghaiDate(user.created_at)) })}</p>
  </section>

  ${o.rotated ? rotatedCard(o.rotated, t) : tokenCard(o.reveal === true, token, t)}
  ${summary.hasPassword ? passwordCard(t) : bindCard(t)}
  ${summary.hasPassword && !o.rotated ? rotateCard(t) : ''}
  ${languageCard(o.loc, t)}

  <hr class="sep">
  <form method="post" action="/account">
    <button class="linky" type="submit" name="op" value="logout">${t('退出登录')}</button>
  </form>
  <p class="note">${t('退出只清掉这台设备上的登录状态。快捷指令照常拦你——它认的是 token，不是这个登录。')}</p>
  <p class="note">${t('不想把这些记录放在别人的服务器上？\n    <a href="https://github.com/Defiabell/yixi" rel="noreferrer">源码在这里</a>，\n    照 README 部署一份自己的，跑在 Cloudflare 免费额度里。')}</p>
</main>`,
    script: (o.reveal === true && token !== null) || o.rotated ? copyScript(t) : undefined,
  })
}

/**
 * The switch itself, and the only one a signed-in reader gets — the console
 * header is full at 390px, and the footer that carries it on / and /login is
 * not on a page with a nav.
 *
 * Each language is written in its own language, so neither name goes through
 * `t()`: 「中文」 is what a Chinese reader looks for even on an English page.
 * The one being read is still a link (going to /account?lang=zh from Chinese is
 * harmless) but carries `aria-current="page"` — the canonical token for "this
 * one of the set is the one you are on" — so a screen reader is told which of
 * the two is in force rather than being left to infer it from the page's
 * language. Both wear `.tap`, the 44px target every other link in these cards
 * has.
 */
function languageCard(loc: Locale, t: T): string {
  const link = (target: Locale, label: string): string =>
    `<a class="linky tap" href="/account?lang=${target}"${loc === target ? ' aria-current="page"' : ''}>${label}</a>`
  return `<section class="card">
  <h2>${t('语言')}</h2>
  <div class="actions">
    ${link('en', 'English')}
    ${link('zh', '中文')}
  </div>
</section>`
}

function welcomeBanner(w: Welcome, t: T): string {
  switch (w) {
    case 'new':
      return banner(t('注册好了。别急着走——先点下面的「显示」，把 token 存进密码管理器。'), 'good')
    case 'claimed':
      return banner(t('绑好了。以后忘了 token 就用邮箱和密码登录，在这一页看回来。'), 'good')
    case 'reset':
      return banner(t('密码已经重置，其他设备上的登录都被踢掉了。'), 'good')
    case 'saved':
      return banner(t('密码改好了。其他设备上的登录都被踢掉了，这台还在。'), 'good')
    default:
      return ''
  }
}

/**
 * The token, masked by default.
 *
 * It is the key to every private record this person has, and the realistic way
 * it escapes is not an attacker on the wire — it is a screenshot, a screen share
 * or somebody standing behind them on the subway. So the default page does not
 * contain it: revealing is a plain GET to /account?show=1, which fetches and
 * prints it, and the page is `no-store` with `referrer-policy: no-referrer`
 * (both from layout.ts), so neither a cache nor a Referer carries it onward.
 *
 * Doing it server-side rather than with a CSS mask over a hidden value is the
 * difference between "you cannot see it" and "it is not there".
 */
function tokenCard(revealed: boolean, token: string | null, t: T): string {
  const head = `<h2>${t('你的 token')}</h2>
  <p class="note flat">${t('快捷指令用它认出你，它也是你所有记录的钥匙。别截图，别贴进聊天框。')}</p>`

  if (!revealed) {
    return `<section class="card">
  ${head}
  <p class="tok masked" aria-hidden="true">••••••••••••••••</p>
  <div class="actions">
    <a class="linky tap" href="/account?show=1">${t('显示')}</a>
  </div>
  <p class="note">${t('要把它配进 iPhone，去<a href="/setup">怎么配</a>——那一页已经替你把完整的地址拼好了，照抄就行。')}</p>
</section>`
  }

  if (token === null) {
    // Either an old row that was never claimed, or one sealed under a TOKEN_KEY
    // that has since been rotated. The token still works; it just cannot be
    // shown, and saying so beats printing something plausible and wrong.
    return `<section class="card">
  ${head}
  <p class="empty">${t('服务器这边打不开你的 token 原文，只存着它的哈希。<br>它照常能用，只是这里看不到。')}</p>
  <div class="actions"><a class="linky tap" href="/claim">${t('用它绑一次账号')}</a></div>
</section>`
  }

  return `<section class="card">
  ${head}
  <p class="tok" id="tok">${escapeHtml(token)}</p>
  <div class="actions">
    <button class="linky tap" type="button" id="cp">${t('复制')}</button>
    <a class="linky tap" href="/account">${t('藏起来')}</a>
  </div>
  <p class="note">${t('要把它配进 iPhone，去<a href="/setup">怎么配</a>——那一页已经替你把完整的地址拼好了，照抄就行。')}</p>
</section>`
}

function passwordCard(t: T): string {
  return `<section class="card">
  <h2>${t('改密码')}</h2>
  <form method="post" action="/account">
    ${passwordField('f-ac-cur', 'current', t('当前密码'), 'current-password')}
    ${passwordField('f-ac-pw', 'password', t('新密码 · 至少 {min} 位', { min: PASSWORD_MIN }), 'new-password')}
    ${passwordField('f-ac-pw2', 'password2', t('再打一遍'), 'new-password')}
    <div class="actions">
      <button class="primary" type="submit" name="op" value="password">${t('保存新密码')}</button>
    </div>
  </form>
  <p class="note">${t('改密码不会换掉 token，快捷指令不用动。但其他设备上的登录会全部失效，只留你手上这一个。')}</p>
</section>`
}

function bindCard(t: T): string {
  return `<section class="card">
  <h2>${t('还没有密码')}</h2>
  <p class="flat">${t('这个账号是发号时代建的，只有一把 token，没有邮箱也没有密码。现在这样也能用，但 token 一丢就没了。')}</p>
  <div class="actions"><a class="linky tap" href="/claim">${t('给它绑上邮箱和密码')}</a></div>
</section>`
}


/**
 * Clipboard, with a selection fallback. `navigator.clipboard` needs a secure
 * context, which `wrangler dev` over plain http is not, and a copy button that
 * silently does nothing is worse than no button — the fallback selects the
 * token so iOS offers 拷贝 on the long-press menu.
 *
 * Built per request rather than held as a constant, because the two words it
 * puts on the button are copy like any other. `jsonForScript` rather than
 * quotes of our own: a translation is allowed an apostrophe, which would
 * otherwise end the string literal it sits in. It is `jsonForScript` rather
 * than a bare `JSON.stringify` because this is a classic `<script>`, where the
 * parser looks for `</script` inside the string before JavaScript ever sees it
 * — neither of today's two words contains one, and that is a fact about the
 * copy, not a property of the escaping. The next translation is not bound by it.
 */
function copyScript(t: T): string {
  return `
var b=document.getElementById('cp'),t=document.getElementById('tok');
if(b&&t){b.addEventListener('click',function(){
  var s=t.textContent||'';
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(s).then(function(){b.textContent=${jsonForScript(t('已复制'))}},select);
  }else{select()}
  function select(){
    var r=document.createRange();r.selectNodeContents(t);
    var sel=window.getSelection();
    if(sel){sel.removeAllRanges();sel.addRange(r)}
    b.textContent=${jsonForScript(t('已选中，长按拷贝'))};
  }
})}`
}

// --- shared page shell ------------------------------------------------------

interface GatePageOptions {
  title: string
  body: string
  lang: Locale
  t: T
  status?: number
  /** Only /register ever sets this, and only when a widget is configured. */
  turnstile?: boolean
  /**
   * The footer language switcher, on the two pages a stranger actually lands
   * on. /claim and /recover are reached from a link on one of those two, or
   * from a token somebody was handed — by then the language is already
   * decided, and a switcher on a page whose whole job is one paste is noise.
   */
  langSwitch?: boolean
  /**
   * The current URL's query string, so the switcher can keep it. Without it a
   * tap on English from `/login?next=/settings` throws the destination away.
   */
  search?: string
}

/**
 * The shell for the three pages a signed-out stranger can reach. No console
 * header — there is no user yet — but the same tokens, the same card and field
 * styling, and the same narrow column, so arriving here from / does not feel
 * like arriving at a different product.
 */
function gatePage(o: GatePageOptions): Response {
  return page({
    title: o.title,
    theme: DEFAULT_THEME,
    lang: o.lang,
    css: CONSOLE_CSS + ACCOUNT_CSS + (o.turnstile ? TURNSTILE_CSS : ''),
    status: o.status ?? 200,
    ...(o.turnstile ? { turnstile: true } : {}),
    body: `<main class="gate">
<a class="mark" href="/">一息</a>
${o.body}${o.langSwitch ? `\n<p class="lang">${langSwitch(o.lang, o.search)}</p>` : ''}
</main>`,
  })
}

// --- form pieces ------------------------------------------------------------

/**
 * Only a same-site path survives. An absolute URL forwarded from `?next=` would
 * make the sign-in page an open redirect — the classic way a phishing link
 * borrows a real login screen to collect real credentials.
 *
 * The check resolves the value instead of matching its shape, because matching
 * its shape is what got this wrong the first time: the guard here used to be
 * `startsWith('/') && !startsWith('//')`, and `/\evil.example.com/` sails
 * through it. Browsers treat a backslash as a slash in the authority position
 * of an http(s) URL, so that value redirects off-site from a link that lives on
 * the real domain. Letting the URL parser decide leaves no shapes left to
 * enumerate — and the parser is the same one the browser will use.
 */
function safeNext(raw: string | null, base: string): string | undefined {
  if (!raw) return undefined
  try {
    const resolved = new URL(raw, base)
    if (resolved.origin !== new URL(base).origin) return undefined

    // Resolving is not enough on its own: `/..//evil.example.com/` normalises to
    // a same-origin URL whose *pathname* is `//evil.example.com/`, and handing
    // that back as a Location header is protocol-relative all over again. Parse
    // to normalise, then check the normalised form — the order matters, because
    // this check is only trustworthy on output the parser produced.
    const path = resolved.pathname + resolved.search
    return sameSitePath(path) ? path : undefined
  } catch {
    return undefined
  }
}

/**
 * Whether a *parser-normalised* `pathname + search` is safe to hand back as a
 * `Location` header — that is, whether the browser will stay on this site.
 *
 * Exported because `?lang=` in src/index.ts builds a Location out of a
 * normalised pathname too, and hits the identical trap: `/..//evil.example.com`
 * normalises to a pathname of `//evil.example.com`, which as a Location is
 * protocol-relative and leaves the origin entirely. One rule, one home — two
 * copies of an open-redirect guard is how one of them ends up a version behind.
 *
 * `/\` is checked even though the WHATWG parser never emits it for an http(s)
 * URL (it folds a backslash in the path into `/`, which is why the caller must
 * normalise first): the cost is one comparison, and the cost of being wrong
 * about a parser detail here is an open redirect. `%5C` is a different matter —
 * it stays percent-encoded, so it is an ordinary path character, not an
 * authority separator.
 */
export function sameSitePath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\')
}

const MISMATCH = msg('两次输入的密码不一样，再来一次。')

/**
 * Every Turnstile rejection, worded once. Which one it was — nothing submitted,
 * expired, already used, forged — is exactly the thing not to tell whoever is
 * probing, and `TurnstileOutcome` does not carry the reason to this layer at all,
 * so there is nothing here to accidentally branch on.
 */
const CHALLENGE_FAILED = msg('人机验证没过。刷新这一页，重新验证一次。')

/**
 * `action` is the way out of the problem the banner just described — "this
 * address is already registered" is only half an answer without a link to the
 * sign-in page.
 *
 * Both the message and the link are escaped, with no exception for "our own"
 * strings: the moment one message is allowed to carry markup, the next one
 * carries a user's email.
 */
function banner(
  text: string | undefined,
  kind: 'bad' | 'good' = 'bad',
  action?: { href: string; label: string },
): string {
  if (!text) return ''
  const cta = action
    ? ` <a class="banner-go" href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a>`
    : ''
  return `<p class="banner ${kind}">${escapeHtml(text)}${cta}</p>`
}

function emailField(id: string, value: string, autocomplete: string, t: T): string {
  return `<div class="field">
      <label for="${id}">${t('邮箱 · 只当用户名用，不发信')}</label>
      <input id="${id}" type="email" name="email" value="${escapeHtml(value)}" required
        maxlength="${EMAIL_MAX}" autocomplete="${autocomplete}" inputmode="email"
        autocapitalize="none" autocorrect="off" spellcheck="false">
    </div>`
}

function passwordField(id: string, name: string, label: string, autocomplete: string): string {
  const min = autocomplete === 'new-password' ? ` minlength="${PASSWORD_MIN}"` : ''
  return `<div class="field">
      <label for="${id}">${label}</label>
      <input id="${id}" type="password" name="${name}" required${min} maxlength="${PASSWORD_MAX}"
        autocomplete="${autocomplete}">
    </div>`
}

/**
 * Deliberately `type="text"`. A masked field makes it impossible to see whether
 * a 32-character paste landed intact, and a token pasted with a trailing space
 * is the failure this product already has a troubleshooting section about.
 */
function tokenField(id: string, t: T): string {
  return `<div class="field">
      <label for="${id}">${t('token · 32 位十六进制，粘贴进来')}</label>
      <input id="${id}" type="text" name="token" required maxlength="200" class="mono"
        autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="latin">
    </div>`
}

/**
 * The Turnstile widget, and nothing at all when no widget is configured — which
 * is what keeps `npm run dev` and a fresh self-host deploy working.
 *
 * Implicit rendering (a `cf-turnstile` div, no JavaScript of our own): the
 * script finds the div, draws itself, and injects a hidden `cf-turnstile-response`
 * input into the enclosing form. So the plain POST/redirect/GET form at the top
 * of this file stays exactly that — no fetch, no submit handler, nothing to go
 * wrong on a bad connection, which is the property these pages are built around.
 *
 * `data-theme="auto"` so the widget follows the same prefers-color-scheme switch
 * the rest of the page does, and `data-language` follows the page's own language
 * — a Chinese challenge on an English form is the widget disagreeing with
 * everything around it. `data-action` is Turnstile's own analytics marker.
 *
 * The <noscript> line matters: with a widget configured, no JavaScript means no
 * token and therefore no sign-up. Saying so beats a form that rejects every
 * attempt without ever explaining why.
 */
function turnstileWidget(siteKey: string | null, loc: Locale, t: T): string {
  if (siteKey === null) return ''
  return `<div class="field">
      <div class="cf-turnstile" data-sitekey="${escapeHtml(siteKey)}"
        data-action="turnstile-spin-v1" data-theme="auto" data-language="${loc === 'en' ? 'en' : 'zh-cn'}"></div>
      <noscript><p class="note flat">${t('人机验证需要 JavaScript，请先在浏览器里打开它。')}</p></noscript>
    </div>`
}

// --- request plumbing -------------------------------------------------------

async function readForm(request: Request): Promise<FormData | null> {
  try {
    return await request.formData()
  } catch {
    return null
  }
}

function field(form: FormData, key: string): string {
  const v = form.get(key)
  return typeof v === 'string' ? v.trim() : ''
}

/** Never trimmed. Trimming a password silently changes it. */
function secret(form: FormData, key: string): string {
  const v = form.get(key)
  return typeof v === 'string' ? v : ''
}

function seeOther(location: string, setCookie?: string): Response {
  const headers = new Headers({ location, 'cache-control': 'no-store' })
  if (setCookie) headers.append('set-cookie', setCookie)
  return new Response(null, { status: 303, headers })
}

function methodNotAllowed(): Response {
  return new Response('method not allowed', { status: 405, headers: { allow: 'GET, POST' } })
}

// --- styles -----------------------------------------------------------------

const ACCOUNT_CSS = `
/* CONSOLE_CSS only reaches text and number inputs. Email and password fields
   need the same 16px floor for the same reason: mobile Safari zooms the viewport
   on focus for anything smaller, and never zooms back out. */
input[type=email],input[type=password]{
  display:block;width:100%;font:inherit;font-size:16px;line-height:1.4;
  padding:10px 12px;color:var(--fg);background:transparent;
  border:1px solid var(--rule);border-radius:10px;
}
main.gate{max-width:26rem;padding-top:calc(env(safe-area-inset-top) + 7vh)}
.mark{
  display:block;margin:0 0 26px;font-size:19px;font-weight:600;
  letter-spacing:.24em;text-indent:.24em;text-decoration:none;
}
main.gate h1{margin:0 0 .5rem;font-size:1.25rem;font-weight:400;letter-spacing:.14em}
.deal ul{margin:0 0 12px;padding-left:1.25rem}
.deal li{margin-bottom:.5rem;line-height:1.75}
.deal li::marker{color:var(--faint)}
.deal a,.foot a,.note a{color:var(--dim);text-underline-offset:3px}
.foot{margin-top:26px;color:var(--faint);font-size:13px;line-height:1.9}
.none{color:var(--faint)}
.tok{
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:16px;
  word-break:break-all;background:var(--rule);border-radius:10px;
  padding:12px 14px;margin:0 0 10px;-webkit-user-select:all;user-select:all;
}
.tok.masked{color:var(--faint);letter-spacing:.3em;-webkit-user-select:none;user-select:none}
a.linky.tap,button.linky.tap{display:inline-flex;align-items:center;min-height:44px;text-decoration:underline}
/* The footer switcher, matching the landing page's own .lang rule in tone but
   scoped to this shell — LANDING_CSS never reaches these pages. */
main.gate .lang{margin:14px 0 0;color:var(--faint);font-size:13px}
main.gate .lang a{color:var(--dim);text-underline-offset:3px}
`

/**
 * Shipped only on the one page that has a widget, not folded into ACCOUNT_CSS.
 * Two reasons, and the second is the one that matters: /login, /claim and
 * /recover have no widget to style, and a test asserts that the string
 * `cf-turnstile` does not appear on them at all — an invariant that is only
 * worth anything if a stray CSS rule cannot satisfy it.
 *
 * Turnstile draws itself in a fixed 300px-wide iframe and offers no narrower
 * variant that keeps the checkbox on one line. That is wider than this column
 * inside a 320px phone, so it gets scaled in place there: a page-wide
 * horizontal scrollbar on the sign-up form is the worse outcome.
 */
const TURNSTILE_CSS = `
.cf-turnstile{max-width:100%}
@media (max-width:360px){.cf-turnstile{transform:scale(.82);transform-origin:top left;height:54px}}
`
