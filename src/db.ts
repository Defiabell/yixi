import type { EventKind, Goal, GoalDay, GoalTask, Session, User, UserApp, WebSession } from './types'
import type { PasswordRecord, SealedToken } from './crypto'
import type { Locale } from './i18n'

/**
 * Every D1 statement in the app lives here. Callers pass the binding itself
 * (`env.DB`) rather than the whole Env, so nothing in this file can reach for a
 * secret by accident.
 */

// --- calendar day ---------------------------------------------------------

// "Which day was this" is a question about the user's life, not about UTC — a
// 00:30 relapse belongs to the night it happened, not to the previous
// afternoon. Locale en-CA renders as YYYY-MM-DD, which sorts and compares as a
// plain string, so no date library is needed.
const DAY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function shanghaiDate(ts: number): string {
  return DAY_FORMATTER.format(new Date(ts))
}

// --- users ----------------------------------------------------------------

/**
 * A user row with the credential column still attached. Only auth.ts asks for
 * this shape, and only so it can re-compare the hash in constant time; every
 * other caller takes the plain `User`.
 */
export interface StoredUser extends User {
  token_hash: string
}

export async function findUserByTokenHash(db: D1Database, tokenHash: string): Promise<StoredUser | null> {
  return await db
    .prepare(
      'SELECT id, name, is_owner, created_at, locale, today_goals, surf_triggers, token_hash FROM users WHERE token_hash = ?1',
    )
    .bind(tokenHash)
    .first<StoredUser>()
}

export async function getUserById(db: D1Database, id: number): Promise<User | null> {
  return await db
    .prepare('SELECT id, name, is_owner, created_at, locale, today_goals, surf_triggers FROM users WHERE id = ?1')
    .bind(id)
    .first<User>()
}

export async function listUsers(db: D1Database): Promise<User[]> {
  const res = await db
    .prepare('SELECT id, name, is_owner, created_at, locale, today_goals, surf_triggers FROM users ORDER BY id')
    .all<User>()
  return res.results
}

/** Records a signed-in visitor's language choice, made via `?lang=` or the
 * account page's switcher. See src/i18n/index.ts's `localeOf`, which reads
 * it back as the second of five precedence levels. */
export async function setUserLocale(db: D1Database, userId: number, locale: Locale): Promise<void> {
  await db.prepare('UPDATE users SET locale = ?2 WHERE id = ?1').bind(userId, locale).run()
}

/** How many goal cards this user wants on /today. The caller validates the
 * range (src/types.ts's TODAY_GOALS_MIN/MAX); read it back through
 * `todayGoalLimit`, which falls back to the default for anything odd. */
export async function setUserTodayGoals(db: D1Database, userId: number, n: number): Promise<void> {
  await db.prepare('UPDATE users SET today_goals = ?2 WHERE id = ?1').bind(userId, n).run()
}

/**
 * `sealedToken` is optional only so older callers keep compiling; every caller
 * that holds the plaintext should pass it. Creation is the sole moment the
 * plaintext exists, and a row without a sealed copy can never show its holder
 * their own key again.
 */
export async function createUser(
  db: D1Database,
  u: {
    name: string
    tokenHash: string
    isOwner?: boolean
    createdAt?: number
    sealedToken?: { cipher: string; iv: string }
  },
): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO users (name, token_hash, is_owner, created_at, token_cipher, token_iv)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
    .bind(
      u.name,
      u.tokenHash,
      u.isOwner ? 1 : 0,
      u.createdAt ?? Date.now(),
      u.sealedToken?.cipher ?? null,
      u.sealedToken?.iv ?? null,
    )
    .run()
  return Number(res.meta.last_row_id)
}

// --- accounts -------------------------------------------------------------

/**
 * A user row with its account credentials attached. Only account.ts asks for
 * this shape, for the same reason `StoredUser` exists: everything else in the
 * app takes the plain `User` and so cannot spill a hash into a page.
 *
 * Every account column is nullable because rows predating accounts have none of
 * them — a token that was handed out by the owner is still a complete identity,
 * it just cannot log in with a password until somebody claims it.
 */
export interface AccountRecord extends User {
  email: string | null
  password_hash: string | null
  password_salt: string | null
  password_iters: number | null
}

const ACCOUNT_COLUMNS =
  'id, name, is_owner, created_at, locale, today_goals, email, password_hash, password_salt, password_iters'

/** `email` must already be lowercased by the caller; the index is not collating. */
export async function findAccountByEmail(db: D1Database, email: string): Promise<AccountRecord | null> {
  return await db
    .prepare(`SELECT ${ACCOUNT_COLUMNS} FROM users WHERE email = ?1`)
    .bind(email)
    .first<AccountRecord>()
}

export async function findAccountById(db: D1Database, id: number): Promise<AccountRecord | null> {
  return await db
    .prepare(`SELECT ${ACCOUNT_COLUMNS} FROM users WHERE id = ?1`)
    .bind(id)
    .first<AccountRecord>()
}

/**
 * Creates a self-registered user: credentials, and both copies of the gate
 * token — the hash /gate verifies against and the sealed copy the owner can
 * read back.
 *
 * Throws on a duplicate email; the partial unique index is the only authority
 * on that, since any check-then-insert has a race between the two. Callers use
 * `isEmailTakenError` to tell that apart from a real failure.
 */
export async function createAccount(
  db: D1Database,
  a: {
    name: string
    email: string
    password: PasswordRecord
    tokenHash: string
    sealedToken: SealedToken
    isOwner?: boolean
    createdAt?: number
  },
): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO users
         (name, token_hash, is_owner, created_at,
          email, password_hash, password_salt, password_iters, token_cipher, token_iv, onboarding_version)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1)`,
    )
    .bind(
      a.name,
      a.tokenHash,
      a.isOwner ? 1 : 0,
      a.createdAt ?? Date.now(),
      a.email,
      a.password.hash,
      a.password.salt,
      a.password.iterations,
      a.sealedToken.cipher,
      a.sealedToken.iv,
    )
    .run()
  return Number(res.meta.last_row_id)
}

/**
 * Binds an account to a user row that has none — the migration path for tokens
 * handed out before accounts existed, including the owner's own.
 *
 * `email IS NULL` in the WHERE clause is the concurrency guard: two claims of
 * the same token can only have one winner, and the loser is told the token is
 * already taken rather than silently overwriting the winner's password.
 *
 * This is also the only moment an old row can ever get a `token_cipher`. The
 * plaintext token exists nowhere on the server, so it can only be sealed while
 * the holder is presenting it.
 */
export async function attachAccount(
  db: D1Database,
  userId: number,
  a: { email: string; password: PasswordRecord; sealedToken: SealedToken },
): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE users
       SET email = ?2, password_hash = ?3, password_salt = ?4, password_iters = ?5,
           token_cipher = ?6, token_iv = ?7
       WHERE id = ?1 AND email IS NULL`,
    )
    .bind(
      userId,
      a.email,
      a.password.hash,
      a.password.salt,
      a.password.iterations,
      a.sealedToken.cipher,
      a.sealedToken.iv,
    )
    .run()
  return (res.meta.changes ?? 0) > 0
}

/**
 * Sets the password and drops every live session in one transaction.
 *
 * These have to land together. A password change that stored the new hash but
 * failed to revoke would leave whoever the change was defending against still
 * signed in on their own device — with the owner believing they had just locked
 * them out. Failing the whole thing is the safe half of that pair.
 */
export async function updateUserPassword(db: D1Database, userId: number, p: PasswordRecord): Promise<void> {
  await db.batch([
    db
      .prepare('UPDATE users SET password_hash = ?2, password_salt = ?3, password_iters = ?4 WHERE id = ?1')
      .bind(userId, p.hash, p.salt, p.iterations),
    db.prepare('DELETE FROM sessions_web WHERE user_id = ?1').bind(userId),
  ])
}

/** The encrypted copy of the gate token, for showing a logged-in owner their key. */
export async function getSealedToken(db: D1Database, userId: number): Promise<SealedToken | null> {
  const row = await db
    .prepare('SELECT token_cipher, token_iv FROM users WHERE id = ?1')
    .bind(userId)
    .first<{ token_cipher: string | null; token_iv: string | null }>()
  if (!row || row.token_cipher === null || row.token_iv === null) return null
  return { cipher: row.token_cipher, iv: row.token_iv }
}

/**
 * Whether a failed write was the email uniqueness index firing.
 *
 * D1 wraps SQLite's message ("UNIQUE constraint failed: users.email") rather
 * than exposing a code, so the table.column name is matched explicitly: a
 * token_hash collision is a different bug entirely and must not be reported to
 * a stranger as "that email is taken".
 */
export function isEmailTakenError(err: unknown): boolean {
  const parts = [String(err)]
  if (err instanceof Error && err.cause !== undefined) parts.push(String(err.cause))
  return parts.some((p) => /UNIQUE constraint failed:\s*users\.email/i.test(p))
}

// --- web sessions ---------------------------------------------------------

export async function createWebSession(
  db: D1Database,
  s: { id: string; userId: number; createdAt: number; expiresAt: number },
): Promise<void> {
  await db
    .prepare('INSERT INTO sessions_web (id, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(s.id, s.userId, s.createdAt, s.expiresAt)
    .run()
}

export async function getWebSession(db: D1Database, id: string): Promise<WebSession | null> {
  return await db
    .prepare('SELECT id, user_id, created_at, expires_at FROM sessions_web WHERE id = ?1')
    .bind(id)
    .first<WebSession>()
}

/**
 * Resolves a cookie to its user in one round trip, or null.
 *
 * The join is not an optimisation for its own sake: this runs on every page
 * view, and the alternative — read the session, then read the user — doubles
 * the D1 latency of every request on a phone that is already waiting.
 *
 * Expiry is enforced here rather than by a sweep, so a session is dead the
 * moment it lapses even if nothing has cleaned it up yet.
 */
export async function findUserByWebSession(db: D1Database, id: string, now: number): Promise<User | null> {
  return await db
    .prepare(
      `SELECT u.id, u.name, u.is_owner, u.created_at, u.locale, u.today_goals, u.surf_triggers
       FROM sessions_web s JOIN users u ON u.id = s.user_id
       WHERE s.id = ?1 AND s.expires_at > ?2`,
    )
    .bind(id, now)
    .first<User>()
}

export async function deleteWebSession(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM sessions_web WHERE id = ?1').bind(id).run()
}

/**
 * Signs a user out of every browser. This is what a password change and a token
 * reset are for — a stateless cookie could not do it, which is why the table
 * exists at all.
 */
export async function deleteWebSessionsForUser(db: D1Database, userId: number): Promise<number> {
  const res = await db.prepare('DELETE FROM sessions_web WHERE user_id = ?1').bind(userId).run()
  return res.meta.changes ?? 0
}

/**
 * Housekeeping for the nightly cron. Lapsed rows are already refused by
 * `findUserByWebSession`, so this only stops the table growing — notably from
 * `?k=` arrivals, each of which mints a fresh session.
 */
export async function deleteExpiredWebSessions(db: D1Database, now: number): Promise<number> {
  const res = await db.prepare('DELETE FROM sessions_web WHERE expires_at <= ?1').bind(now).run()
  return res.meta.changes ?? 0
}

// --- user_apps ------------------------------------------------------------

export async function getUserApp(db: D1Database, userId: number, app: string): Promise<UserApp | null> {
  return await db
    .prepare(
      `SELECT user_id, app, label, scheme, wait_seconds, grace_seconds, enabled
       FROM user_apps WHERE user_id = ?1 AND app = ?2`,
    )
    .bind(userId, app)
    .first<UserApp>()
}

export async function listUserApps(db: D1Database, userId: number): Promise<UserApp[]> {
  const res = await db
    .prepare(
      `SELECT user_id, app, label, scheme, wait_seconds, grace_seconds, enabled
       FROM user_apps WHERE user_id = ?1 ORDER BY enabled DESC, app`,
    )
    .bind(userId)
    .all<UserApp>()
  return res.results
}

export async function upsertUserApp(db: D1Database, row: UserApp): Promise<void> {
  await db
    .prepare(
      `INSERT INTO user_apps (user_id, app, label, scheme, wait_seconds, grace_seconds, enabled)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT (user_id, app) DO UPDATE SET
         label = excluded.label, scheme = excluded.scheme,
         wait_seconds = excluded.wait_seconds, grace_seconds = excluded.grace_seconds,
         enabled = excluded.enabled`,
    )
    .bind(row.user_id, row.app, row.label, row.scheme, row.wait_seconds, row.grace_seconds, row.enabled)
    .run()
}

export async function deleteUserApp(db: D1Database, userId: number, app: string): Promise<void> {
  await db.prepare('DELETE FROM user_apps WHERE user_id = ?1 AND app = ?2').bind(userId, app).run()
}

/**
 * Replaces both stored copies of the gate token at once.
 *
 * The hash is what /gate verifies and the ciphertext is what the account page
 * shows; a rotation that updated one and not the other would leave an account
 * that either cannot authenticate or cannot show its holder the credential that
 * does work. One batch, so a failure leaves the old token intact and working —
 * the safe half of that pair, since the user can simply rotate again.
 *
 * Web sessions are deliberately left alone. Rotating is how someone reacts to a
 * leaked token, and signing them out of the browser they are standing in while
 * they still have Shortcuts to update would punish exactly the right instinct.
 */
export async function rotateUserToken(
  db: D1Database,
  userId: number,
  next: { tokenHash: string; sealed: { cipher: string; iv: string } },
): Promise<void> {
  await db.batch([
    db
      .prepare('UPDATE users SET token_hash = ?2, token_cipher = ?3, token_iv = ?4 WHERE id = ?1')
      .bind(userId, next.tokenHash, next.sealed.cipher, next.sealed.iv),
    // Any breathing page opened under the old token is now unreachable anyway:
    // its sid still resolves, but the automation that would have honoured the
    // grace window is about to start sending a token the server rejects.
    db.prepare('DELETE FROM grace WHERE user_id = ?1').bind(userId),
  ])
}

// --- sessions -------------------------------------------------------------

export async function createSession(
  db: D1Database,
  s: { sid: string; userId: number; app: string; createdAt: number },
): Promise<void> {
  await db
    .prepare('INSERT INTO sessions (sid, user_id, app, created_at, resolved_at) VALUES (?1, ?2, ?3, ?4, NULL)')
    .bind(s.sid, s.userId, s.app, s.createdAt)
    .run()
}

export async function getSession(db: D1Database, sid: string): Promise<Session | null> {
  return await db
    .prepare('SELECT sid, user_id, app, created_at, resolved_at FROM sessions WHERE sid = ?1')
    .bind(sid)
    .first<Session>()
}


/**
 * Sessions are write-once breadcrumbs; only `events` is worth keeping. Trimming
 * resolved and long-abandoned ones keeps the table from growing without bound.
 * Never touches `events` — that history is the entire point of the product.
 */
export async function deleteStaleSessions(db: D1Database, olderThan: number): Promise<number> {
  const res = await db.prepare('DELETE FROM sessions WHERE created_at < ?1').bind(olderThan).run()
  return res.meta.changes ?? 0
}

// --- events ---------------------------------------------------------------


export async function insertEvent(
  db: D1Database,
  e: { userId: number; sid: string; app: string; kind: EventKind; ts: number },
): Promise<void> {
  await db
    .prepare('INSERT INTO events (user_id, sid, app, kind, ts, date) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
    .bind(e.userId, e.sid, e.app, e.kind, e.ts, shanghaiDate(e.ts))
    .run()
}

/** Totals per event kind over an inclusive YYYY-MM-DD range. */
export async function countEventsByKind(
  db: D1Database,
  userId: number,
  fromDate: string,
  toDate: string,
): Promise<Record<string, number>> {
  const res = await db
    .prepare(
      `SELECT kind, COUNT(*) AS n FROM events
       WHERE user_id = ?1 AND date >= ?2 AND date <= ?3
       GROUP BY kind`,
    )
    .bind(userId, fromDate, toDate)
    .all<{ kind: EventKind; n: number }>()
  const out: Record<string, number> = {}
  for (const row of res.results) out[row.kind] = row.n
  return out
}

/** One row per (day, kind) with at least one event — sparse, callers fill gaps. */
export async function countEventsByDay(
  db: D1Database,
  userId: number,
  fromDate: string,
  toDate: string,
): Promise<{ date: string; kind: EventKind; n: number }[]> {
  const res = await db
    .prepare(
      `SELECT date, kind, COUNT(*) AS n FROM events
       WHERE user_id = ?1 AND date >= ?2 AND date <= ?3
       GROUP BY date, kind ORDER BY date`,
    )
    .bind(userId, fromDate, toDate)
    .all<{ date: string; kind: EventKind; n: number }>()
  return res.results
}


/**
 * Per-user counts for the owner's /admin page. Deliberately returns counts and
 * nothing else — no timestamps, no app names, no rows. The privacy line in the
 * design ("the owner cannot read anyone's log") is enforced by there being no
 * query here that could return one, not by the caller remembering not to ask.
 */
/**
 * Per-user attempt counts for the owner's /admin roster — how many impulses each
 * token has seen, and nothing else.
 *
 * `proceeded` and `abandoned` are deliberately absent. Those two yield somebody
 * else's abandon rate, which is a portrait of their self-control rather than a
 * sign of life, and /admin has no business rendering it. Keeping them out of the
 * SQL (rather than dropping them at the render layer) means no future caller can
 * reintroduce them by accident — the query simply cannot produce them.
 */
export async function countAttemptsPerUser(
  db: D1Database,
  fromDate: string,
): Promise<{ user_id: number; name: string; attempts: number }[]> {
  const res = await db
    .prepare(
      `SELECT u.id AS user_id, u.name AS name,
              COALESCE(SUM(e.kind = 'attempt'), 0) AS attempts
       FROM users u
       LEFT JOIN events e ON e.user_id = u.id AND e.date >= ?1
       GROUP BY u.id, u.name ORDER BY u.id`,
    )
    .bind(fromDate)
    .all<{ user_id: number; name: string; attempts: number }>()
  return res.results
}

/**
 * Records a resolution — the event, and for proceed the grace window — and
 * claims the session, all in one D1 transaction. Returns whether this caller
 * won the claim.
 *
 * Splitting these was the one real hazard in this flow. A standalone claim
 * commits on its own, so a transient D1 failure on a following statement left
 * the session marked resolved with no grace row, and every retry then
 * short-circuits as a duplicate and never repairs it. The user taps 继续, lands
 * back in the app, and is intercepted again immediately: exactly the loop grace
 * exists to prevent.
 *
 * The writes come first and each guards on `resolved_at IS NULL`; the claim is
 * last. Statements in a batch run sequentially in a single transaction, so
 * either the whole decision lands or none of it does. Guarding on the prior
 * state rather than on a timestamp this call staked matters: two resolutions of
 * one session can share a millisecond, and a timestamp guard then lets the
 * second one write an event the first had already settled.
 */
export async function resolveSessionAtomically(
  db: D1Database,
  r: {
    sid: string
    userId: number
    app: string
    kind: EventKind
    ts: number
    /** Absolute epoch ms the grace window should run to, or null to skip it. */
    graceUntil: number | null
  },
): Promise<boolean> {
  const unresolved = `(SELECT resolved_at FROM sessions WHERE sid = ?1) IS NULL`

  const statements = [
    db
      .prepare(
        `INSERT INTO events (user_id, sid, app, kind, ts, date)
         SELECT ?2, ?1, ?3, ?4, ?5, ?6 WHERE ${unresolved}`,
      )
      .bind(r.sid, r.userId, r.app, r.kind, r.ts, shanghaiDate(r.ts)),
  ]

  if (r.graceUntil !== null) {
    statements.push(
      db
        .prepare(
          `INSERT INTO grace (user_id, app, until)
           SELECT ?2, ?3, ?4 WHERE ${unresolved}
           ON CONFLICT (user_id, app) DO UPDATE SET until = excluded.until`,
        )
        .bind(r.sid, r.userId, r.app, r.graceUntil),
    )
  }

  statements.push(
    db
      .prepare('UPDATE sessions SET resolved_at = ?2 WHERE sid = ?1 AND resolved_at IS NULL')
      .bind(r.sid, r.ts),
  )

  const results = await db.batch(statements)
  return (results[results.length - 1]?.meta.changes ?? 0) > 0
}

// --- grace ----------------------------------------------------------------

export async function getGraceUntil(db: D1Database, userId: number, app: string): Promise<number | null> {
  const row = await db
    .prepare('SELECT until FROM grace WHERE user_id = ?1 AND app = ?2')
    .bind(userId, app)
    .first<{ until: number }>()
  return row ? row.until : null
}

export async function setGrace(db: D1Database, userId: number, app: string, until: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO grace (user_id, app, until) VALUES (?1, ?2, ?3)
       ON CONFLICT (user_id, app) DO UPDATE SET until = excluded.until`,
    )
    .bind(userId, app, until)
    .run()
}

// --- goals（/today、/goals）--------------------------------------------------
//
// 每条写语句都带 user_id：goal 与 task 的 id 是全局自增，能挡住「A 改 B 的
// 任务」的只有这一个条件。返回 boolean 的函数用 meta.changes 判断是否真改了行。

export async function listGoals(db: D1Database, userId: number): Promise<Goal[]> {
  const res = await db
    .prepare(
      `SELECT id, user_id, title, cue, target, target_label, position, until, created_at, archived_at
       FROM goals WHERE user_id = ?1
       ORDER BY archived_at IS NOT NULL, position, id`,
    )
    .bind(userId)
    .all<Goal>()
  return res.results
}

export async function getGoal(db: D1Database, userId: number, id: number): Promise<Goal | null> {
  return await db
    .prepare(
      `SELECT id, user_id, title, cue, target, target_label, position, until, created_at, archived_at
       FROM goals WHERE user_id = ?1 AND id = ?2`,
    )
    .bind(userId, id)
    .first<Goal>()
}

export async function createGoal(
  db: D1Database,
  g: { userId: number; title: string; cue: string; target: string; targetLabel: string; until: string | null; now: number },
): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO goals (user_id, title, cue, target, target_label, position, until, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5,
         (SELECT COALESCE(MAX(position), 0) + 1 FROM goals WHERE user_id = ?1),
         ?6, ?7)`,
    )
    .bind(g.userId, g.title, g.cue, g.target, g.targetLabel, g.until, g.now)
    .run()
  return Number(res.meta.last_row_id)
}

export async function updateGoal(
  db: D1Database,
  userId: number,
  id: number,
  g: { title: string; cue: string; target: string; targetLabel: string; until: string | null },
): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE goals SET title = ?3, cue = ?4, target = ?5, target_label = ?6, until = ?7
       WHERE user_id = ?1 AND id = ?2`,
    )
    .bind(userId, id, g.title, g.cue, g.target, g.targetLabel, g.until)
    .run()
  return (res.meta.changes ?? 0) > 0
}

export async function setGoalArchived(
  db: D1Database,
  userId: number,
  id: number,
  archivedAt: number | null,
): Promise<boolean> {
  const res = await db
    .prepare('UPDATE goals SET archived_at = ?3 WHERE user_id = ?1 AND id = ?2')
    .bind(userId, id, archivedAt)
    .run()
  return (res.meta.changes ?? 0) > 0
}

/**
 * 一个 batch，要么全删要么不删——但只删 goal_tasks 与 goals。打卡历史是账本，
 * 目标删了账还在：goal_checkins 不动，/review 回看按目标的那一栏只对仍存在
 * 的目标算，历史总量（listCheckins 不带 goal 过滤的用法）不因为删目标而缩水。
 */
export async function deleteGoal(db: D1Database, userId: number, id: number): Promise<boolean> {
  const own = await getGoal(db, userId, id)
  if (!own) return false
  await db.batch([
    db.prepare('DELETE FROM goal_tasks WHERE user_id = ?1 AND goal_id = ?2').bind(userId, id),
    db.prepare('DELETE FROM goals WHERE user_id = ?1 AND id = ?2').bind(userId, id),
  ])
  return true
}

/**
 * 与相邻的未归档目标交换 position。到顶／到底返回 false，不报错——
 * 手机上连点两次「上移」不该看到错误页。
 */
export async function moveGoal(
  db: D1Database,
  userId: number,
  id: number,
  dir: 'up' | 'down',
  today: string,
): Promise<boolean> {
  const me = await getGoal(db, userId, id)
  if (!me || me.archived_at !== null) return false
  // An expired goal sits in the list (lifted to the top of /goals, not hidden)
  // but is not a candidate to swap with: the up/down neighbour has to be
  // another live goal, or the button silently does nothing whenever an
  // expired row happens to sit between two live ones.
  const neighbour = await db
    .prepare(
      dir === 'up'
        ? `SELECT id, position FROM goals WHERE user_id = ?1 AND archived_at IS NULL AND position < ?2
           AND (until IS NULL OR until >= ?3)
           ORDER BY position DESC LIMIT 1`
        : `SELECT id, position FROM goals WHERE user_id = ?1 AND archived_at IS NULL AND position > ?2
           AND (until IS NULL OR until >= ?3)
           ORDER BY position ASC LIMIT 1`,
    )
    .bind(userId, me.position, today)
    .first<{ id: number; position: number }>()
  if (!neighbour) return false
  await db.batch([
    db.prepare('UPDATE goals SET position = ?3 WHERE user_id = ?1 AND id = ?2').bind(userId, me.id, neighbour.position),
    db.prepare('UPDATE goals SET position = ?3 WHERE user_id = ?1 AND id = ?2').bind(userId, neighbour.id, me.position),
  ])
  return true
}

export async function listTasks(db: D1Database, userId: number): Promise<GoalTask[]> {
  const res = await db
    .prepare(
      `SELECT id, goal_id, user_id, title, target, target_label, position, created_at
       FROM goal_tasks WHERE user_id = ?1
       ORDER BY goal_id, position, id`,
    )
    .bind(userId)
    .all<GoalTask>()
  return res.results
}

/** goal 不属于该用户 → null，不插入。 */
export async function createTask(
  db: D1Database,
  t: { userId: number; goalId: number; title: string; now: number },
): Promise<number | null> {
  const own = await getGoal(db, t.userId, t.goalId)
  if (!own) return null
  const res = await db
    .prepare(
      `INSERT INTO goal_tasks (goal_id, user_id, title, position, created_at)
       VALUES (?1, ?2, ?3,
         (SELECT COALESCE(MAX(position), 0) + 1 FROM goal_tasks WHERE goal_id = ?1),
         ?4)`,
    )
    .bind(t.goalId, t.userId, t.title, t.now)
    .run()
  return Number(res.meta.last_row_id)
}

export async function deleteTask(db: D1Database, userId: number, id: number): Promise<boolean> {
  const res = await db.prepare('DELETE FROM goal_tasks WHERE user_id = ?1 AND id = ?2').bind(userId, id).run()
  return (res.meta.changes ?? 0) > 0
}

/** 单条子任务，按 user_id 圈定——A 永远拿不到 B 的 task，包括「它存不存在」。 */
export async function getTask(db: D1Database, userId: number, id: number): Promise<GoalTask | null> {
  return await db
    .prepare(
      `SELECT id, goal_id, user_id, title, target, target_label, position, created_at
       FROM goal_tasks WHERE user_id = ?1 AND id = ?2`,
    )
    .bind(userId, id)
    .first<GoalTask>()
}

/** 只改跳转那两列。标题在任何界面上都改不了，这里也不给改。 */
export async function updateTaskTarget(
  db: D1Database,
  userId: number,
  id: number,
  target: string,
  targetLabel: string,
): Promise<boolean> {
  const res = await db
    .prepare('UPDATE goal_tasks SET target = ?3, target_label = ?4 WHERE user_id = ?1 AND id = ?2')
    .bind(userId, id, target, targetLabel)
    .run()
  return (res.meta.changes ?? 0) > 0
}

/**
 * 按天幂等的打卡：有则删（取消），无则插。主键 (user_id, goal_id, date)
 * 保证同一天永远只有一行，重复点不会重复计数。
 *
 * INSERT 用 OR IGNORE：两次近乎同时的调用都可能在对方插入前跑完「不存在」的
 * DELETE 检查，第二次 INSERT 撞主键。OR IGNORE 让撞车的那次静默失败而不是抛
 * 异常；这种情况下 meta.changes 为 0，但行确实已经被另一次调用插入，所以仍
 * 按 'checked' 返回——对调用方而言，此刻这一天确实是已打卡状态。
 */
export async function toggleCheckin(
  db: D1Database,
  userId: number,
  goalId: number,
  date: string,
  now: number,
): Promise<'checked' | 'unchecked' | 'nogoal'> {
  const own = await getGoal(db, userId, goalId)
  if (!own) return 'nogoal'
  const removed = await db
    .prepare('DELETE FROM goal_checkins WHERE user_id = ?1 AND goal_id = ?2 AND date = ?3')
    .bind(userId, goalId, date)
    .run()
  if ((removed.meta.changes ?? 0) > 0) return 'unchecked'
  await db
    .prepare('INSERT OR IGNORE INTO goal_checkins (user_id, goal_id, date, ts) VALUES (?1, ?2, ?3, ?4)')
    .bind(userId, goalId, date, now)
    .run()
  return 'checked'
}

/** 闭区间；一次取整个用户的，调用方按 goal 分组，不做 N+1。 */
export async function listCheckins(
  db: D1Database,
  userId: number,
  fromDate: string,
  toDate: string,
): Promise<{ goal_id: number; date: string }[]> {
  const res = await db
    .prepare('SELECT goal_id, date FROM goal_checkins WHERE user_id = ?1 AND date >= ?2 AND date <= ?3')
    .bind(userId, fromDate, toDate)
    .all<{ goal_id: number; date: string }>()
  return res.results
}

// --- goal_task_checkins（子任务每天的勾选，以及由它派生的目标打卡）-----------
//
// 一条子任务不再是「做完划掉」，而是「每天勾一次」。所以完成状态不在
// goal_tasks 上，而是 (user_id, task_id, date) 这张按天幂等的表——主键保证同一天
// 只有一行，重复点不会重复计数，和 goal_checkins 同一套结构。
//
// 删任务、删目标都不动这张表：做过的事不因为目标消失而消失，/today/review 的
// 「这周」直接数这张表，所以删掉任务之后本周计数不会掉下去。

/**
 * 一条子任务在某一天的勾选：on 就插、off 就删。
 *
 * INSERT 把「这条 task 是不是这个人的」压进同一条语句的 WHERE EXISTS 里，所以
 * 即使调用方忘了先查归属，别人的 task id 也只会写出零行，而不是写进这个人的账。
 */
export async function setTaskCheckin(
  db: D1Database,
  userId: number,
  taskId: number,
  date: string,
  on: boolean,
  now: number,
): Promise<void> {
  if (!on) {
    await db
      .prepare('DELETE FROM goal_task_checkins WHERE user_id = ?1 AND task_id = ?2 AND date = ?3')
      .bind(userId, taskId, date)
      .run()
    return
  }
  await db
    .prepare(
      `INSERT OR IGNORE INTO goal_task_checkins (user_id, task_id, date, ts)
       SELECT ?1, ?2, ?3, ?4
       WHERE EXISTS (SELECT 1 FROM goal_tasks WHERE id = ?2 AND user_id = ?1)`,
    )
    .bind(userId, taskId, date, now)
    .run()
}

/**
 * 一个目标名下所有子任务当天一起勾、一起撤。有子任务时 /today 上的目标圆圈就是
 * 这个动作——圆圈自己不写 goal_checkins，它写子任务，然后让 syncGoalCheckin 把
 * 目标那一行放回它该在的位置。
 */
export async function setGoalTaskCheckins(
  db: D1Database,
  userId: number,
  goalId: number,
  date: string,
  on: boolean,
  now: number,
): Promise<void> {
  if (!on) {
    await db
      .prepare(
        `DELETE FROM goal_task_checkins WHERE user_id = ?1 AND date = ?3
         AND task_id IN (SELECT id FROM goal_tasks WHERE user_id = ?1 AND goal_id = ?2)`,
      )
      .bind(userId, goalId, date)
      .run()
    return
  }
  await db
    .prepare(
      `INSERT OR IGNORE INTO goal_task_checkins (user_id, task_id, date, ts)
       SELECT ?1, id, ?3, ?4 FROM goal_tasks WHERE user_id = ?1 AND goal_id = ?2`,
    )
    .bind(userId, goalId, date, now)
    .run()
}

/** 闭区间；一次取整个用户的，调用方按 task 分组，与 listCheckins 同形，不做 N+1。 */
export async function listTaskCheckins(
  db: D1Database,
  userId: number,
  fromDate: string,
  toDate: string,
): Promise<{ task_id: number; date: string }[]> {
  const res = await db
    .prepare('SELECT task_id, date FROM goal_task_checkins WHERE user_id = ?1 AND date >= ?2 AND date <= ?3')
    .bind(userId, fromDate, toDate)
    .all<{ task_id: number; date: string }>()
  return res.results
}

/** 某个上海日里勾了几次子任务。就是下面那个的单日特例（from === to）。 */
export async function countTaskCheckinsOn(db: D1Database, userId: number, date: string): Promise<number> {
  return await countTaskCheckinsBetween(db, userId, date, date)
}

/**
 * 闭区间内一共勾了几次子任务。同一条任务两天各勾一次算两次——这是「做了多少次」
 * 而不是「有多少条做完了」。
 *
 * 这里没有毫秒窗口的时区算术：date 列本身就是上海日历日，写入时已经折算过一次，
 * 所以范围查询就是两个字符串比较。这是换表换来的简化，不是省略。
 */
export async function countTaskCheckinsBetween(
  db: D1Database,
  userId: number,
  fromDate: string,
  toDate: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM goal_task_checkins
       WHERE user_id = ?1 AND date >= ?2 AND date <= ?3`,
    )
    .bind(userId, fromDate, toDate)
    .first<{ n: number }>()
  return row?.n ?? 0
}

/**
 * 有子任务的目标，当天的打卡是派生的：「当天所有子任务都勾了」⇔「goal_checkins
 * 有当天这一行」。多则删、少则补。
 *
 * 没有子任务的目标一行都不碰——那种目标的圆圈仍然是手动的 toggleCheckin，两种
 * 目标共用同一张 goal_checkins，所以七日圆点、快照 done、回看页全部不用知道
 * 这件事存在。
 *
 * 每一次改动子任务集合或其勾选状态之后都必须调用：勾、撤、新增、删除。
 */
export async function syncGoalCheckin(
  db: D1Database,
  userId: number,
  goalId: number,
  date: string,
  now: number,
): Promise<void> {
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM goal_tasks WHERE user_id = ?1 AND goal_id = ?2) AS n,
         (SELECT COUNT(*) FROM goal_task_checkins c
            JOIN goal_tasks t ON t.id = c.task_id AND t.user_id = c.user_id
            WHERE c.user_id = ?1 AND t.goal_id = ?2 AND c.date = ?3) AS x`,
    )
    .bind(userId, goalId, date)
    .first<{ n: number; x: number }>()
  const n = row?.n ?? 0
  if (n === 0) return
  if ((row?.x ?? 0) >= n) {
    await db
      .prepare('INSERT OR IGNORE INTO goal_checkins (user_id, goal_id, date, ts) VALUES (?1, ?2, ?3, ?4)')
      .bind(userId, goalId, date, now)
      .run()
    return
  }
  await db
    .prepare('DELETE FROM goal_checkins WHERE user_id = ?1 AND goal_id = ?2 AND date = ?3')
    .bind(userId, goalId, date)
    .run()
}

// --- goal_days（每日快照，由 00:00 Asia/Shanghai 的 cron 写入）------------

/** 写了就不改：cron 每天只跑一次，同一天再来一次就是覆盖重算，不是追加。 */
export async function upsertGoalDay(db: D1Database, row: GoalDay): Promise<void> {
  await db
    .prepare(
      `INSERT OR REPLACE INTO goal_days (user_id, date, shown, done, tasks_done, ts)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
    .bind(row.user_id, row.date, row.shown, row.done, row.tasks_done, row.ts)
    .run()
}

/** 闭区间，按 date 升序——/review 直接按时间顺序画点，不用在 JS 里再排一次。 */
export async function listGoalDays(
  db: D1Database,
  userId: number,
  fromDate: string,
  toDate: string,
): Promise<GoalDay[]> {
  const res = await db
    .prepare(
      `SELECT user_id, date, shown, done, tasks_done, ts FROM goal_days
       WHERE user_id = ?1 AND date >= ?2 AND date <= ?3
       ORDER BY date`,
    )
    .bind(userId, fromDate, toDate)
    .all<GoalDay>()
  return res.results
}

/** 午夜 cron 的驱动列表：谁今天有仍存活的目标，就该给谁写一行快照。 */
export async function listUsersWithLiveGoals(db: D1Database): Promise<number[]> {
  const res = await db
    .prepare('SELECT DISTINCT user_id FROM goals WHERE archived_at IS NULL ORDER BY user_id')
    .all<{ user_id: number }>()
  return res.results.map((r) => r.user_id)
}
