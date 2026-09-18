import type { Env, GateDecision } from './types'
import { DEFAULT_GRACE_SECONDS } from './types'
import { userFromToken } from './auth'
import {
  createSession,
  getGraceUntil,
  getSession,
  getUserApp,
  insertEvent,
  resolveSessionAtomically,
} from './db'

/**
 * The two machine-facing routes: the Shortcut asks /gate whether to let the app
 * open, and the breathing page reports back to /resolve.
 */

// A stale gate decision is the one failure this app cannot survive: a "pass"
// cached by anything between the phone and here would disable the whole tool
// silently, and a cached "block" would hand out a dead sid.
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

/**
 * Plain-text replies for `?fmt=text`, which exists because the JSON shape asked
 * too much of the Shortcuts app.
 *
 * Parsing JSON there means a 「获取词典值」 action, then an 「如果」 comparing a
 * dictionary value, then a second 「获取词典值」 — six actions and three magic
 * variables, and the If editor does not reliably offer a dictionary value as
 * something to compare. Every one of those steps is a place to get stuck.
 *
 * In text mode the body is either the URL to open or the word `pass`, so the
 * whole Shortcut is: fetch, `如果 包含 https`, open. Three actions, no variable
 * picking, and it fails open by construction — `pass`, an empty body, an error
 * page and a dead network all fail to contain `https`, so nothing opens and the
 * app the user actually wanted starts normally.
 */
function text(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

/** 128-bit, per the design: unguessable, single-use, already bound to a user+app. */
function newSid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// grace_pass has no session behind it — nothing was intercepted, so there is
// nothing for the user to resolve. events.sid is NOT NULL, so it gets the empty
// string rather than a fabricated sid that would look like a lost session.
const NO_SESSION = ''

/**
 * GET /gate?app=<key>&k=<token>
 *
 * Order matters, and this is the order:
 *
 *   1. token          — bad or missing, 401
 *   2. user_apps      — unconfigured or disabled: pass, and record NOTHING.
 *                       We are not watching this app; logging it would be
 *                       surveillance the user never asked for.
 *   3. grace          — inside the window: this is the automation firing again
 *                       as we hand control back, so it is `grace_pass` (machine
 *                       noise) and never `attempt`.
 *   4. otherwise      — a real impulse: open a session, record `attempt`,
 *                       block.
 *
 * Step 3 before step 4 is what makes the loop terminate. Merging the two kinds
 * would inflate the denominator of every statistic with events the user never
 * caused.
 */
export async function handleGate(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const app = url.searchParams.get('app')
  const token = url.searchParams.get('k')
  const asText = url.searchParams.get('fmt') === 'text'

  const passing = () => (asText ? text('pass') : json(pass()))
  const refuse = (msg: string, status: number) =>
    asText ? text(msg, status) : json({ error: msg }, status)

  if (!app) return refuse('missing app', 400)
  if (!token) return refuse('unauthorized', 401)

  const user = await userFromToken(env, token)
  if (!user) return refuse('unauthorized', 401)

  const config = await getUserApp(env.DB, user.id, app)
  if (!config || !config.enabled) return passing()

  // The setup page's connectivity check must not manufacture activation.
  if (url.searchParams.get('diagnostic') === '1') return asText ? text('ok') : json({ ok: true })

  const now = Date.now()
  const graceUntil = await getGraceUntil(env.DB, user.id, app)
  if (graceUntil !== null && graceUntil > now) {
    await insertEvent(env.DB, { userId: user.id, sid: NO_SESSION, app, kind: 'grace_pass', ts: now })
    return passing()
  }

  const sid = newSid()
  await createSession(env.DB, { sid, userId: user.id, app, createdAt: now })
  await insertEvent(env.DB, { userId: user.id, sid, app, kind: 'attempt', ts: now })

  // sid only — never the token. This URL is about to be handed to Safari, where
  // it lands in history and can be shared by accident; the sid is single-use and
  // expires, the token is the user's whole identity.
  const target = new URL(`/b?s=${sid}`, url).toString()
  return asText ? text(target) : json(block(target))
}

function pass(): GateDecision {
  return { action: 'pass' }
}

function block(url: string): GateDecision {
  return { action: 'block', url }
}

/**
 * POST /resolve — body `sid=<sid>&action=proceed|abandon`
 *
 * Authenticated by the sid alone, because the caller is `navigator.sendBeacon`,
 * which cannot set headers; putting the long-lived token in a beacon body would
 * widen its exposure for nothing. The sid is already bound to a user and an app.
 *
 * Idempotent by construction: sendBeacon is retried by the browser and a
 * double-tap fires it twice, so the first claim of the session logs the event
 * and opens the grace window, and every later one is a no-op that still answers
 * 200 (there is no error to report — the user's decision did land).
 */
export async function handleResolve(request: Request, env: Env): Promise<Response> {
  // Parsed from the raw text rather than formData(): sendBeacon picks its own
  // Content-Type (and appends a charset), and the shape of the body is the same
  // either way.
  const form = new URLSearchParams(await request.text())
  const sid = form.get('sid') ?? ''
  const action = form.get('action') ?? ''
  if (!sid || (action !== 'proceed' && action !== 'abandon')) return json({ error: 'bad request' }, 400)

  const session = await getSession(env.DB, sid)
  if (!session) return json({ error: 'unauthorized' }, 401)

  const now = Date.now()

  // Read the window length before staking the claim: the claim and everything
  // it authorises go to D1 as one transaction, so nothing may fail in between.
  // Falls back to the default when the app was unconfigured or disabled between
  // the block and this call — without a grace window the Shortcut would
  // intercept the return jump and loop.
  let graceUntil: number | null = null
  if (action === 'proceed') {
    const config = await getUserApp(env.DB, session.user_id, session.app)
    graceUntil = now + (config?.grace_seconds ?? DEFAULT_GRACE_SECONDS) * 1000
  }

  const won = await resolveSessionAtomically(env.DB, {
    sid,
    userId: session.user_id,
    app: session.app,
    kind: action === 'proceed' ? 'proceeded' : 'abandoned',
    ts: now,
    graceUntil,
  })
  if (!won) return json({ ok: true, duplicate: true })

  return json({ ok: true })
}
