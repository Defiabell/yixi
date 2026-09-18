import type { Env, User } from './types'
import { authenticate, issueCookie } from './auth'
import { handleGate, handleResolve } from './gate'
import { renderBreathe } from './ui/breathe'
import { renderMock } from './ui/mock'
import { renderReview } from './ui/review'
import { renderSetup } from './ui/setup'
import { handleToday } from './ui/today'
import { handleGoals } from './ui/goals'
import { renderTodaySetup } from './ui/todaysetup'
import { renderProgress } from './ui/progress'
import { iconResponse, manifestResponse } from './ui/pwa'
import { handleCandidates } from './api/candidates'
import {
  handleAccount,
  handleClaim,
  handleLogin,
  handleRecover,
  handleRegister,
  sameSitePath,
} from './ui/account'
import { handleSettings } from './ui/settings'
import { handleAdmin } from './api/admin'
import { renderGuide, sitemap } from './ui/guides'
import { renderLanding } from './ui/landing'
import { deleteExpiredWebSessions, deleteStaleSessions, setUserLocale } from './db'
import { checkRate, pruneRateLimits } from './ratelimit'
import { SNAPSHOT_CRON, snapshotGoalDays } from './snapshot'
import { isLocale, langCookie } from './i18n'

/**
 * Route table. Only /gate and /resolve are machine-facing; everything else is a
 * server-rendered page with inlined CSS/JS (no external requests — these pages
 * must open instantly on a bad mobile connection).
 *
 * Auth has three shapes on purpose:
 *   /gate            — long-lived user token in the query string (the Shortcut
 *                      cannot set headers conveniently)
 *   /b, /resolve     — the sid alone; it is single-use, unguessable and already
 *                      bound to a user+app, so the long-lived token never
 *                      reaches the breathing page or its beacon
 *   everything else  — an opaque sessions_web row id in a cookie, seeded
 *                      once from ?k=; server-side so a password change can
 *                      revoke every live login
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method

    try {
      if (path === '/gate' && method === 'GET') return await handleGate(request, env)
      if (path === '/resolve' && method === 'POST') return await handleResolve(request, env)
      if (path === '/b' && method === 'GET') return await renderBreathe(request, env)

      // `?lang=zh|en` works on any page, signed in or not — the landing
      // page footer, the login/register footer and (later) /account all link
      // to it. Placed after /gate, /resolve and /b so their own contracts
      // are untouched, but before every other route so it never has to be
      // repeated per page. A valid value writes the cookie unconditionally
      // and, if this request also authenticates, `users.locale` too; then it
      // 303s back to the same path and query with only `lang` stripped — a
      // `?k=` alongside it survives that strip, so the ordinary `?k=` ->
      // session-cookie seeding near the bottom of this function still runs
      // on the next hop. An invalid value is left alone entirely and the
      // request falls through to the router below as if `lang` had never
      // been there.
      //
      // GET only: a POST whose URL happens to carry `?lang=` — /login,
      // /register, /claim, /recover all take one — must reach its own
      // handler with its body intact, not get 303'd into losing it. A link
      // is always a GET; nothing here ever needs to catch a POST.
      const lang = url.searchParams.get('lang')
      if (lang !== null && isLocale(lang) && method === 'GET') {
        const langAuth = await authenticate(request, env)
        // Only when it actually changes. A switcher is tapped twice as often as
        // it changes anything — re-reading a `?lang=` link, arriving from a
        // bookmark that still carries one — and every one of those hits would
        // otherwise spend a D1 write rewriting the value already in the column.
        if (langAuth && langAuth.user.locale !== lang) {
          await setUserLocale(env.DB, langAuth.user.id, lang)
        }
        const clean = new URL(url)
        clean.searchParams.delete('lang')
        // `clean.pathname` is the parser's own normalised output, and that is
        // exactly what makes it dangerous rather than safe: `/..//evil.example.com`
        // normalises to a pathname of `//evil.example.com`, and a Location header
        // starting `//` is protocol-relative — the browser reads the rest as a
        // hostname and leaves the site. Same trap `?next=` fell into on /login,
        // so the same predicate answers it; a shape that fails it still gets the
        // cookie, it just lands on the front page instead of off-site.
        const target = clean.pathname + (clean.search || '')
        return new Response(null, {
          status: 303,
          headers: {
            location: sameSitePath(target) ? target : '/',
            'set-cookie': langCookie(lang),
            'cache-control': 'no-store',
          },
        })
      }

      // Both take the request rather than the URL: with no session to read a
      // language preference off, the cookie this router has just set and the
      // browser's own Accept-Language are all there is to go on.
      if (path === '/mock' && method === 'GET') return renderMock(request)
      if (path === '/' && method === 'GET') return renderLanding(request)
      if ((path === '/guides/iphone-shortcuts' || path === '/compare/one-sec') && method === 'GET') return renderGuide(request)
      if (path === '/sitemap.xml' && method === 'GET') return sitemap(url.origin)
      // robots.txt is the half of the story a meta tag cannot tell: it names
      // what may be crawled before the crawler has fetched anything. The
      // Disallow list is deliberately redundant with each page's own
      // noindex — a crawler that ignores one still sees the other, and the
      // pages named here are the ones whose URLs carry a session or a token.
      if (path === '/robots.txt' && method === 'GET') return robotsTxt(url.origin)

      // Home-screen files. Public and cacheable: iOS fetches them without a
      // cookie when the icon is added, and nothing in them is per-user.
      if (path === '/manifest.webmanifest' && method === 'GET') return manifestResponse()
      if (path === '/icon.png' && method === 'GET') return iconResponse()

      // Sign-up and sign-in must answer before authenticate(), or the only way
      // to get an account would be to already have one. Registration being open
      // to anyone, the POSTs are throttled per IP — GETs are just pages and are
      // not worth the D1 write.
      //
      // /register carries a second gate on top of this throttle: a Turnstile
      // challenge. It is verified inside handleRegister rather than here,
      // because a rejection has to come back as the sign-up form with the
      // address still typed in it — this layer can only answer in bare status
      // codes, and making somebody re-find and re-type the form is how you get
      // a second throwaway account instead of a retry. src/turnstile.ts holds
      // the check and the fail-open reasoning.
      //
      // The other three are left on the throttle alone, deliberately: a
      // challenge on /login would tax whoever mistyped their own password, and
      // /claim and /recover already demand a 128-bit token that cannot be
      // guessed, so there is nothing there for a challenge to slow down.
      const openRoutes: Record<string, (r: Request, e: Env) => Promise<Response>> = {
        '/register': handleRegister,
        '/login': handleLogin,
        '/claim': handleClaim,
        '/recover': handleRecover,
      }
      const open = openRoutes[path]
      if (open) {
        if (method === 'POST') {
          const rate = await checkRate(env, path.slice(1), request)
          if (!rate.allowed) return tooManyRequests(rate.retryAfterSeconds)
        }
        return await open(request, env)
      }

      // --- cookie-authenticated pages below ---
      const auth = await authenticate(request, env)
      if (!auth) return toLogin(url)
      const { user, seededFromToken } = auth

      let res: Response
      if (path === '/today') res = await handleToday(request, env, user)
      else if (path === '/today/goals') res = await handleGoals(request, env, user)
      else if (path === '/today/setup' && method === 'GET') res = await renderTodaySetup(request, env, user)
      else if (path === '/today/review' && method === 'GET') res = await renderProgress(request, env, user)
      else if (path === '/review' && method === 'GET') res = await renderReview(request, env, user)
      else if (path === '/account') res = await handleAccount(request, env, user)
      // The user goes in so a signed-in reader whose account has settled on a
      // language gets the candidate caveats in it, not just whoever carries the
      // cookie the switcher wrote.
      else if (path === '/api/candidates' && method === 'GET') res = await handleCandidates(request, {}, user)
      // /lookup and /probe were pages; both are now the URL scheme field on
      // /settings. 302 rather than 301 because Safari caches a 301 more or less
      // forever, and this costs one round trip on a path nobody navigates
      // deliberately any more — it exists for bookmarks and address-bar
      // autocomplete on the phone this was built for, where a 404 would read as
      // "the tool broke". Both are GET-only, so 302's ambiguity about whether a
      // redirected client keeps the original method never matters here.
      else if (path === '/lookup' || path === '/probe') res = seeOtherTo('/settings')
      // /goals is the same shape of move — it is now /today/goals — but it
      // used to carry POST bodies (the goal form used to live at this path),
      // and a bookmarked POST is no less stale than a bookmarked GET. 302
      // leaves it up to the client whether a POST survives the hop; 307 is
      // the one redirect status that is unambiguous about preserving both the
      // method and the body, so a stale POST bookmark still lands as a POST.
      else if (path === '/goals') res = temporaryRedirectPreservingMethod('/today/goals')
      else if (path === '/setup' && method === 'GET') res = await renderSetup(request, env, user)
      else if (path === '/settings') res = await handleSettings(request, env, user)
      else if (path.startsWith('/admin')) res = await handleAdmin(request, env, user)
      else return notFound()

      // First visit arrived with ?k=<token>. Set the cookie and bounce to the
      // same path without it, rather than rendering the page at a URL that has
      // the user's whole identity in it — that URL is one screenshot, one shared
      // link or one glance at the address bar away from handing over every
      // record the account holds.
      if (seededFromToken) {
        const clean = new URL(url)
        clean.searchParams.delete('k')
        return new Response(null, {
          status: 303,
          headers: {
            location: clean.pathname + (clean.search || ''),
            'set-cookie': await issueCookie(env, user),
            'cache-control': 'no-store',
          },
        })
      }
      return res
    } catch (err) {
      console.error('unhandled', redact(err))
      return new Response('internal error', { status: 500 })
    }
  },

  /**
   * Two crons share this handler, told apart by `event.cron`:
   *
   *   SNAPSHOT_CRON (00:00 Asia/Shanghai) — writes yesterday's goal_days row
   *   per user and returns; it does not touch the tables below.
   *
   *   the other (noon Shanghai) — the original nightly trim of the sessions
   *   breadcrumb table. `events` is never touched — that history is the
   *   product. A session older than a week can only be a breathing page
   *   nobody ever resolved.
   *
   * `now` comes from `event.scheduledTime` rather than `Date.now()` so a test
   * can pin the tick to an exact moment; Cloudflare guarantees the two are
   * the same instant in production.
   */
  async scheduled(event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const now = event.scheduledTime
    if (event.cron === SNAPSHOT_CRON) {
      const r = await snapshotGoalDays(env.DB, now)
      console.log(`snapshot ${r.date}: ${r.users} users, ${r.failed} failed`)
      return
    }
    const removed = await deleteStaleSessions(env.DB, now - SESSION_RETENTION_MS)
    // Every `?k=` visit mints a login session; without this they only accumulate.
    const expired = await deleteExpiredWebSessions(env.DB, now)
    const rates = await pruneRateLimits(env, now - RATE_WINDOW_RETENTION_MS)
    console.log(`trimmed ${removed} sessions, ${expired} logins, ${rates} rate windows`)
  },
} satisfies ExportedHandler<Env>

const SESSION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
/** Comfortably past the longest window in LIMITS, so nothing live is dropped. */
const RATE_WINDOW_RETENTION_MS = 24 * 60 * 60 * 1000

/**
 * Strips anything shaped like a gate token before it reaches a log line.
 *
 * Nothing deliberately logs a token, but the catch-all logs whatever was
 * thrown, and a thrown value that happens to carry a request URL would put a
 * live credential into Cloudflare's log stream — where it outlives the request
 * and is readable by anyone with dashboard access. Cheap insurance against a
 * class of accident rather than a known bug.
 */
function redact(err: unknown): string {
  const text = err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ''}` : String(err)
  return text.replace(/([?&](?:k|token)=)[^&\s"']+/gi, '$1[redacted]').replace(/\b[0-9a-f]{32}\b/gi, '[redacted]')
}

/** Public articles are discoverable; account and token routes stay excluded. */
function robotsTxt(origin: string): Response {
  const body = [
    'User-agent: *',
    'Allow: /$',
    'Allow: /guides/iphone-shortcuts$',
    'Allow: /compare/one-sec$',
    `Sitemap: ${origin}/sitemap.xml`,
    'Disallow: /b',
    'Disallow: /gate',
    'Disallow: /mock',
    'Disallow: /today',
    'Disallow: /goals',
    'Disallow: /review',
    'Disallow: /setup',
    'Disallow: /settings',
    'Disallow: /account',
    'Disallow: /admin',
    'Disallow: /login',
    'Disallow: /register',
    'Disallow: /claim',
    'Disallow: /recover',
    '',
  ].join('\n')
  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  })
}

function tooManyRequests(retryAfterSeconds: number): Response {
  return new Response('慢一点。稍后再试。', {
    status: 429,
    headers: { 'retry-after': String(retryAfterSeconds), 'content-type': 'text/plain; charset=utf-8' },
  })
}

/**
 * Signed-out visitors get the sign-in page, not a bare 401.
 *
 * A plain-text "unauthorized" is indistinguishable from a broken site — the
 * nav links to /setup and /review are the first thing anyone taps, and landing
 * on an unstyled error reads as "this thing is down", not "log in first".
 *
 * `next` carries the intended destination so signing in finishes the trip
 * rather than dumping everyone on the same landing page. Only a same-site path
 * is ever forwarded: an absolute URL here would turn the login page into an
 * open redirect that phishing can borrow.
 */
function toLogin(url: URL): Response {
  const next = url.pathname + url.search
  const safe = next.startsWith('/') && !next.startsWith('//') ? next : '/review'
  return new Response(null, {
    status: 303,
    headers: { location: `/login?next=${encodeURIComponent(safe)}`, 'cache-control': 'no-store' },
  })
}

function seeOtherTo(location: string): Response {
  return new Response(null, { status: 302, headers: { location, 'cache-control': 'no-store' } })
}

function temporaryRedirectPreservingMethod(location: string): Response {
  return new Response(null, { status: 307, headers: { location, 'cache-control': 'no-store' } })
}

function notFound(): Response {
  return new Response('not found', { status: 404 })
}

export type { Env, User }
