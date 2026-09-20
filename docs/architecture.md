# Architecture

For anyone about to change the code. Start with [CONTRIBUTING.md](../CONTRIBUTING.md) for the five constraints that must not be refactored away; this document explains the machine those constraints protect.

For what each half of the product does before you read how it is built: [breathe.md](breathe.md) (the interception face) and [today.md](today.md) (the goal-tending face).

## Shape of the thing

The entire application is one `fetch` handler and one `scheduled` handler in `src/index.ts`, backed by one D1 database. There is no router library, no framework, no build step beyond `wrangler`'s own bundling, and no runtime dependencies.

```
                iOS Shortcut                    a browser
                      │                              │
             GET /gate?app&k&fmt=text         GET /review, /settings, …
                      │                              │
                      ▼                              ▼
        ┌─────────────────────────────────────────────────────────┐
        │ src/index.ts — route table, three auth shapes, two crons│
        └─────────────────────────────────────────────────────────┘
              │                │                    │
              ▼                ▼                    ▼
        src/gate.ts       src/ui/*.ts          src/api/admin.ts
        (machine)         (server-rendered)    (owner only)
              │                │                    │
              └────────────────┼────────────────────┘
                               ▼
                          src/db.ts
                    every D1 statement, and only D1 statements
                               │
                               ▼
                        D1 (SQLite)
```

`src/db.ts` takes the `D1Database` binding rather than the whole `Env`, so nothing in it can reach a secret by accident. `src/stats.ts`, `src/snapshot.ts` and `src/account.ts` are the pure-logic layers between the routes and the database; `src/ui/*` owns rendering and nothing else — now including `progress.ts` (`/today/review`) and `todaysetup.ts` (`/today/setup`), the two newest additions to the 今日 face. `src/snapshot.ts` sits in the same layer as `src/stats.ts`: `snapshotUser` is pure — given a database and a day, it computes what that day's `goal_days` row should hold and returns it, without writing anything; `snapshotGoalDays` is the one that upserts, one row per user with a live goal, via `upsertGoalDay`. It is called from exactly two places, the midnight cron in `src/index.ts` and tests, never from a page. Within `src/ui/*.ts`, `schemefield.ts` is not a page — it is the URL-scheme picker field shared verbatim by `/settings` and `/today/goals`, so the two never grow two copies of the same jump-and-pick logic to drift apart. `src/dates.ts` is the same pattern one level up: `addDays`/`isExpired` used to live inside `src/ui/goals.ts` with `/today` importing a page module just to reach two pure date-string functions; both now import them from `src/dates.ts` instead, and neither `src/ui/goals.ts` nor `src/ui/today.ts` re-exports them. 渡 gets the same split `src/db.ts`/`src/stats.ts` draw for 拦截: `src/urges.ts` holds D1 CRUD for the `urges` table plus the pure `summarizeUrges` aggregation `/surf/review` renders from, so a day boundary or an hour bucket is a unit test rather than a database round trip. `src/ui/breathing.ts` pulled the breathing orb — markup, CSS and timing constants — out of `breathe.ts`, so `/b` and `/surf`'s own ten-minute step share one animation rather than two copies a future change can land in one and silently miss the other. `src/ui/surf.ts` (`/surf`) is 渡's ten-minute flow, one document and four steps switched by `body[data-step]` rather than four round trips, and nothing on it asks the reader anything. `src/surfscenes.ts` is what makes that possible: the five scenes, each with its opening line and three body exits, plus `sceneOf`/`sceneTrigger`, the permissive readers that turn whatever is in `users.surf_scene` into a whole page. It sits beside `src/urges.ts` rather than inside a page module, because `/surf` and `/surf/setup` both read it and a page that doubles as its sibling's library is the dependency direction this file keeps warning about. `src/ui/surfreview.ts` (`/surf/review`) is its 30-day look-back, built off `summarizeUrges` the same way `progress.ts` looks back at goal days. `src/ui/surfsetup.ts` (`/surf/setup`) is its 「怎么配」, and the only place the face is personalised at all: pick a scene once, optionally write one line, plus the same home-screen/Shortcuts instructions `todaysetup.ts` gives the other face.

## Request lifecycle

### The hot path: `GET /gate`

Called once for every launch of every watched app. Everything about it is shaped by a 10ms CPU budget.

```
1. app param present?              no  → 400
2. k param present?                no  → 401
3. userFromToken(k)                     one SHA-256, one indexed read on
                                        token_hash, then a constant-time
                                        re-compare
   no match                            → 401
4. getUserApp(user, app)                one indexed read
   missing or enabled = 0              → PASS, and record NOTHING
                                        (we are not watching this app; logging
                                         it would be surveillance)
5. getGraceUntil(user, app)             one indexed read
   until > now                         → record grace_pass, PASS
6. otherwise                            mint a 128-bit sid,
                                        insert a `sessions` row,
                                        record `attempt`,
                                        → BLOCK with /b?s=<sid>
```

**Step 5 before step 6 is what makes the loop terminate.** Reversing them, or merging the two event kinds, inflates the denominator of every statistic with events the user never caused.

Two response shapes:

| | body when passing | body when blocking |
| --- | --- | --- |
| default | `{"action":"pass"}` | `{"action":"block","url":"https://…"}` |
| `?fmt=text` | `pass` | `https://…/b?s=…` |

`fmt=text` exists because parsing JSON in the Shortcuts app takes six actions and three magic variables, and its If editor does not reliably offer a dictionary value as something to compare. Moving the parsing server-side turned the whole Shortcut into three actions with no variable picking — and made fail-open structural rather than a matter of the user writing the condition correctly. Every response is `Cache-Control: no-store`: a cached `pass` would silently disable the tool, and a cached `block` would hand out a dead sid.

The block URL carries **the sid only, never the token**. That URL is about to land in Safari's history and can be shared by accident; a sid is single-use and expires, a token is the user's whole identity.

### The breathing page: `GET /b?s=<sid>`

```
sid missing                              → the same quiet "expired" page, 400
session not found                        → 404
session already resolved                 → 410
session older than SESSION_TTL_MS (10m)  → 410
```

Every dead end renders the identical calm page. A 500 here means staring at an error message while an automation holds your phone hostage.

The app row is looked up for its label, wait and scheme, and is allowed to be **gone** — someone may have deleted it from `/settings` while this page sat in a Safari tab. It falls back to the raw app key and an empty scheme rather than erroring.

The page ships as one HTML response with inline CSS and one inline script. A single `requestAnimationFrame` loop drives the progress ring, the breath scale and the 吸气／呼气 word off one elapsed-time value, so the visual and the word cannot drift apart the way a CSS animation plus a JS timer eventually would. Inhale 4s, exhale 6s — the longer exhale is the part that settles you.

Config reaches the script as an inert JSON island (`<script type="application/json">`), never as generated JavaScript, because the label and the scheme are user-supplied.

### The decision: `POST /resolve`

Body is `sid=<sid>&action=proceed|abandon`, parsed from raw text rather than `formData()` because `sendBeacon` picks its own Content-Type.

```
1. validate sid + action                       bad → 400
2. getSession(sid)                        missing → 401
3. if proceed: read grace_seconds BEFORE staking
   the claim (nothing may fail between the claim
   and the writes it authorises)
4. resolveSessionAtomically() — one D1 batch:
      INSERT event        … WHERE resolved_at IS NULL
      INSERT/UPDATE grace … WHERE resolved_at IS NULL   (proceed only)
      UPDATE sessions SET resolved_at … WHERE resolved_at IS NULL
5. claim won  → 200 {ok:true}
   claim lost → 200 {ok:true, duplicate:true}
```

Idempotent by construction: `sendBeacon` gets retried by the browser and a double-tap fires it twice, so the first claim records the decision and every later one is a no-op that still answers 200 — the user's decision *did* land, there is nothing to report as an error.

Writes come first and the claim comes last, all in one transaction. An earlier version claimed the session first; a transient D1 failure on a following statement then left a session marked resolved with **no grace window**, and every retry short-circuited as a duplicate and never repaired it. The user tapped 「继续」, arrived in the app, and was intercepted again immediately — the exact loop grace exists to prevent.

Each write guards on the *prior state* (`resolved_at IS NULL`) rather than on a timestamp this call staked, because two resolutions of one session can share a millisecond.

Note there is deliberately **no freshness check** on `/resolve`. A breathing page left open for hours can still be resolved. Refusing a stale resolve means no grace window opens, which puts the user straight back into the loop. `/b` refuses to *render* a stale session, which is the right place for that rule.

### The console pages

```
/register /login /claim /recover   answered BEFORE authenticate(), or the only
                                   way to get an account would be to already
                                   have one. POSTs are rate-limited per IP;
                                   GETs are just pages and not worth a D1 write.

everything else                    authenticate() → 303 to /login?next=… when
                                   it fails (a bare 401 reads as "the site is
                                   broken", and /setup and /review are the
                                   first links anybody taps)
```

`next` only accepts a same-site path — an absolute URL, `//host` included, would turn the login page into an open redirect for phishing to borrow.

When a request authenticated by `?k=`, the response gets a `Set-Cookie` appended on the way out, so the token drops out of the URL from that point on.

### The cron: `scheduled`

One trigger, `0 4,16 * * *`, runs twice daily. The UTC hour/minute in `event.scheduledTime` selects cleanup or snapshots, even if execution is delayed. The old separate expressions remain accepted during trigger propagation; unknown expressions or times are rejected before touching the database.

**04:00 UTC — noon in Shanghai**, which is when nobody is mid-interception.

```
deleteStaleSessions(now − 7 days)      a `sessions` row older than a week can
                                       only be a breathing page nobody resolved
deleteExpiredWebSessions(now)          every ?k= visit mints a login session;
                                       without this they only accumulate
pruneRateLimits(now − 24h)             comfortably past the longest window
```

**`events` is never touched.** That history is the product.

**16:00 UTC — 00:00 in Shanghai**. It fires a moment after the day it is about to summarize has already ended, so `snapshotDate(now)` backs the clock up 60 seconds before converting to a calendar day — the tick's own instant must never leak into the date it writes, or the snapshot would name the day that just started instead of the one that just finished.

For every user with at least one non-archived goal (`listUsersWithLiveGoals`), `snapshotUser` computes one row, pure and unwritten until the caller upserts it:

```
shown       = that user's non-archived goals, not expired as of the snapshot
              day — isExpired(g, date), the same rule /today applies, but
              pinned to `date` rather than "today" so a cron that runs late
              still judges expiry against the day it is closing out —
              trimmed to that user's own card limit, todayGoalLimit(user),
              which is why snapshotUser reads the user row as well as the
              goals: a constant 3 here would record a denominator /today
              never put on screen
done        = of those `shown` goals, how many have a goal_checkins row
              for `date`
tasks_done  = goal_task_checkins rows across ALL of the user's goals (not just
              the `shown` ones) whose date = the snapshot day
INSERT OR REPLACE INTO goal_days (user_id, date, shown, done, tasks_done, ts)
```

`INSERT OR REPLACE` against the `(user_id, date)` primary key is what makes a re-run idempotent: the same day snapshotted twice overwrites itself rather than erroring or duplicating a row. Each user's snapshot runs inside its own `try`/`catch` in `snapshotGoalDays` — a failure is logged and counted, never thrown, so one bad row cannot stop every other user's snapshot from being written in the same tick.

**Honesty over completeness.** If the Worker did not run at midnight — an outage, a bad deploy — no row is written and none is backfilled later. `/today/review` renders that day as a gap in its 30-day strip, not a guessed number.

## The three auth shapes, and why each exists

There are three, and they are not interchangeable. Collapsing them would each time cost something specific.

```
┌──────────────┬──────────────────────┬─────────────────────────────────────┐
│ credential   │ where it is accepted │ why it cannot be one of the others  │
├──────────────┼──────────────────────┼─────────────────────────────────────┤
│ ?k=<token>   │ /gate, and once on   │ The Shortcuts app cannot            │
│ 128-bit hex  │ any console page     │ conveniently set a request header,  │
│              │                      │ so the credential has to ride in    │
│              │                      │ the query string. On the console    │
│              │                      │ pages it is swapped for a cookie    │
│              │                      │ immediately so it stops living in   │
│              │                      │ browser history.                    │
├──────────────┼──────────────────────┼─────────────────────────────────────┤
│ sid          │ /b, POST /resolve    │ /resolve is called by sendBeacon,   │
│ 128-bit hex  │                      │ which cannot set headers either —   │
│ single-use   │                      │ and putting the long-lived token in │
│              │                      │ a beacon body would widen its       │
│              │                      │ exposure for nothing. The sid is    │
│              │                      │ already bound to one user and one   │
│              │                      │ app, and expires.                   │
├──────────────┼──────────────────────┼─────────────────────────────────────┤
│ cookie       │ every console page   │ Must be revocable. A password       │
│ = sessions_  │                      │ change has to sign the old sessions │
│ web row id   │                      │ out, and with a stateless signed    │
│              │                      │ cookie the only lever is rotating   │
│              │                      │ the global secret — which evicts    │
│              │                      │ everyone at once.                   │
└──────────────┴──────────────────────┴─────────────────────────────────────┘
```

The cookie used to be a stateless HMAC of `<userId>.<expiry>`, which was cheaper — no read, no table. It bought revocation for the price of one indexed read per page view. Old-format cookies are rejected by a shape check before D1 is even consulted; honouring them would reopen the hole `sessions_web` was added to close.

`authenticate()` tries the token **first**. A `?k=` that does not resolve fails the whole request rather than falling back to the cookie: somebody pasting a wrong or revoked token should be told so, not silently shown the previous user's log on a shared phone.

`COOKIE_SECRET` survives in `Env` and in `wrangler.toml`'s comments but **no code reads it**. It is legacy from the signed-cookie era.

## D1 tables

Eleven migrations. `0001_init.sql` is the original single-purpose schema; `0002_accounts.sql` adds self-service accounts; `0003_rate_limit.sql` adds the throttle that open registration made necessary; `0004_goals.sql` adds the three tables behind `/today` and `/today/goals`, touching nothing that existed before; `0005_goal_days.sql` adds the one table behind `/today/review`; `0006_user_locale.sql` adds the column a signed-in reader's language choice lives in; `0007_daily_tasks.sql` adds `goal_task_checkins`, gives each sub-task its own `target`/`target_label`, and converts any existing `done_at` timestamp into a check-in row without touching the retired column itself; `0008_today_goals.sql` adds the column holding how many goal cards `/today` puts on the page for that reader; `0009_onboarding.sql` adds `users.onboarding_version` and `users.setup_opened_at` plus an index on attempt events, for a cohort that only starts counting from accounts registered after it landed; `0010_urges.sql` adds the `urges` table behind 渡's ten-minute flow, plus `users.surf_triggers` — the reader's own trigger chips for the step 0 that version of the flow had; `0011_surf_scene.sql` adds `users.surf_scene` and `users.surf_line`, the one-time answers that replaced every question the flow used to ask, and retires `surf_triggers` without dropping it.

`0006`, `0008` and `0011` are deploy prerequisites rather than optional extras, which is why deploying means `npm run deploy` (migrations first) and never a bare `wrangler deploy`: `users.locale`, `users.today_goals`, `users.surf_scene` and `users.surf_line` are all in the projection `findUserByTokenHash` selects, so `/gate` — the hot path every intercepted app opening goes through — fails against a database that has not been migrated, and interception stops. `0010` is not in that projection any more, but the `urges` table it creates is still what `/surf` writes to.

### `users`

| column | notes |
| --- | --- |
| `id` | |
| `name` | display name; for a self-registered account it defaults to the local part of the email |
| `token_hash` | SHA-256 hex of the gate token, `UNIQUE`. **This is the credential `/gate` verifies.** |
| `is_owner` | gates `/admin`. There is deliberately no UI to grant it — flip it in D1. |
| `created_at` | epoch ms |
| `email` | added in 0002; stored lowercased; `UNIQUE` via a partial index `WHERE email IS NOT NULL` so pre-accounts rows (NULL email) do not collide with each other |
| `password_hash` `password_salt` `password_iters` | base64 PBKDF2-SHA256, base64 16-byte salt, and the iteration count **recorded per row** so the cost can be raised later without invalidating old hashes |
| `token_cipher` `token_iv` | added in 0002; AES-GCM ciphertext of the same token under `TOKEN_KEY`, plus a fresh 96-bit IV. Exists solely so a signed-in holder can read their own key back. See [SECURITY.md](../SECURITY.md#the-token-trade-off-read-this-one) — this is a deliberate downgrade from hash-only. |
| `locale` | added in 0006; `'zh'`/`'en'`, or NULL for a reader who has never chosen |
| `today_goals` | added in 0008; how many goal cards `/today` draws for this reader, 1…9, or NULL for the default. Read through `todayGoalLimit()` in `src/types.ts`, never directly: it is the one number a page hands to `slice()`, so anything stored outside the range falls back to `TODAY_GOAL_LIMIT` rather than reaching the page |
| `surf_triggers` | **deprecated, column kept.** Added in 0010 for 渡's trigger chips; nothing reads or writes it since 0011 removed the step that offered them. D1's `DROP COLUMN` rewrites the whole table, which is not a risk worth taking for one unread text column |
| `surf_scene` | added in 0011; which scene 渡's flow opens with — a bare `SceneKey` (`lust`\|`feed`\|`game`\|`snack`), or `custom:` plus up to 10 characters of the reader's own, or NULL for an account that has never opened `/surf/setup`. Read through `sceneOf()`/`sceneTrigger()` in `src/surfscenes.ts`, never directly — the same permissive-fallback pattern as `today_goals`: an unknown key, a bare `custom`, or leftover v1 text all resolve to the neutral scene rather than blanking a page somebody is reading mid-urge |
| `surf_line` | added in 0011; one line the reader wrote for their own worst moment, up to 40 characters, shown under the scene's opening. NULL or empty means nothing is shown. The only copy in the product its reader writes |

Every account column is nullable, because a token handed out before accounts existed is still a complete identity; it just cannot log in with a password until somebody `/claim`s it.

### `user_apps`

Primary key `(user_id, app)`.

| column | notes |
| --- | --- |
| `app` | short key, e.g. `xhs`. **Lowercase, `[a-z0-9_-]{1,32}`, enforced.** This is the string retyped by hand inside an iOS automation, where a mismatch fails *silently* — the Shortcut runs, the gate says "not watching this one", and the user simply never gets intercepted. Rejecting `XHS` as a visible validation error is cheaper than that debugging session. |
| `label` | display name shown on the breathing page |
| `scheme` | e.g. `xhsdiscover://`. Must be probed on-device before it means anything. |
| `wait_seconds` | default 10, range 1–120 (the breathing page clamps to 300 independently) |
| `grace_seconds` | default 90, range **30**–3600. The floor is not cosmetic — see below. |
| `enabled` | 0 disables interception; existing history is untouched |

### `sessions` — one interception

| column | notes |
| --- | --- |
| `sid` | 128-bit hex, primary key. Doubles as a one-shot bearer credential for `/b` and `/resolve`. |
| `user_id` `app` | what was intercepted |
| `created_at` | `/b` refuses to render a session older than 10 minutes |
| `resolved_at` | `NULL` = still undecided. The claim target of `resolveSessionAtomically`. |

Trimmed nightly at 7 days.

### `events` — the product

Append-only. Never deleted, never updated.

| column | notes |
| --- | --- |
| `user_id` `app` `ts` | epoch ms |
| `sid` | `NOT NULL`. **`''` is the sentinel for `grace_pass`**, which has no session behind it. |
| `kind` | `attempt` \| `grace_pass` \| `proceeded` \| `abandoned` |
| `date` | the **Asia/Shanghai** calendar day as `YYYY-MM-DD`, precomputed at insert |

Three indexes: `(user_id, date)`, `(user_id, sid)`, `(user_id, app, ts)`.

`date` is stored rather than derived because "which day was this" is a question about the user's life, not about UTC — a 00:30 relapse belongs to the night it happened, not the previous afternoon. `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' })` yields `YYYY-MM-DD`, which sorts and compares as a plain string, so no date library is needed. The zone is hard-coded; making it per-user would mean recomputing every stored `date`.

There is deliberately **no `expired` kind**. Someone who opened the breathing page and swiped away is `attempt − proceeded − abandoned`, which `src/stats.ts` surfaces as `undecided`.

### `grace` — the anti-loop state

Primary key `(user_id, app)`, one column: `until` (epoch ms). One row per app per user, upserted on every proceed.

### `sessions_web` — logged-in browsers

`id` (128-bit hex, the entire cookie value), `user_id`, `created_at`, `expires_at`. Deleting a row signs that browser out; deleting a user's rows signs them out everywhere, which is the whole reason the table exists. Indexed on `user_id` so that second operation is cheap.

Named apart from `sessions` on purpose. The two never mix.

### `rate_limit` — fixed-window counters

Primary key `(bucket, subject)`, plus `window_start` and `count`. `subject` is `CF-Connecting-IP`, which the edge sets and a client cannot forge; when it is absent (local dev, odd proxies) everything falls into one shared bucket, which fails closed for the group rather than handing everyone an unlimited allowance each.

The counter is a single atomic statement:

```sql
INSERT INTO rate_limit (bucket, subject, window_start, count) VALUES (?1, ?2, ?3, 1)
ON CONFLICT (bucket, subject) DO UPDATE SET
  window_start = CASE WHEN rate_limit.window_start <= ?4 THEN ?3 ELSE rate_limit.window_start END,
  count        = CASE WHEN rate_limit.window_start <= ?4 THEN 1  ELSE rate_limit.count + 1 END
RETURNING count, window_start
```

The first version read the count and then incremented it. Under concurrency that does not leak a little — thirty simultaneous requests all read a count below the limit and all pass, which is the entire limiter gone. Since PBKDF2 is capped at 100k rounds *precisely because* this is meant to be the outer defense, that handed an attacker unlimited-concurrency password guessing. It was caught by a concurrency test, not by review.

The upsert both resets a lapsed window and increments a live one, so the decision is made from a value that cannot have changed underneath. Requests past the limit still increment but do not extend `window_start`, so the window still closes on schedule.

### `goals`, `goal_tasks`, `goal_checkins`, `goal_task_checkins` — behind `/today` and `/today/goals`

Four tables. `goals`, `goal_tasks` and `goal_checkins` were added in `0004_goals.sql`, touching nothing that came before; `goal_task_checkins` was added in `0007_daily_tasks.sql`, alongside two new columns on `goal_tasks` (`target`, `target_label`) that let a sub-task carry its own jump target instead of only inheriting the goal's. `goals` is the short list of things that matter over the next while; `goal_tasks` are the sub-tasks under a goal, checked once per calendar day rather than crossed off once; `goal_checkins` is a per-day check-in on the goal itself, primary-keyed `(user_id, goal_id, date)` so tapping the check button twice in one day writes nothing twice; `goal_task_checkins` is the same idea one level down, primary-keyed `(user_id, task_id, date)`.

**A goal with sub-tasks does not get checked in by hand — its `goal_checkins` row is derived.** `syncGoalCheckin` counts that goal's live `goal_tasks` against `goal_task_checkins` for the same date, joined back through `goal_tasks` so a check-in kept for a deleted task can never inflate the count, and writes or deletes today's `goal_checkins` row depending on whether every live sub-task is checked. It reruns after every write that could change the answer — a sub-task checked, unchecked, added or deleted. Tapping the goal's own circle does not write `goal_checkins` directly either: it checks or clears every sub-task and lets `syncGoalCheckin` re-derive the goal row from that. A goal with no sub-tasks keeps the plain manual toggle straight into `goal_checkins`. That is why the seven dots, the snapshot and `/today/review` needed no change at all: there is still exactly one ledger for "did I do this today" per goal.

`goal_checkins.date` is the same **Asia/Shanghai** calendar string as `events.date` — same computation, same format — so a check-in and a gate interception attribute to the same day rather than drifting across a UTC boundary. Every write against all four tables carries `user_id` explicitly, rather than trusting a join through `goal_id` (or `task_id`) alone, so an id guessed or borrowed from another account can never land a write in someone else's row.

**`deleteGoal` keeps `goal_checkins` and `goal_task_checkins` both.** Its `db.batch` only deletes from `goal_tasks` and `goals`; the check-in history behind the deleted goal, and behind each of its now-gone sub-tasks, is left in place. `goal_days` is aggregate — the day's `shown`/`done`/`tasks_done` counts do not name which goal or task was checked — so a deleted goal or task cannot corrupt it. The per-goal 7-day/30-day rates on `/today/review` only ever iterate over goals that still exist, so a deleted goal's orphaned `goal_checkins` rows, and a deleted task's orphaned `goal_task_checkins` rows, are simply never read; they are kept because the history happened, not because anything currently queries them by a dangling `goal_id` or `task_id`.

### `goal_days` — the daily snapshot behind `/today/review`

Added in `0005_goal_days.sql`. One row per `(user_id, date)`, written once by the midnight cron (see [The cron: `scheduled`](#the-cron-scheduled)) and never rewritten except by an idempotent re-run of the same day.

| column | notes |
| --- | --- |
| `user_id` `date` | primary key. `date` is the **Asia/Shanghai** day being summarized, not the day the cron ran |
| `shown` | how many goals `/today` would have shown that user that day — non-archived, not expired as of `date`, capped at that user's own `users.today_goals` (`TODAY_GOAL_LIMIT` when they have not chosen one) |
| `done` | of those, how many had a `goal_checkins` row for `date` |
| `tasks_done` | sub-task check-ins that day, across every goal the user had, not only the ones in `shown` |
| `ts` | when the row was written, epoch ms |

A day with no row is not zero — it is unknown, and `/today/review` renders it as a gap rather than guessing. "Today" itself never has a row (the cron has not run yet), so `/today/review` computes today's ratio live, with the same selection rule `snapshotUser` would use.

### `urges` — one row per walk-through, behind 渡

Added in `0010_urges.sql`. `id` autoincrement; no separate index needed beyond `(user_id, started_at)`, which both `listUrgesSince`'s ordering and its own day-window filtering lean on.

| column | notes |
| --- | --- |
| `started_at` | the moment the flow page was opened — the row is created on load, not on a tap, so an urge abandoned three seconds in still leaves one. `shanghaiDate(started_at)` decides which day the row belongs to — same Asia/Shanghai convention as `events.date`, but read on demand here rather than stored, because `summarizeUrges` (`src/urges.ts`) is the only place that ever needs it |
| `ended_at` `outcome` | both `NULL` together mean the walk-through was never finished (page closed mid-flow); `outcome` is `'passed'` or `'opened'` once `ended_at` is set. `finishUrge`'s own `WHERE … outcome IS NULL` makes the write a one-way latch, the same shape as the `email IS NULL` guard on account claiming in `src/db.ts` — a retried beacon after the first one already landed changes nothing and still answers 200 |
| `state` | the body-state chip v1's step 0 asked for: `hungry`\|`angry`\|`lonely`\|`tired`\|`none`\|`''`. **Always `''` on a row written since 0011** — the flow asks nothing now — and the enum survives only so the historical rows still read |
| `trigger` | written by the server from `users.surf_scene`, never by the client: the scene key for a preset, the reader's own words for a custom one, or `''` for an account that never configured a scene |
| `rounds` | how many ten-minute rounds this walk-through went through, starting at 1 |
| `note` | v1's optional follow-up answer, only ever written when `outcome = 'opened'`. **Never written since 0011**: typing is a choice, and the closing screen is the worst moment to ask for one. Historical values stay |

`summarizeUrges` is pure — no D1 access — and is what turns rows already fetched by `listUrgesSince` into what `/surf/review` renders: day buckets, an Asia/Shanghai hour histogram, state counts and a top-5 trigger tally, for a `today`/`days` window the caller names. The last two are computed and not rendered — `/surf/review` dropped the 「身体」 and 「引子」 cards when the flow stopped collecting either — and they cost nothing to keep for the rows that do carry them. Anything outside that window is dropped from every one of those totals, not merely left out of its day's bucket — the function's whole output has to describe exactly the window it was asked for, the same discipline `src/stats.ts` holds `attempt` to.

## The anti-loop mechanism

The problem, in full:

```
tap 「继续」
   → location.href = 'xhsdiscover://'
      → iOS hands control to 小红书
         → 小红书 opens
            → the "When 小红书 is Opened" automation FIRES AGAIN
               → GET /gate
                  → block
                     → Safari, breathing page
                        → tap 「继续」
                           → … forever
```

Native One Sec escapes this from inside its own process: it can navigate away with no user gesture. **Safari cannot** — it only follows a custom scheme from inside the synchronous call stack of a real tap. So the "we just let this through" state cannot live in the page. It has to live where the next `/gate` call can see it.

Hence the `grace` table. `POST /resolve` with `action=proceed` writes `until = now + grace_seconds × 1000`, and step 5 of `/gate` answers `pass` for anything inside that window. The user taps nothing extra.

The default is **90 seconds**, with a hard floor of **30**. The floor is load-bearing: tapping 「继续」 has to survive Safari handing off, the app cold-starting, and the automation firing again on the way in — several seconds of real time. Set below that and the user is intercepted again the moment they arrive, which reads as the tool being broken. The ceiling on usefulness is the other direction: 90 seconds is short enough that putting the phone down and picking it back up two minutes later gets you stopped again, which is the intended behaviour rather than a compromise.

`/resolve` reads `grace_seconds` from `user_apps`, falling back to the default when the app was unconfigured or disabled between the block and this call — because without *any* grace window the Shortcut would intercept the return jump and loop.

## Accounting semantics

`src/stats.ts` is pure data; `src/ui/review.ts` owns rendering. Every number on `/review` is independently testable, and `test/stats.test.ts` is the largest single guard in the repo.

**Rule 1 — `attempt` is the sole denominator.** `grace_pass` is machine noise. Every query starts from `kind = 'attempt'` rows only. Counting the noise would deflate the abandon rate silently.

**Rule 2 — outcomes are attributed to the day of the attempt.** The daily query starts from attempt rows and `LEFT JOIN`s the resolutions onto them by sid:

```sql
SELECT sid, kind, MIN(ts) AS first_ts
FROM events
WHERE user_id = ?1 AND sid <> '' AND kind IN ('proceeded','abandoned')
GROUP BY sid
```

`MIN(ts)` collapses to one resolution per sid, so a duplicate row cannot fan the join out and inflate `attempts`. SQLite guarantees bare columns selected alongside `MIN()` come from the row that produced the minimum, which makes this "the first decision wins."

Anchoring on the attempt is what keeps `attempt − proceeded − abandoned` from going negative across midnight.

**Rule 3 — `sid <> ''` is guarded twice.** The kind filter already excludes `grace_pass`, and the join condition carries `a.sid <> ''` anyway. Every `grace_pass` a user ever produced shares that one sid value, so an accidental match would multiply a day's attempts by the size of the noise pile. Belt and braces, on purpose.

**Rule 4 — `undecided` is its own third number.** Opened the breathing page, swiped away. Those sessions did not enter the app, but they were not a deliberate 「算了」 either, so folding them into `abandoned` would flatter the reader with a rate they did not earn. It is clamped at zero: with attempt-anchored attribution it cannot go negative, but a resolve written against an unrecorded attempt should degrade to 0 rather than render "−1".

**Rule 5 — the exclusion is visible.** `monthGracePasses` is reported once as a footnote. A number thrown away silently is a number nobody can audit.

`abandonRate` is `null`, never `NaN`, when there were no attempts. Apps deleted from `user_apps` still appear in the per-app ranking under their raw key — the history happened, and hiding it would quietly shrink the totals.

`getReviewStats` is four indexed queries over a 30-day window, run in parallel: daily buckets, per-app buckets, the grace_pass count, and the first-ever attempt date (which drives the empty state — a brand-new user gets a welcome, not a wall of zeroes). `now` is injectable so tests can pin the day boundary.

## Two deployments, one database

```
                        ┌──────────────────────┐
                        │  D1 database "yixi"  │
                        └──────────┬───────────┘
                     ┌─────────────┴─────────────┐
                     │                           │
        ┌────────────▼────────────┐   ┌──────────▼──────────────┐
        │  Pages                  │   │  Worker                 │
        │  pages/wrangler.toml    │   │  wrangler.toml          │
        │                         │   │                         │
        │  serves every request   │   │  runs the nightly cron   │
        │  (the human hostname)   │   │  (Pages has no Cron      │
        │                         │   │   Triggers)              │
        │  pages/functions/       │   │  also serves the app on  │
        │  [[path]].ts is ONE     │   │  its own hostname, which │
        │  line forwarding into   │   │  is DNS-poisoned inside  │
        │  the same fetch handler │   │  mainland China          │
        └─────────────────────────┘   └─────────────────────────┘
```

The reasoning is in the [README](../README.md#why-it-deploys-twice). What matters when changing code: **`src/` is shared verbatim.** `pages/functions/[[path]].ts` does nothing but `worker.fetch(ctx.request, ctx.env)`, and both configs point at the same `database_id`. A change to `src/` needs both deployments pushed, and `TOKEN_KEY` must be byte-for-byte identical between them or one side cannot open tokens the other sealed.

`pages/` exists as its own directory only because `wrangler pages deploy` refuses a custom config path, so the Pages project cannot share the Worker's `wrangler.toml`.

If a custom domain is ever attached to the Worker, `pages/` can be deleted entirely.

## Rendering conventions

`src/ui/layout.ts` is the shell for every page and enforces the hard rules.

**Zero external requests, enforced by CSP** rather than merely intended:

```
default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';
connect-src 'self'; img-src data:; base-uri 'none'; form-action 'self';
frame-ancestors 'none'
```

`connect-src 'self'` is load-bearing — `sendBeacon('/resolve')` is a `connect-src` fetch and would be blocked without it. Nothing here restricts the top-level `location.href = 'xhsdiscover://'` hand-off; `navigate-to` was never shipped by any browser.

Also set on every page: `referrer-policy: no-referrer`, `x-content-type-options: nosniff`, and `cache-control: no-store` (the landing page is the one exception, at `public, max-age=60`).

**Two visual skins** share all markup and all JavaScript; only the design tokens differ. `'ink'` (v1 「墨」) is ink washes drifting on near-black with a serif face; `'breath'` (v2 「息」) is a hairline ring and one dot. `DEFAULT_THEME` in `layout.ts` is the single constant that dresses the whole product, and `/mock?v=1|2` renders both through the *real* `breathePage` — not a copy — so what is being judged is exactly what `/b` will serve.

**`jsonScript(id, value)`** is how user-supplied data reaches an inline script: an inert `<script type="application/json">` island with `<`, U+2028 and U+2029 escaped, so a label or a URL scheme can never become code.

`src/ui/console.ts` holds the shared chrome for the console's three faces — 今日 (goal-tending: `/today`, `/today/goals`, `/today/review`, `/today/setup`), 拦截 (the original interception console: `/review`, `/settings`, `/setup`) and 渡 (urge-surfing: `/surf`, `/surf/review`, `/surf/setup`) — plus `/account` on every face and `/admin` on 拦截 only for the owner, so all of it reads as one surface rather than a dozen separate designs. Each face keeps its own four-or-five-tab row rather than one long row of everything, with a face switch beside the brand offering the other two in a fixed order; `faceOf()` is the one place a page's tab is mapped to its face. It lives in its own module rather than inside one of those pages, because a page module that doubles as the shared library for its siblings is a dependency direction that only gets worse.

All writes are plain HTML forms with POST/redirect/GET — no fetch, no client validation the server does not repeat. Only the breathing page and `/settings` carry any script at all, and each has a specific reason. `/settings` is the one place that fetches: the candidate picker calls `GET /api/candidates` so the reader never leaves the half-filled form the answer is for.

## URL schemes

Three layers, and they are not redundant:

| where | what it does |
| --- | --- |
| `src/schemes.ts` | a frozen, build-time snapshot of two public collections — 60 apps, 64 candidates, **every one tagged `listed`, none `verified`**. Compiled in rather than fetched, because the pages may make no external request. |
| `src/scheme.ts` | `safeScheme()` — the one authority on what must never reach `location.href`. Called by `/settings` at write time, by the picker in the browser, and by `breathe.ts` at the sink. The sink call is the only one a scheme inserted straight into D1 still has to pass. |
| `/settings` 「试跳」 | the only thing that can actually settle the question, because it runs on the phone. `location.href` inside a click handler — the same mechanism 「继续」 uses, asserted by test. One button covers a candidate just picked, a scheme saved months ago and a line pasted from a forum. |

`GET /api/candidates` searches the table by Chinese name, English name, pinyin and abbreviation, and when it finds nothing falls back to the iTunes Search API to confirm the app exists and get its bundle id, from which it *derives* pattern guesses labelled `derived`. That fallback currently fails from the Cloudflare edge — Apple answers HTTP 429 to Cloudflare's egress addresses, and it works from a laptop — known, unfixed; the answer says "could not check", never "no such app", and never invents a scheme.

It used to be a page, `/lookup`, with `/probe` as a second page for testing. Both are gone and 302 to `/settings`. The reason is worth recording: they were destinations for a *step*, not for a task. Nobody wants to look at a list of candidates — they want to fill in one field, and being sent to another page to do it discarded the half-typed form the answer was for. Everything both pages did is now on that field: the worked example above the box, 「试跳」 beside it, and a folded inline picker whose 「用这个」 writes into the input with no navigation and no server round trip. Because 「试跳」 still has to leave the page, the form is written to `localStorage` synchronously before the jump and restored once on the way back.

The button hierarchy on a candidate is deliberate: 「试跳」 is the filled dark one and carries the ordinal ①, 「用这个」 is outlined and carries ②. Testing first is not advice, it is the visual order — the same reason the breathing page shows 算了 first and louder than 继续. The ordinals are asserted by test, in the renderer rather than in the markup, because the rows are built client-side now.

## Tests

843 tests over 36 files, `vitest` with `@cloudflare/vitest-pool-workers`, running against a real Miniflare D1 with the real migrations applied (`vitest.config.ts` reads `./migrations` and hands them to `test/apply-migrations.ts`).

The files worth knowing about before you change something:

| file | what it is really guarding |
| --- | --- |
| `test/gate.test.ts` | the four decision branches, and that `grace_pass` never contaminates an attempt count |
| `test/breathe.test.ts` | the Safari gesture-stack contract, the deliberate button asymmetry, and the no-external-requests rule |
| `test/candidates.test.ts` | that every `verified` claim carries its evidence, that the table never guesses, that every candidate is traceable, and that the three App Store failure causes stay distinguishable |
| `test/settings.test.ts` | that the page holds exactly one `jump()` and one synchronous `location.href` assignment, and that the whole click-to-jump path contains no `await`, `fetch`, `setTimeout` or `.then` — the picker's own `fetch` lives only in the search path. Also that adding a key that already exists refuses instead of overwriting the row's tuned intervals |
| `test/chrome.test.ts` | that every signed-in page emits the same nav, diffed against its siblings, and that nothing renders below 11px in px or rem |
| `test/admin.test.ts` | the privacy line, using sentinel values that cannot appear by coincidence |
| `test/stats.test.ts` | the accounting semantics, including the midnight boundary |
| `test/ratelimit.test.ts` | concurrency, which is how the original limiter was found to be useless |
| `test/signed-out.test.ts` | that the login redirect cannot be turned into an open redirect |
| `test/today.test.ts` | that only the first `todayGoalLimit(user)` live goals get a card and the first is the hero, that a checked card sinks below the unchecked ones, that the check button's ink-bloom guards against a double tap filing two POSTs (check, then uncheck), that the jump script holds exactly one synchronous `location.href=` assignment, and — the newest addition — that no rendered `.linky` button or the `.tk` per-day check circle slips back under the 44px tap-target floor |

Three of these strip comments from the rendered inline scripts before asserting on them, because the scripts *carry* comments containing the very words being searched for and a naive match would go green on the bug.

## Public discovery

`src/ui/guides.ts` renders two anonymous articles and an explicit three-URL sitemap (homepage, iPhone guide, one sec comparison). These routes run before authentication and never read D1 or credentials. Like the landing page, localized responses vary on Cookie and Accept-Language. The sitemap uses the request origin for self-hosting. Private routes keep authentication and default noindex metadata.
