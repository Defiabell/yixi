English | [简体中文](README.zh-CN.md)

# yixi (一息)

Breathe for ten seconds before the app opens. A self-hosted stand-in for [One Sec](https://one-sec.app/), built as a web page instead of an iPhone app, running entirely on Cloudflare's free tier.

You reach for Xiaohongshu (or Instagram, or Reddit). Before it opens, your phone jumps to a page that asks you to watch a circle and breathe. Ten seconds later you may go in, or you may put the phone down. Either way it keeps the receipt, so a week later you can see how many times you were stopped and how many of those you let go.

<p align="center">
  <img src="docs/images/breathing-paper.png" width="300" alt="The breathing page in light mode: an ink blot on paper, 「算了」 as a filled pill, 「继续打开」 as a small underlined link">
  &nbsp;&nbsp;
  <img src="docs/images/breathing-ink.png" width="300" alt="The same page in dark mode: pale ink on near-black">
</p>

<p align="center"><sub>The countdown has finished, so both choices are showing. 「算了」 (give up) is a filled pill; 「继续打开」 (open anyway) is a small underlined link. That asymmetry is deliberate — the default path should be putting the phone down. Light mode is not the dark theme brightened; it inverts into ink on paper.</sub></p>

<p align="center">
  <b><a href="https://yixi-app.pages.dev">Try it now →</a></b><br>
  <sub>An open instance, free, nothing to deploy. Or <a href="#deploy-your-own-15-min">run your own</a> in fifteen minutes.</sub>
</p>

**Who this is for:** anyone who wants a nudge rather than a wall. It is friction, not enforcement — the automation is one toggle away from off, on purpose.

The open instance is the quickest way in. If you would rather not keep a minute-by-minute log of your worst impulses on someone else's server, deploy your own in fifteen minutes; it is the same code either way.

```
you tap 小红书
   │
   ▼
iOS "When <app> is Opened" automation fires
   │
   ▼
Shortcut: GET /gate?app=xhs&k=<token>&fmt=text
   │
   ├── body is "pass"            → Shortcut ends, the app opens normally
   │                               (not watching this app / inside a grace window
   │                                / the server is down — see "fails open" below)
   │
   └── body is "https://…/b?s=…" → Shortcut opens that URL
                                     │
                                     ▼
                         Safari: the breathing page, counting down
                            no buttons at all during the wait
                                     │
                          ┌──────────┴──────────┐
                          ▼                     ▼
                    「算了」 (drop it)      「继续」 (go in)
                    shown first, loud     shown 800ms later, quiet
                          │                     │
                    logged, you exit      logged, grace window opens,
                    the page yourself     jump back to the app
                                                │
                                                ▼
                                   the automation fires AGAIN on arrival
                                   → inside the grace window → "pass"
                                   → recorded as machine noise, never
                                     as an impulse
```

That last box is the whole reason this project is more than fifty lines of code. Handing control back to the app re-triggers the same automation, and a naive implementation loops forever. See [Why the grace window lives on the server](#why-the-grace-window-lives-on-the-server).

## Why a web page and not an app

Sideloading your own app onto an iPhone with a free Apple ID gets you seven days before the signature expires. Then you plug into a Mac and re-sign it. Every week. Forever.

The way out is an Apple Developer account at $99/year — which, for a tool whose entire job is a ten-second delay, very likely costs more than the paid app you were trying to avoid buying.

So: no app. iOS Shortcuts already has an "app was opened" trigger, Safari can already open a page, and a page can already hand control back to an app through its URL scheme. Zero signing cost, nothing to renew, no Xcode.

The price is that the animation is not as smooth as native, and a Safari cold start is perceptible. For a screen that exists to slow you down, that is an acceptable trade — arguably a feature.

## What it is

One Cloudflare Worker and one D1 database. The whole app is a single `fetch` handler plus a nightly cron.

- Every page is server-rendered, with CSS and JavaScript inlined. **Zero external requests** — no CDN, no web font, not even a favicon fetch. This is enforced by a `default-src 'none'` CSP, not just intended: the moment these pages open is the moment someone is reaching for a distraction on a bad connection, and one blocking round trip would end the product. The single exception is the optional Turnstile widget on `/register`, which is a sign-up page rather than an interception page — see step 6.
- No client framework, no runtime dependencies. The `package.json` has five devDependencies and nothing else.
- The interception log is never deleted. Sessions, logins and rate-limit windows are trimmed nightly; `events` is the product and stays forever.
- Accounts are email + password, and the password is only ever a convenience. The real credential is a 128-bit random **gate token** that the Shortcut carries.

### Pages

| Route | Who | What |
| --- | --- | --- |
| `/` | anyone | landing page, links to register / sign in |
| `/gate?app=&k=` | gate token | the decision endpoint the Shortcut calls; answers `pass` or a URL |
| `/b?s=<sid>` | sid | the breathing page |
| `POST /resolve` | sid | records proceed / abandon, opens the grace window |
| `/register` `/login` `/claim` `/recover` | anyone | sign up, sign in, bind an old token, reset a password with a token |
| `/review` | you | today, the last seven days, which app costs you most |
| `/settings` | you | which apps to intercept, and how long |
| `GET /api/candidates` | you | JSON: type an app name, get candidate URL schemes with sources. Fetched by the URL scheme field on `/settings`; not a page |
| `/lookup` `/probe` | — | kept as 302s to `/settings`. Both were pages once; finding and testing a scheme is now part of the field that needs it, so old links and bookmarks still land somewhere useful |
| `/setup` | you | the Shortcut walkthrough, with your own host and token filled in |
| `/account` | you | read your gate token back, change your password, sign out |
| `/mock?v=1\|2` | anyone | the two candidate visual skins, side by side |
| `/admin` | owner | mint a token for someone offline; see per-user attempt counts |

Anything else is a 404. There is no detail endpoint under `/admin` to guess at — see [SECURITY.md](SECURITY.md).

## Why it deploys twice

One codebase, two Cloudflare deployments, sharing one D1 database:

| Deployment | Config | Job |
| --- | --- | --- |
| **Pages** | `pages/wrangler.toml` | the hostname people actually open |
| **Worker** | `wrangler.toml` | the nightly cleanup cron |

This is worth reading even if you are nowhere near China, because it is a real and reusable piece of operational knowledge about Cloudflare's shared hostnames.

**`*.workers.dev` is DNS-poisoned inside mainland China.** Measured, not assumed: a `*.workers.dev` hostname resolves to three mutually different addresses from the three big domestic public resolvers (223.5.5.5, 119.29.29.29, 114.114.114.114), none of them matching what the rest of the world sees. That is the signature of domain-level interference, not of Cloudflare being blocked — `cloudflare.com` and `*.pages.dev` resolve byte-for-byte identically inside and outside. The shared `workers.dev` suffix is being singled out.

`*.pages.dev` is currently clean, so Pages gets the human-facing hostname. Same edge, same runtime, same code, same database; only the hostname differs. `pages/functions/[[path]].ts` is one line that forwards every request into the same Worker `fetch` handler.

**The Worker deployment stays because Pages has no Cron Triggers.** The nightly cleanup is fired by Cloudflare itself, so it does not care that its own hostname is unreachable from China.

Two things to know before copying this pattern:

- Cloudflare's own tooling recommends Workers over Pages for new projects. Deploying to Pages here is going *against* that advice, purely to get a usable hostname.
- **If you have your own domain, do that instead.** Attach it to the Worker as a Custom Domain and both problems disappear at once — you get a clean hostname *and* Cron Triggers, and the entire `pages/` directory can be deleted. `pages.dev` is a shared suffix too; clean today is not a guarantee.

Also worth knowing: `wrangler pages deploy` does not accept a `-c` config path, which is why the Pages config has to live in its own directory rather than sharing the Worker's `wrangler.toml`.

## Deploy your own (~15 min)

Prerequisites: a Cloudflare account and Node 18+.

### 1. Install and sign in

```bash
cd yixi
npm install
npx wrangler login
```

### 2. Create the D1 database

```bash
npx wrangler d1 create yixi
```

Put the returned `database_id` into **both** `wrangler.toml` and `pages/wrangler.toml`. Both files must point at the same database — that is what makes the two deployments one app. (The `database_name` must stay `yixi`, or change it in both files and in `package.json`'s scripts.)

### 3. Generate the secrets — and keep a copy

```bash
openssl rand -base64 48    # this is your TOKEN_KEY
openssl rand -base64 48    # this is your COOKIE_SECRET
```

Do not pipe these straight into `wrangler secret put`. You need to type the *same* `TOKEN_KEY` into two deployments, and there is no way to read a Cloudflare secret back out.

> ### ⚠️ Lose `TOKEN_KEY` and nobody can ever read their gate token again.
>
> `TOKEN_KEY` is the AES-GCM key that the gate tokens are sealed under so a signed-in person can look their own token up. It is never written to D1 — a stolen database on its own opens nothing.
>
> Interception keeps working without it: `/gate` verifies against a SHA-256 hash and never touches the ciphertext. What breaks is recovery. Anyone who forgot their token can no longer read it back, which also means they can no longer set up a new phone, and `/recover` (reset a password using the token) becomes unusable for them. There is no reset path and no way to re-derive it. **Save it in a password manager before you continue.**

Then set them on the Worker:

```bash
npx wrangler secret put TOKEN_KEY        # paste the first value
npx wrangler secret put COOKIE_SECRET    # paste the second value
```

`COOKIE_SECRET` is legacy. Browser sessions used to be a signed cookie; they are now rows in `sessions_web` and the cookie carries only an opaque id, so nothing signs anything any more. No code reads it. It is documented here because existing deployments still have it set and because dropping a secret is a nuisance — a fresh deployment can leave it out.

### 4. Apply the schema and deploy the Worker

```bash
npm run deploy    # applies migrations against the remote D1, then deploys
```

Migrations only need to run once; the Pages deployment shares the same database.

### 5. Deploy Pages

```bash
cd pages
npx wrangler pages project create yixi --production-branch main

# TOKEN_KEY must be byte-for-byte the SAME value as the Worker's, or Pages
# cannot open tokens that were sealed on the Worker side (and vice versa).
npx wrangler pages secret put TOKEN_KEY --project-name yixi
npx wrangler pages secret put COOKIE_SECRET --project-name yixi

npx wrangler pages deploy --branch main --project-name yixi
```

You get a `https://<project>.pages.dev`. Note that `*.pages.dev` subdomains are globally unique — if the name is taken, Cloudflare appends a suffix, and that suffixed hostname is the one to use everywhere below.

### 6. Turn on the bot check (optional, and skipping it is supported)

Registration is open to anyone who finds the URL, and since this repository is public, the URL is too. The per-IP throttle in `src/ratelimit.ts` holds one address to 5 sign-ups an hour; it does nothing about a script spread over a few hundred addresses. [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) closes that gap, on `/register` and nowhere else.

1. Cloudflare dashboard → **Turnstile** → **Add widget**. Widget mode **Managed**.
2. Under hostnames, add **both** deployments — `<project>.pages.dev` *and* `<worker>.<subdomain>.workers.dev` — because both of them serve `/register`. Add `localhost` too if you want the challenge to appear in `npm run dev`.
3. Copy the two values it hands you: a **site key** (public — it is rendered into the page) and a **secret key** (never leaves the server).
4. Set both on both deployments:

```bash
# Worker
npx wrangler secret put TURNSTILE_SITE_KEY   # paste the site key
npx wrangler secret put TURNSTILE_SECRET     # paste the secret key

# Pages — the same two values
cd pages
npx wrangler pages secret put TURNSTILE_SITE_KEY --project-name yixi
npx wrangler pages secret put TURNSTILE_SECRET --project-name yixi
```

`TURNSTILE_SITE_KEY` is public, so it could equally be a `[vars]` entry in `wrangler.toml`. It is a secret here only so the two values travel together and cannot get half-deployed.

**Leaving this out is a supported configuration, not a broken one.** With either value missing, no widget renders, nothing is verified, and `/register` behaves exactly as it did before this existed — which is what lets `npm run dev` and a first deploy work with no Cloudflare widget at all. The price is worth saying out loud: no keys means no bot protection beyond the per-IP throttle. Same fail-open judgment as everywhere else in this product — see [SECURITY.md](SECURITY.md).

Two more things worth knowing:

- **This is the only place the "zero external requests" rule is broken.** The widget script loads from `challenges.cloudflare.com`, which is the single origin the CSP allows — on `/register`, and only while the keys are set. Every other page keeps `default-src 'none'` with no exceptions. See the comment above `TURNSTILE_ORIGIN` in `src/ui/layout.ts`.
- **The challenge needs JavaScript.** With a widget configured, a browser with JavaScript off cannot sign up. The form says so.

### 7. Register, then make yourself owner

Open `https://<your-host>/register` and sign up with an email and a password. That is all a normal user ever needs; registration is open (behind the Turnstile challenge, if you set one up in step 6).

Owner is a separate thing, and there is deliberately no UI to grant it. If you want `/admin` (minting tokens for people offline), flip the flag directly:

```bash
npx wrangler d1 execute yixi --remote --command \
  "UPDATE users SET is_owner = 1 WHERE email = 'you@example.com';"
```

`/admin` is entirely optional. Since registration is open, its only remaining job is handing a token to someone who would rather not create an account.

### 8. Set up your first app

1. `/settings` — add an app. The **app key** (e.g. `xhs`) is the string you will retype inside the iOS automation, and it must match exactly. Lowercase letters, digits, `-` and `_` only.
2. In the same form, the **URL scheme** field carries everything you need for it: a worked example above the box, a **试跳** button beside it, and a folded 「不知道填什么？按 App 名字找」 that lists candidates inline, each labelled with where it came from. **None of them is verified.**
3. Do this on the iPhone. Tap **试跳** on a candidate — only the one that actually opens the app counts. Then 「用这个」 writes it into the box and you save. Your half-filled form survives the jump.
4. `/setup` — the Shortcut walkthrough, with your real host and token already pasted into the lines you need.

## Wiring up the iOS Shortcut

**Do the real setup from `/setup` in the app, not from a document.** That page knows your hostname, your token and your configured apps, so it prints finished strings you can long-press and copy. Any document can only print `<your-host>` and `<your-token>` and hope you substitute correctly — and mis-substitution is the single most common way this setup fails. What follows is the shape, so you know what you are aiming at.

### One shortcut, three actions, zero variables to pick

<p align="center">
  <img src="docs/images/shortcut.png" width="330" alt="The finished shortcut in the iOS Shortcuts editor: Get Contents of URL with the gate URL, If Contents of URL contains https, and Open URL nested inside it, then End If">
</p>

<p align="center"><sub>The same thing on a real phone. The token is masked; yours is already filled in on <code>/setup</code>. Note that <b>Open URL sits inside the If</b> — that nesting is the one part a written list conveys badly, and getting it wrong makes the shortcut jump on every launch, including the ones the gate just told it to leave alone.</sub></p>


**① Get Contents of URL.** Paste the whole line into the URL field:

```
https://<your-host>/gate?app=xhs&k=<your-token>&fmt=text
```

Expand "Show More" and confirm the method is `GET`. Leave headers and body empty.

**② If** — `Contents of URL` **contains** `https`

**③ Open URL** — `Contents of URL`, dragged *inside* the If.

```
Get Contents of URL   (the pasted line)        GET
If   「Contents of URL」   contains   https
    Open URL   「Contents of URL」
End If
```

**Why not just one Open URL?** Because `/gate` answers with *text*, not a redirect: the breathing page's URL when it should intercept, the literal word `pass` when it should not. Point Open URL straight at the gate and Safari opens the gate itself — a page containing one line of text, which you would then have to tap, and which appears on *every* launch including the ones meant to leave you alone. Fetching first is what lets "don't intercept" be *nothing at all*, and a single Open URL always opens something. It is also why this fails open: a dead server, a timeout or an error page all fail to contain `https`, the If is false, the shortcut ends silently and the app you wanted starts normally.

Both the If and the Open URL auto-fill their left side with the previous result. You never open the variable picker. Name it something like `一息 小红书` and save.

This is what `&fmt=text` is for. In JSON mode the same logic needs a Get Dictionary Value, an If comparing a dictionary value, and a second Get Dictionary Value — six actions and three magic variables, and the If editor does not reliably offer a dictionary value as something to compare against. Real users got stuck there. Moving the parsing to the server turned six actions into three.

### Then one automation per app

Shortcuts app → **Automation** → **+**:

1. Trigger: **App**, then tick **the one app** you want intercepted.
2. Choose **Is Opened** (not Is Closed).
3. When asked what to run, pick the shortcut you just made. Do not add actions, do not pass input.
4. **Turn off "Ask Before Running."**
5. Turn off "Notify When Run" too, or every app launch throws a banner.

To add a second app: long-press the shortcut → Duplicate, change the one word after `app=` in the URL, rename it, and make a second automation. `/setup` prints the finished line for every app you have configured.

### Why the condition is "contains `https`" — and why you must not invert it

This one line does two jobs: it opens the breathing page when it should, and **it fails open on absolutely everything else.**

`/gate` has plenty of ways to not answer properly: the token was rotated, the Worker is down, the network timed out, the response was blank, DNS was poisoned. **Not one of those replies contains `https`.** So the If is false, the Shortcut does nothing, and the app you actually wanted opens normally. Worst case: it did not stop you today.

Write it the other way round — *"if it does not contain `pass`, open it"* — and the day the service goes down, every one of your watched apps starts jumping to a page that will not load. You are locked out of your own phone by your own tool, and almost certainly at a moment when you needed it.

These two failure modes are not remotely symmetrical: one missed interception versus several apps bricked. So the default has to be *when in doubt, let them through.*

Two corollaries:

- **Do not add error handling to Get Contents of URL.** When the network fails, iOS aborts the whole shortcut — which means Open URL never runs and the app opens normally. That is exactly what you want.
- **Do not add an Otherwise branch that opens anything.** "Otherwise" means "the server did not say to stop you," and the correct response to that is nothing at all.

## Why the grace window lives on the server

Tapping 「继续」 hands control to the app's URL scheme — which trips the same "when this app is opened" automation all over again. Native One Sec dodges this from inside its own process, jumping away with no user gesture. Safari cannot: it only follows a custom scheme from inside the synchronous call stack of a real tap.

So the state has to live outside the page. `/resolve` writes a **grace** row (`user_id`, `app`, `until`), and the next `/gate` call inside that window answers `pass`. The user taps nothing extra and the loop terminates.

The second half matters just as much. That re-fire is machine noise, not an impulse, so it is recorded as a **`grace_pass`** event and never as an `attempt`. Every ratio on `/review` uses `attempt` as its sole denominator. Count the noise and every 「继续」 quietly manufactures a fake impulse for you, and the abandon rate becomes meaningless.

The default window is **90 seconds**, adjustable per app (floor 30, ceiling 3600). Long enough to cover the hand-off, the app's cold start and a mistap; short enough that picking the phone back up two minutes later gets you stopped again — which is the point.

## Known limits

Read these before deploying. Some of them cannot be fixed in code.

- **One iOS automation per app.** "When app is opened" takes exactly one app; there is no bulk mode and no multi-select. Five apps means five automations, built by hand. One Sec and every tool like it has the same constraint. This cannot be worked around from the server.
- **The three iOS risks are settled.** Measured on a real device on 2026-08-31: the "when app is opened" automation runs with no confirmation prompt once 「运行前询问」 is off, the network round-trip per launch is unobtrusive, and tapping 继续 does hand control back to the target app. `xhsdiscover://` and `QDReader://` are the two schemes this project has actually observed working; everything else in the table is transcribed, not tested.
- **Some apps have removed their URL scheme entirely.** No candidate will jump for them, no matter which one you try. Your options are to stop intercepting that app, or to accept tapping its icon a second time after 「继续」 (the second tap lands inside the grace window, so it is not intercepted again).
- **An in-app browser cannot test a scheme.** 「试跳」 opens a custom URL scheme, which apps' embedded browsers refuse — WeChat silently, which is the worst kind. Do the setup in Safari (or Chrome), not in a page opened from a chat. `/settings` and `/setup` detect the common ones and say so before you tap; the list cannot be exhaustive, so if 试跳 does nothing at all for every candidate, check which browser you are in first. **The interception itself is unaffected** — the Shortcut opens the system default browser, so the breathing page never runs inside a chat app.
- **One network round trip on every app open.** No client cache, no offline fallback. On a weak signal it is perceptible. If it ever becomes intolerable, that is a signal to change the architecture, not the configuration.
- **The App Store fallback does not work from the Cloudflare edge.** When an app is not in the bundled table, `/api/candidates` tries `itunes.apple.com` to confirm the app exists and get its bundle id. Apple answers Cloudflare's egress addresses with HTTP 429, so this fails in production while working fine from a laptop. Known, not yet fixed. The picker reports "could not check" — never "no such app" — and refuses to invent a scheme, so nothing is silently wrong; the main path is unaffected.
- **From mainland China, use the Pages hostname.** See [Why it deploys twice](#why-it-deploys-twice). `pages.dev` is a shared suffix and clean today is not clean forever — your own domain is the only durable answer.
- **The UI is in Chinese.** Every page, every button, every error message. i18n PRs welcome.
- **A breathing page left open for hours can still be resolved.** `/resolve` deliberately has no freshness check: refusing a stale resolve means no grace window opens, so jumping back to the app gets you intercepted instantly and you are in the loop. `/b` does refuse to *render* a session older than ten minutes, so this only applies to a page that was already loaded.
- **JavaScript is required** on the breathing page (there is a `<noscript>` telling you to go back to the home screen).
- **JavaScript is also required to register, once Turnstile is configured.** The widget cannot produce a token without it, and a missing token is refused — the form says so in a `<noscript>` line. Not configuring Turnstile leaves `/register` working without JavaScript, as before.
- **The two visual skins are still unresolved.** `/mock?v=1` is 「墨」 (ink washes on near-black, serif) and `?v=2` is 「息」 (a hairline ring and one dot). `DEFAULT_THEME` in `src/ui/layout.ts` is `ink`. Flip that one constant to change the product's face.
- **This is a nudge, not a blocker.** Anyone can disable the automation in two taps. That is by design — see the fail-open discussion above — and it means the tool only works for someone who wants it to.

## Stack

| | |
| --- | --- |
| Runtime | Cloudflare Workers (also deployed as a Pages Function) |
| Storage | Cloudflare D1 (SQLite) |
| Language | TypeScript, strict, no runtime dependencies |
| Rendering | server-side HTML, inline CSS/JS, zero external requests (CSP-enforced) — one exception: the Turnstile widget on `/register`, only when configured |
| Crypto | WebCrypto only — PBKDF2-SHA256 passwords, AES-GCM token sealing |
| Client | iOS Shortcuts + Safari |
| Tests | 350 tests over 16 files (Vitest + `@cloudflare/vitest-pool-workers`) |
| Cost | fits inside Cloudflare's free tier |

## Project layout

```
src/index.ts        route table, three auth shapes, nightly cron
src/gate.ts         /gate and /resolve — the only machine-facing routes
src/auth.ts         ?k= token, cookie session, constant-time compares
src/account.ts      register / login / claim / recover; the closed recovery loop
src/crypto.ts       PBKDF2 passwords, AES-GCM token sealing, random hex
src/db.ts           every D1 statement in the app, and nothing else
src/stats.ts        /review aggregation; the grace_pass exclusion lives here
src/ratelimit.ts    per-IP fixed-window throttle for the open endpoints
src/turnstile.ts    the optional /register challenge, and its fail-open rules
src/scheme.ts       the URL-scheme denylist — one authority, three call sites
src/schemes.ts      frozen snapshot of two public scheme collections (60 apps)
src/types.ts        Env, User, event kinds, the shared constants
src/ui/*.ts         one module per page, all server-rendered
src/api/admin.ts    the owner's ticket window, and the privacy line
migrations/*.sql    D1 schema, three migrations
pages/              Pages entry point (one line) + its own wrangler.toml
shortcut/README.md  why the Shortcut is shaped the way it is
docs/architecture.md  request lifecycle, tables, accounting semantics
```

## Development

```bash
npm test               # vitest run — the full suite
npm run typecheck      # tsc --noEmit (src) + tsc -p test --noEmit
npm run dev            # wrangler dev — local server
npm run migrate:local  # apply migrations to the local D1
npm run deploy         # remote migrations, then deploy the Worker
```

Before changing anything, read [CONTRIBUTING.md](CONTRIBUTING.md). It is short, and every rule in it comes from something that actually broke.

## Docs

- [SECURITY.md](SECURITY.md) — threat model, the token-storage trade-off, self-hosting caveats
- [CONTRIBUTING.md](CONTRIBUTING.md) — the five constraints that must not be refactored away
- [docs/architecture.md](docs/architecture.md) — request lifecycle, D1 tables, accounting semantics
- [shortcut/README.md](shortcut/README.md) — the reasoning behind the Shortcut's shape (Chinese)

The author runs an open instance at **<https://yixi-app.pages.dev>**. Sign up there and you can be breathing before your apps in about ten minutes, with nothing to deploy.

**What the operator can and cannot see.** Your records are yours: the admin page returns a per-account count of how many times you were stopped, and nothing else — no timestamps, no app names, no give-up rate, not even your email address. That is enforced in the SQL rather than in the template, and a test fails if it ever regresses. But be clear-eyed about the shape of the guarantee: whoever runs an instance holds its database, and a database can be queried directly. That is true of this instance and of every other self-hosted service you sign up for.

So: use the shared one if you want to try it without work, and run your own if you would rather that sentence not apply to you. Deploying takes about fifteen minutes and the instructions are below.

## License

[MIT](LICENSE)
