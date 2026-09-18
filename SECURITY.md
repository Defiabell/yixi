# Security

## What this software stores

New self-registered accounts also store a measurement version and the first authenticated setup-page visit time. These stay in D1, without analytics payloads or third-party tracking.

A row for every time you reached for a distracting app, with a timestamp, which app it was, and whether you went in or backed out.

That is the thing to hold in your head while reading the rest of this document. A leak here is not "an email address got out." It is a minute-by-minute record of when someone was bored, restless or unable to sleep, and which app they lost to. There is no way to make that data boring, so the design tries to keep the number of people who can read it as close to one as possible — and to be straight with you about where it falls short.

Everything below describes the code as it is, including the parts that are weaker than they could be.

## Threat model

**Who might want to read this data, and what they get:**

| Who | What they can see | What stops them |
| --- | --- | --- |
| Whoever runs the deployment | **Everything.** They hold the Cloudflare account, and D1 is queryable from a console. | Nothing technical. This is the reason to self-host rather than to join someone else's instance. |
| The instance owner, through the app | Per-user attempt counts for the last 7 days, names, and cohort-wide onboarding counts. **No event rows, no apps, no timestamps, no email addresses.** | Enforced in SQL, not by convention — see [What the owner cannot see](#what-the-owner-cannot-see). |
| Cloudflare | Everything, as with any hosted platform. | Out of scope. |
| Someone holding a stolen gate token | Full read/write on that one person: their whole log, their app config, their settings. Nothing about anyone else. | The token is 128 bits of randomness and cannot be guessed. It is the credential; treat it like one. |
| Someone holding a stolen copy of the database | **Every event row, in the clear.** Plus hashed passwords and encrypted tokens they cannot open. | Tokens are sealed under a key that is not in the database. The log itself is not encrypted at rest beyond whatever D1 provides. |
| Someone with an unlocked phone | `/review` and `/settings` open with no prompt (the session cookie lasts 180 days). The gate token itself needs one more deliberate tap. | Device lock. The token is masked behind `?show=1` on `/setup` and `/account` so a shoulder-surfer does not get it for free — and nothing on those pages puts it into a link, so revealing it once does not leave a copy in Safari History for later. |
| Another user of the same instance | Nothing. Every query is scoped by `user_id`; there is no sharing, no social layer and no cross-user read anywhere in the code. | |

**What is out of scope:** anyone with your Cloudflare credentials, anyone with your unlocked and unattended phone, and Cloudflare itself. If those are in your threat model, this is not the tool.

## The token trade-off (read this one)

This is the most important thing to understand about the security of this project, and it is a deliberate downgrade.

The gate token is stored **twice**, in two forms, for two different readers:

- **`users.token_hash`** — SHA-256 of the token, hex. This is what `/gate` verifies against, on every single app open. Nothing else.
- **`users.token_cipher` / `users.token_iv`** — the same token, AES-GCM encrypted under the `TOKEN_KEY` Worker secret, with a fresh 96-bit IV per seal. This exists so that a signed-in person can look their own token up again.

**"You can read your key back after signing in" and "the key is stored only as a hash" are mathematically incompatible.** Accepting the first means accepting that a path exists from stored data back to the plaintext. There is no clever way around it; anyone claiming otherwise is either not storing the key or not showing it to you.

So, honestly:

- A stolen database **alone** yields nothing usable. `TOKEN_KEY` lives in a Worker secret and never touches D1.
- A stolen database **plus** `TOKEN_KEY` yields every user's gate token in plaintext, and therefore every user's complete log.
- This is **strictly weaker** than the hash-only design it replaced, where not even the server could recover a token.

It was traded for a real problem: a hash-only design meant a lost token was gone forever, which in practice meant the owner had to hand out tokens by hand and had no answer at all to "I lost it." That trade may or may not be right for you. If it is not, delete the sealing (`sealToken`/`revealToken` in `src/crypto.ts` and `src/account.ts`) and go back to hash-only — `/gate` does not depend on it, so nothing about interception changes.

Two further notes:

- **Rotating `TOKEN_KEY` locks nobody out.** `/gate` never reads the ciphertext, so every token keeps working. The old sealed copies simply stop opening, and `revealToken` returns `null` rather than throwing — the page says "we cannot show you this key" instead of 500ing.
- **The plaintext exists on the server for exactly one instant**, inside `register()` or `claimAccount()` or `handleCreateUser()`, where both copies are derived from it. It is never written to a log and never stored in a third place.

## Passwords

PBKDF2-SHA256, **100,000 iterations**, a fresh 16-byte random salt per user, iteration count recorded per row.

**Why not the 600,000 OWASP recommends.** A Worker on Cloudflare's free plan gets 10ms of CPU per request, and the derivation runs inline with the login. Measured in the Workers runtime rather than estimated:

| iterations | 50k | 100k | 200k | 400k | 600k |
| --- | --- | --- | --- | --- | --- |
| CPU | 5ms | 6ms | 11ms | 23ms | 35ms |

Anything past roughly 150k does not fit, and 600k would be four failed logins out of four. 100k leaves headroom for the rest of the request.

**Why the shortfall is survivable, stated as a mitigation and not as an excuse:** the password is not the only thing standing between an attacker and an account. The gate token is 128 bits of randomness and cannot be brute-forced at all, and it — not the password — is what `/gate` accepts. A weak password compromises the *convenience* layer: signing in to read your token back and edit settings. The stored value is per-user salted, so a stolen database still has to be attacked one account at a time rather than with a rainbow table. And per-IP rate limiting on `/login` (12 attempts per 10 minutes) is the outer defense that the low iteration count leans on — which is exactly why that limiter is written as a single atomic `INSERT … ON CONFLICT … RETURNING` rather than a read-then-write.

Related deliberate choices:

- **Iteration counts are never upgraded during login.** Re-hashing at a higher cost would double that request's CPU and, on a 10ms budget, turn into a login that fails every time — locking out precisely the accounts the upgrade was meant to protect. Raising the cost needs a background re-hash, not the login path.
- **Login does not disclose whether an address is registered.** An unknown address is hashed against a fixed decoy record so the response takes the same work either way, and "no such address," "malformed address" and "wrong password" all return one identical message. Without the decoy, timing alone would answer "does this person use 一息," and given what `/review` contains, that is nobody's business.

## What the owner cannot see

`/review` is a record of one person's worst impulses. A friend who suspects the instance owner can read it will not use the tool honestly, and a tool used dishonestly is worthless. So the guarantee is structural rather than a rule someone has to remember:

1. Per-user event counts use `countAttemptsPerUser`, a `GROUP BY` returning counts. The additional `onboardingCounts` query returns only whole-cohort counts, never per-user milestones. There is no statement in that file that *could* return an event row.
2. `proceeded` and `abandoned` are not merely dropped at the render layer — **they are not in the SQL.** Someone else's proceed/abandon split is their abandon rate, which is a portrait of their self-control rather than a sign of life, and `/admin` has no business computing it.
3. Results are narrowed to `{id, name, isOwner, joined, attempts}` immediately, so the render layer physically cannot reach anything else. Email addresses are not selected at all.
4. There is exactly **one** GET route under `/admin` (plus `POST /admin/users`). Everything else under that prefix is a 404, so no detail endpoint can be reached by guessing a path.
5. Non-owners get a 403 before a single query runs, on any path and any method.
6. `test/admin.test.ts` seeds real events with sentinel values that cannot appear by coincidence and asserts none of them reach the page.

Per-user attempts in the last 7 days indicate whether gate requests arrive. Cohort-wide onboarding counts measure setup visits, first interceptions and D7 retention; they cannot prove an iOS automation was installed. See [measurement definitions](docs/onboarding.md).

## Fail-open is deliberate, and it is a security decision too

Three places in this system fail open on purpose.

**1. The Shortcut.** `/gate?fmt=text` answers either a `https://…` URL or the word `pass`, and the Shortcut's condition is *contains `https`*. A dead Worker, a rotated token, a timeout, a blank body and a poisoned DNS answer all fail to contain `https`, so nothing opens and the app the user wanted starts normally.

**2. The rate limiter.** `checkRate` catches D1 errors and allows the request. A broken throttle must not become an outage.

**3. The Turnstile check on `/register`** (`src/turnstile.ts`), in two of its three failure modes. No keys configured → no widget, no verification, sign-up works as it always did. Keys configured but Cloudflare cannot answer — the siteverify call throws, times out, returns non-2xx, returns unparseable JSON, or reports a problem with *our own* secret (`missing-input-secret`, `invalid-input-secret`, `internal-error`) → the registration proceeds. A typo in `TURNSTILE_SECRET` must not mean "nobody can ever have an account", with the reason visible only to whoever reads the logs.

The third mode is **not** fail-open, on purpose: a missing, expired, replayed, oversized or rejected token is refused, and so is any error code not on that short list of ours — including `bad-request`, which a caller can induce with a token of their choosing. That token check is the only thing the feature actually catches; waving it through would make the whole thing theatre. The residual risk is a browser that can reach this app but not `challenges.cloudflare.com`, which cannot register while that is true; an operator watching that happen deletes the secret and is back to case 1.

All three are the same judgment: **locking someone out of their own phone is worse than failing to stop them once.** The asymmetry is not close. One direction costs a missed interception; the other bricks several apps at a moment when the person is probably in a hurry, using a tool they built themselves.

This is why the Shortcut condition must never be inverted to *does not contain `pass`*. Written that way, a service outage takes every watched app down with it.

## If you self-host this

Things to know before you point a hostname at it.

**Registration is open.** `/register`, `/login`, `/claim` and `/recover` are reachable by anyone who finds the URL. The baseline defense on all four is a per-IP fixed-window throttle (`src/ratelimit.ts`): register 5/hour, claim 5/hour, recover 10/hour, login 12/10min, keyed on `CF-Connecting-IP`. The window is fixed rather than sliding, so a burst straddling a boundary briefly gets about double the allowance — fine for making sustained abuse cost real time, not a precise gate. There is no email verification of any kind.

**`/register` can additionally require a Turnstile challenge, and by default it does not.** Set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET` (README step 6) and every sign-up has to solve a Managed challenge before anything else in the handler runs. Leave either unset and there is no widget and no verification — the throttle is all you have, and a script spread over a few hundred addresses walks through it. This is a real gap if your host is public, and the repository being public means it is discoverable; the two-value fix is the whole remedy.

The challenge deliberately guards **only** `/register`. `/login` was left alone because a challenge there taxes whoever mistyped their own password, which is the common case, while the 12/10min throttle already makes guessing hopeless. `/claim` and `/recover` were left alone because both already require a 128-bit token in hand; a challenge cannot slow down something that is not guessable. Adding one to any of the three would charge friction to real users and buy nothing.

Two consequences of turning it on that are easy to miss:

- **It is checked before anything else `/register` does**, which means the `email_taken` disclosure two paragraphs down now costs a solved challenge too. That was not the reason for adding it, but it is the most useful thing it does.
- **A widget needs JavaScript.** With the keys set, a browser with JavaScript off cannot register. The form says so in a `<noscript>` line rather than silently rejecting.

**Email addresses are never verified and no mail is ever sent.** The direct consequence: `/register` tells a stranger whether a given address already has an account (`email_taken`, with a link to sign in). That disclosure is unavoidable for a signup form that has to be usable without verification, and it is a real leak — "does this person use 一息" is answerable at `/register` even though it is not answerable at `/login`. If that matters for your users, you need verification mail, which this project deliberately does not have.

**Password recovery is a closed loop with no third factor.** Forgot the password? Reset it with the gate token (`/recover`). Forgot the token? Sign in and read it back (`/account`). Lose both and the account is unrecoverable — there is no admin reset, and the owner can only mint a *new* user, which means a new token and no history. `/register` says this above the form, before anyone types anything, because a person who finds out at the moment they need it has been lied to by omission.

**`?k=<token>` puts the token in a URL.** It is accepted on the console pages as a one-time way in, and it is swapped for an `HttpOnly; Secure; SameSite=Lax` cookie on that same response so it drops out of the address bar afterwards. But it was in the address bar, which means it is in Safari's history, and it will be in a bookmark or a screenshot if anyone saves one. Use such a link once. Do not bookmark it. `referrer-policy: no-referrer` is set on every page so it cannot leak outward through a referer header.

**`/gate` carries the token in a query string on every app open.** There is no alternative: the Shortcuts app cannot conveniently set a request header. TLS covers it in transit, and the `no-store` response prevents caching, but a query string is the place a credential is most likely to be captured incidentally. Related: `wrangler.toml` ships with `[observability] enabled = true`, which turns on Workers Logs. Nothing in this code logs a token, but the platform's own invocation records include the request URL. Turn observability off if that matters to you.

**Sessions are long-lived by design.** 180 days, `HttpOnly; Secure; SameSite=Lax`, and the cookie value is an opaque 128-bit id whose row is the only thing that makes it work. Long because this thing gets opened by a Shortcut on a phone, and a login prompt at that moment is a login prompt standing between someone and the app they are already reaching for. It is affordable because it is revocable: a password change or reset deletes every `sessions_web` row for that user, in the same transaction as the password write. `SameSite=Lax` rather than `Strict` because these pages arrive by top-level navigation from a Shortcut, a note or a message, and `Strict` would drop the cookie on exactly that arrival — forcing the token back into the URL that the cookie exists to keep it out of.

**An app you have not configured is not logged.** `/gate` answers `pass` for an unknown or disabled app key and records *nothing*. Logging it would be surveillance nobody asked for.

## Other hardening that is actually in the code

Listed so you can check it rather than trust it.

- **CSP `default-src 'none'`** on every page, with `connect-src 'self'` (load-bearing: `sendBeacon('/resolve')` is a `connect-src` fetch), `img-src data:`, `base-uri 'none'`, `form-action 'self'`, `frame-ancestors 'none'`. Note that no CSP directive restricts the top-level `location.href = 'xhsdiscover://'` hand-off — `navigate-to` was never shipped by any browser.

  **One page has one exception, and it is the only external origin in the product.** With Turnstile configured, `/register` adds `https://challenges.cloudflare.com` to exactly three directives — `script-src` (api.js), `frame-src` (the iframe the widget draws itself in; without it the challenge silently never appears, because `frame-src` otherwise falls back to `default-src 'none'`) and `connect-src` (api.js calling its own host while solving) — and adds no other host to anything. `default-src 'none'`, `form-action 'self'` and `frame-ancestors 'none'` are unchanged even there.

  It is structural rather than a promise: one boolean on `PageOptions` both widens the policy and emits the loader, so neither can appear without the other, no caller can name a different host, and the flag is set by exactly one handler and only when both keys are present. Tests assert the full policy string on `/register`, assert that the set of hosts it names has one member, and assert that `/`, `/login`, `/claim` and `/recover` are served the byte-identical pre-Turnstile policy.
- **URL schemes are denylisted at the sink.** `javascript:`, `data:`, `vbscript:`, `blob:`, `file:` and `about:` are rejected by one shared module (`src/scheme.ts`) that `/settings` calls at write time, `/probe` and `/lookup` call in the browser, and the breathing page calls immediately before navigating. The last of those is the only check a scheme inserted straight into D1 still has to pass. Three hand-maintained copies of that list had already drifted before it was centralised.
- **User-supplied strings reach the inline scripts as inert JSON islands**, not as generated JavaScript, with `<`, U+2028 and U+2029 escaped so a label or a scheme cannot close the tag or break the string.
- **Constant-time comparison** on the token hash and the password hash, in both cases so that no future refactor of the surrounding query can become a character-by-character oracle.
- **The sid is a separate, narrow credential.** `/b` and `/resolve` authenticate on the sid alone — 128 bits, single-use, already bound to one user and one app — so the long-lived token never reaches the breathing page or its beacon. `/gate`'s block URL carries the sid and nothing else.
- **`/resolve` is atomic and idempotent.** The event, the grace window and the session claim go to D1 as one batched transaction, each write guarding on `resolved_at IS NULL`. A previous version claimed the session first, so a transient failure on a later statement left a session marked resolved with no grace window — the user tapped 「继续」, landed in the app, and was intercepted again immediately, which is the exact loop grace exists to prevent.
- **The login redirect is checked by resolving it, not by matching its shape.** `?next=` is parsed with `new URL(value, requestUrl)`; anything that lands on another origin is dropped, and the normalised path is re-checked before it becomes a `Location` header.

  This paragraph used to claim the redirect "cannot be turned into an open redirect" on the strength of a `startsWith('/') && !startsWith('//')` check. An audit broke it in two ways: `/\evil.example.com/` passed, because browsers read a backslash as a slash in an http(s) authority; and once resolving was added, `/..//evil.example.com/` still escaped, because it normalises to a same-origin URL whose *pathname* is `//evil.example.com/` — protocol-relative all over again the moment it is re-emitted. Both are fixed and pinned by tests that assert the invariant (the emitted `Location`, resolved as a browser would, stays on this origin) rather than a list of blocked strings.

  Recorded here because the lesson generalises: hand-rolled shape checks on URLs read as safe and are not, and a test suite that enumerates the shapes its author already thought of stays green over the ones they did not.
- **`no-store` on everything session-bearing.** The landing page is the sole exception (`public, max-age=60`), because it is static text with no session in it.
- **`POST`/redirect/`GET` on every write**, so a pull-to-refresh on a phone can never re-submit a form.

## Reporting a vulnerability

- **Non-sensitive issues** — open a [GitHub issue](../../issues).
- **Anything that would put someone's log at risk if it were public** — use **GitHub Security Advisories** on this repository (Security → Advisories → Report a vulnerability) so the report stays private until there is a fix.

There is no security contact email. Please do not send one to an address you guessed.

This is a personal project with no SLA. Expect a best-effort response, and expect an honest answer if something cannot be fixed within the constraints above rather than a promise that it will be.
