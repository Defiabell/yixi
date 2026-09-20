// The pages rendered in English, end to end — the half of the i18n guard that
// test/i18n.test.ts cannot express. The 今日 face first, then the three pages
// somebody meets before they have an account or a nav: the breathing page,
// the landing page and /mock.
//
// i18n.test.ts checks the *dictionary*: every t()/msg() source has an EN key,
// the placeholder sets match, no Chinese leaks into a translation. All of
// that stays green even if a page forgets to build a translator at all and
// renders its Chinese verbatim. So this file renders the real handlers in
// English — by `Accept-Language: en`, or, on /b, by the account's own
// `locale`, which is all an iOS Shortcut carries — and asserts on the HTML
// that comes back: `<html lang="en">`, no Chinese punctuation left in the
// page's <main>, and the particular sentences the design names.
//
// The last describe is the other direction and matters just as much: the same
// requests with no language header at all must still be Chinese, byte for
// byte what they were before any of this existed.

import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderBreathe } from '../src/ui/breathe'
import { renderLanding } from '../src/ui/landing'
import { renderMock } from '../src/ui/mock'
import { handleToday } from '../src/ui/today'
import { handleGoals } from '../src/ui/goals'
import { renderProgress } from '../src/ui/progress'
import { renderTodaySetup } from '../src/ui/todaysetup'
import { handleAccount, handleClaim, handleLogin, handleRecover, handleRegister } from '../src/ui/account'
import { handleSettings } from '../src/ui/settings'
import { renderReview } from '../src/ui/review'
import { fillBody, renderSetup } from '../src/ui/setup'
import { handleSurf } from '../src/ui/surf'
import { renderSurfReview } from '../src/ui/surfreview'
import { handleSurfSetup } from '../src/ui/surfsetup'
import { createUrge, finishUrge } from '../src/urges'
import { createGoal, createTask, shanghaiDate, toggleCheckin, updateTaskTarget, upsertUserApp } from '../src/db'
import { register } from '../src/account'
import type { User } from '../src/types'
import { translator } from '../src/i18n'

const BASE = 'https://yixi.test'
const NOW = Date.now()
const TODAY = shanghaiDate(NOW)

/** What a browser set to English actually sends. */
const EN = { 'accept-language': 'en-US,en;q=0.9' }
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh) Safari/605'
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'

const user: User = { id: 1, name: 'Alex', is_owner: 0, created_at: 0 }

/** Chinese punctuation — what a half-translated page leaves behind. */
const CHINESE_PUNCT = /[「」，。！？；：（）]/

async function reset(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM goal_days'),
    env.DB.prepare('DELETE FROM goal_task_checkins'),
    env.DB.prepare('DELETE FROM goal_checkins'),
    env.DB.prepare('DELETE FROM goal_tasks'),
    env.DB.prepare('DELETE FROM goals'),
    env.DB.prepare('DELETE FROM user_apps'),
    env.DB.prepare('DELETE FROM urges'),
    env.DB.prepare('DELETE FROM users'),
  ])
  await env.DB.prepare(
    "INSERT INTO users (id, name, token_hash, is_owner, created_at) VALUES (1, 'Alex', 'h1', 0, 0)",
  ).run()
}
beforeEach(reset)

// --- the four handlers, with and without the header ---------------------------

function headers(en: boolean, ua = MAC_SAFARI): Record<string, string> {
  return en ? { 'user-agent': ua, ...EN } : { 'user-agent': ua }
}

async function todayHtml(en = true, ua = MAC_SAFARI): Promise<string> {
  return await (await handleToday(new Request(`${BASE}/today`, { headers: headers(en, ua) }), env, user)).text()
}
async function goalsHtml(en = true): Promise<string> {
  return await (await handleGoals(new Request(`${BASE}/today/goals`, { headers: headers(en) }), env, user)).text()
}
async function progressHtml(en = true): Promise<string> {
  return await (await renderProgress(new Request(`${BASE}/today/review`, { headers: headers(en) }), env, user)).text()
}
async function setupHtml(en = true): Promise<string> {
  return await (await renderTodaySetup(new Request(`${BASE}/today/setup`, { headers: headers(en) }), env, user)).text()
}

function mainOf(html: string): string {
  const m = html.match(/<main>([\s\S]*?)<\/main>/)
  expect(m, 'no <main> found').toBeTruthy()
  return m![1]!
}

function seed(
  title: string,
  extra: Partial<{ target: string; label: string; cue: string }> = {},
): Promise<number> {
  return createGoal(env.DB, {
    userId: 1,
    title,
    cue: extra.cue ?? '',
    target: extra.target ?? '',
    targetLabel: extra.label ?? '',
    until: null,
    now: NOW,
  })
}

// ============================================================================
// /today
// ============================================================================

describe('/today in English', () => {
  it('declares the language and asks for one thing, in English', async () => {
    const html = await todayHtml()
    expect(html).toContain('<html lang="en">')
    const main = mainOf(html)
    expect(main).toContain('Write down the one thing that matters most.')
    expect(main).not.toMatch(CHINESE_PUNCT)
  })

  it('translates the day line and its two links', async () => {
    const main = mainOf(await todayHtml())
    expect(main).toContain('<a class="linky" href="/today/review">Review</a>')
    expect(main).toContain('<a class="linky" href="/today/goals">Edit goals</a>')
    // 「9 月 13 日 · 周日」 becomes 「Sep 13 · Sunday」 — no Chinese date parts.
    expect(main).not.toMatch(/月|日 ·|周/)
  })

  it('says Open {label} on a jump button, whether the label is Latin or not', async () => {
    await seed('健身', { target: 'bilibili://video/BV1', label: 'B 站' })
    await seed('阅读', { target: 'https://weread.qq.com/', label: '微信读书' })
    const main = mainOf(await todayHtml())
    expect(main).toMatch(/<button class="go" type="button" data-go [^>]*>[\s\S]*?Open B 站/)
    expect(main).toMatch(/<a class="go" href="https:\/\/weread\.qq\.com\/"[^>]*>[\s\S]*?Open 微信读书/)
    expect(main).not.toMatch(CHINESE_PUNCT)
  })

  it('says Go with no label, and offers to link an app with no target', async () => {
    await seed('写作', { target: 'bilibili://x' })
    await seed('散步')
    const main = mainOf(await todayHtml())
    expect(main).toMatch(/data-go[^>]*>[\s\S]*?Go</)
    expect(main).toContain('Link an app, and it opens with one tap')
  })

  it('speaks a sub-task row and its check button in English', async () => {
    const g = await seed('健身')
    for (const title of ['warm up', 'run', 'stretch']) {
      await createTask(env.DB, { userId: 1, goalId: g, title, now: NOW })
    }
    const main = mainOf(await todayHtml())
    expect(main).toContain('aria-label="warm up, check off for today"')
    expect(main).toContain('<span class="tkt">stretch</span>')
    expect(main).not.toContain('<span class="nl">')
    // Nothing on this card can jump, so the offer to bind one stays.
    expect(main).toContain('Link an app, and it opens with one tap')
    expect(main).not.toMatch(CHINESE_PUNCT)
  })

  it('says Open {label} on a sub-task chip, inheriting the goal’s app when the row has none', async () => {
    const g = await seed('健身', { target: 'bilibili://video/BV1', label: 'B 站' })
    const t1 = (await createTask(env.DB, { userId: 1, goalId: g, title: 'warm up', now: NOW }))!
    await createTask(env.DB, { userId: 1, goalId: g, title: 'stretch', now: NOW })
    await updateTaskTarget(env.DB, 1, t1, 'https://weread.qq.com/', '微信读书')
    const main = mainOf(await todayHtml())
    expect(main).toMatch(/<a class="chip" href="https:\/\/weread\.qq\.com\/"[^>]*>[\s\S]*?Open 微信读书/)
    expect(main).toMatch(/<button class="chip" type="button" data-go data-target="bilibili:\/\/video\/BV1">[\s\S]*?Open B 站/)
    expect(main).not.toMatch(/class="go"/)
    expect(main).not.toMatch(CHINESE_PUNCT)
  })

  it('translates both closing lines once everything is checked', async () => {
    const g = await seed('健身')
    await toggleCheckin(env.DB, 1, g, TODAY, NOW)
    const main = mainOf(await todayHtml())
    expect(main).toContain('That is everything for today.')
    expect(main).toContain('The rest can wait until tomorrow.')
    expect(main).not.toMatch(/[!！]/)
  })

  it('translates the add-to-home-screen banner for iPhone Safari', async () => {
    const main = mainOf(await todayHtml(true, IPHONE_SAFARI))
    expect(main).toContain('<b>Add to Home Screen</b>, and it opens with one tap.')
    expect(main).toContain('Got it')
    expect(main).not.toMatch(CHINESE_PUNCT)
  })
})

// ============================================================================
// /today/goals, /today/review, /today/setup
// ============================================================================

describe('/today/goals in English', () => {
  it('translates the page, the add form and the field labels', async () => {
    const html = await goalsHtml()
    expect(html).toContain('<html lang="en">')

    // The scheme field's own three strings are passed *into* schemefield.ts
    // from here (label, placeholder, hint); the rest of that component now
    // renders in English too, so the whole <main> faces the sweep below.
    const main = mainOf(html)
    expect(main).toContain('Where the button jumps · optional')
    expect(main).toContain('placeholder="instagram:// or https://…"')
    expect(main).toContain('Link <b>the exact lesson, the exact book</b>')

    expect(main).toContain('<h1>Goals</h1>')
    expect(main).toContain('The top 3 show up on <a href="/today">Today</a>.')
    expect(main).toContain('Add a goal')
    expect(main).toContain('What the button calls it')
    expect(main).not.toMatch(CHINESE_PUNCT)
  })

  it('translates a goal row, its sub-task box and the per-row app field', async () => {
    const g = await seed('健身', { label: 'B 站' })
    await createTask(env.DB, { userId: 1, goalId: g, title: 'warm up', now: NOW })
    const main = mainOf(await goalsHtml())
    expect(main).toContain('Ongoing')
    expect(main).toContain('Sub-tasks · every day')
    expect(main).toContain('Today 0/1')
    expect(main).toContain('Where it jumps')
    expect(main).toContain('Where this sub-task jumps · optional')
    expect(main).toContain('Leave it empty and it follows the goal.')
    expect(main).not.toMatch(CHINESE_PUNCT)
  })

  it('translates the card-count setting, its picker and the sentence that refuses a bad one', async () => {
    const main = mainOf(await goalsHtml())
    expect(main).toContain('How many goals on Today')
    expect(main).toContain('<option value="3" selected>3</option>')
    expect(main).not.toMatch(CHINESE_PUNCT)

    const res = await handleGoals(
      new Request(`${BASE}/today/goals`, { method: 'POST', headers: headers(true), body: new URLSearchParams({ op: 'limit', n: '0' }) }),
      env,
      user,
    )
    expect(res.status).toBe(400)
    const bad = mainOf(await res.text())
    expect(bad).toContain('It has to be a number between 1 and 9.')
    expect(bad).not.toMatch(CHINESE_PUNCT)
  })
})

describe('/today/review in English', () => {
  it('translates the empty state', async () => {
    const html = await progressHtml()
    expect(html).toContain('<html lang="en">')
    const main = mainOf(html)
    expect(main).toContain('Nothing to look back on yet.')
    expect(main).toContain('<a href="/today">Today</a>')
    expect(main).not.toMatch(CHINESE_PUNCT)
  })

  it('translates every section, the counts and the footnote', async () => {
    // Created nine days ago so the per-goal rate reads 「10 days」 rather than
    // the degenerate 「1 days」 a goal made today would produce.
    const g = await createGoal(env.DB, {
      userId: 1, title: '健身', cue: '', target: '', targetLabel: '', until: null,
      now: NOW - 9 * 86_400_000,
    })
    await toggleCheckin(env.DB, 1, g, TODAY, NOW)
    const main = mainOf(await progressHtml())
    expect(main).toContain('<h2>Today</h2>')
    expect(main).toContain('<h2>The last 30 days</h2>')
    expect(main).toContain('<h2>Each goal</h2>')
    expect(main).toContain('<h2>This week</h2>')
    // Both of these are counts, and English agreement breaks at 1 — 「1 days」,
    // 「1 have a record」. The wording has to read as a stat line, not as a
    // sentence that has to agree with the number in it.
    expect(main).toContain('10-day span · 1 checked')
    expect(main).toContain('Of 30 days: 1 with a record, 1 done in full.')
    expect(main).toContain('Breathe keeps its own record under <a href="/review">Log</a>.')
    expect(main).not.toMatch(CHINESE_PUNCT)
    expect(main).not.toMatch(/[!！]/)
  })
})

describe('/today/setup in English', () => {
  it('translates the three ways in', async () => {
    const html = await setupHtml()
    expect(html).toContain('<html lang="en">')
    const main = mainOf(html)
    expect(main).toContain('<h1>Guide</h1>')
    expect(main).toContain('Add to Home Screen')
    expect(main).toContain('Shortcuts')
    expect(main).toContain(`${BASE}/today`)
    expect(main).not.toMatch(CHINESE_PUNCT)
    expect(main).not.toMatch(/[!！]/)
  })

  it('translates the copy line — its label and the button beside it', async () => {
    const main = mainOf(await setupHtml())
    expect(main).toContain('Today page address')
    expect(main).toContain('aria-label="Copy Today page address">Copy</button>')
    expect(main).toContain(`<a href="${BASE}/today">${BASE}/today</a>`)
    expect(main).not.toMatch(CHINESE_PUNCT)
  })
})

// ============================================================================
// The account pages, /settings and /review
// ============================================================================

/** The signed-out shell every account page before a session renders into. */
function gateOf(html: string): string {
  return inside(html, '<main class="gate">')
}

function req(path: string, en = true): Request {
  return new Request(`${BASE}${path}`, en ? { headers: EN } : undefined)
}

function form(path: string, fields: Record<string, string>, en = true): Request {
  return new Request(`${BASE}${path}`, {
    method: 'POST',
    ...(en ? { headers: EN } : {}),
    body: new URLSearchParams(fields),
  })
}

describe('/register in English', () => {
  it('states the closed loop, dead end included, in English', async () => {
    const html = await (await handleRegister(req('/register'), env)).text()

    expect(html).toContain('<html lang="en">')
    expect(html).toContain('<title>Sign up · 一息</title>')
    const gate = gateOf(html)
    expect(gate).toContain('<h1>Sign up</h1>')
    expect(gate).toContain('no mail service')
    // The three branches the Chinese page spells out, all still here.
    expect(gate).toContain('Forgot the password')
    expect(gate).toContain('Forgot the token')
    expect(gate).toContain('Lost both')
    expect(gate).toContain('<a href="/recover">the reset page</a>')
    expect(gate).not.toMatch(CHINESE_PUNCT)
    expect(gate).not.toMatch(/[!！]/)
  })

  it('translates a message src/account.ts produced, limits filled in', async () => {
    const res = await handleRegister(
      form('/register', { email: 'who@example.com', password: 'short', password2: 'short' }),
      env,
    )
    expect(res.status).toBe(400)
    const html = await res.text()
    expect(html).toContain('<html lang="en">')
    expect(html).toContain('A password is 8 characters at least and 200 at most.')
    expect(gateOf(html)).not.toMatch(CHINESE_PUNCT)
  })
})

describe('/login in English', () => {
  it('translates the page and the two ways out of it', async () => {
    const html = await (await handleLogin(req('/login'), env)).text()

    expect(html).toContain('<html lang="en">')
    const gate = gateOf(html)
    expect(gate).toContain('<h1>Sign in</h1>')
    expect(gate).toContain('<a href="/recover">Reset it with the token</a>')
    expect(gate).toContain('<a href="/register">Sign up</a>')
    expect(gate).not.toMatch(CHINESE_PUNCT)
  })

  it('says the one thing a failed sign-in is allowed to say, in English', async () => {
    const res = await handleLogin(form('/login', { email: 'nobody@example.com', password: 'x'.repeat(12) }), env)
    expect(res.status).toBe(401)
    const html = await res.text()
    expect(html).toContain('That address or password is wrong.')
    expect(gateOf(html)).not.toMatch(CHINESE_PUNCT)
  })
})

describe('the switcher in the signed-out footer', () => {
  // The two pages a stranger actually lands on. Without this, somebody whose
  // browser is set to Chinese and who wants English has nowhere to say so
  // until after they have an account.
  const pages: Array<[string, (r: Request) => Promise<Response>]> = [
    ['/login', (r) => handleLogin(r, env)],
    ['/register', (r) => handleRegister(r, env)],
  ]

  it('offers the other language and never links the one being read', async () => {
    for (const [path, handler] of pages) {
      const en = await (await handler(req(path))).text()
      expect(en, path).toContain('<p class="lang">English · <a href="?lang=zh">中文</a></p>')

      const zh = await (await handler(req(path, false))).text()
      expect(zh, path).toContain('<p class="lang"><a href="?lang=en">English</a> · 中文</p>')
    }
  })

  it('keeps the rest of the query, so switching language does not lose where you were going', async () => {
    // /login?next=/settings: the footer used to link a bare `?lang=en`, which
    // replaces the whole query — you switched to English and landed on /review.
    const html = await (await handleLogin(req('/login?next=/settings'), env)).text()
    const link = html.match(/<p class="lang">([\s\S]*?)<\/p>/)
    expect(link, 'the switcher is missing from /login').toBeTruthy()
    expect(link![1]).toContain('next=%2Fsettings')
    expect(link![1]).toContain('lang=zh')
    // The form still carries it too — the two must not disagree.
    expect(html).toContain('action="/login?next=%2Fsettings"')
  })

  it('leaves /claim and /recover without one — by then the language is settled', async () => {
    for (const html of [
      await (await handleClaim(req('/claim'), env)).text(),
      await (await handleRecover(req('/recover'), env)).text(),
    ]) {
      expect(html).not.toContain('class="lang"')
    }
  })
})

describe('/account in English', () => {
  function accountHtml(path = '/account', en = true): Promise<string> {
    return handleAccount(req(path, en), env, user).then((r) => r.text())
  }

  it('translates the page, the token card and the way out', async () => {
    const html = await accountHtml()

    expect(html).toContain('<html lang="en">')
    expect(html).toContain('<title>Account · Alex</title>')
    const main = mainOf(html)
    expect(main).toContain('<h1>Account</h1>')
    expect(main).toContain('<h2>Your token</h2>')
    expect(main).toContain('>Show</a>')
    expect(main).toContain('No email address attached yet')
    expect(main).toContain('Sign out')
    expect(main).not.toMatch(CHINESE_PUNCT)
    expect(main).not.toMatch(/[!！]/)
  })

  it('offers both languages and never links the one being read', async () => {
    const en = mainOf(await accountHtml())
    expect(en).toContain('<h2>Language</h2>')
    expect(en).toContain('<a class="linky tap" href="/account?lang=en" aria-current="page">English</a>')
    expect(en).toContain('<a class="linky tap" href="/account?lang=zh">中文</a>')

    const zh = mainOf(await accountHtml('/account', false))
    expect(zh).toContain('<h2>语言</h2>')
    expect(zh).toContain('<a class="linky tap" href="/account?lang=en">English</a>')
    expect(zh).toContain('<a class="linky tap" href="/account?lang=zh" aria-current="page">中文</a>')
  })
})

describe('/settings in English', () => {
  function settingsHtml(en = true): Promise<string> {
    return handleSettings(req('/settings', en), env, user).then((r) => r.text())
  }

  async function seedApp(): Promise<void> {
    await upsertUserApp(env.DB, {
      user_id: 1, app: 'xhs', label: '小红书', scheme: 'xhsdiscover://',
      wait_seconds: 10, grace_seconds: 90, enabled: 1,
    })
  }

  it('translates the empty state, the add form and the scheme field around it', async () => {
    const html = await settingsHtml()

    expect(html).toContain('<html lang="en">')
    expect(html).toContain('<title>Settings · 一息</title>')
    const main = mainOf(html)
    expect(main).toContain('<h1>Which apps to stop</h1>')
    expect(main).toContain('No apps configured yet.')
    expect(main).toContain('Add an app')
    // The shared scheme field, whose copy now comes from this page's translator.
    expect(main).toContain('Test it')
    expect(main).toContain('Search by app name')
    expect(main).toContain('instagram://')
    expect(main).toContain('aria-label="Search candidates by app name"')
    expect(main).not.toMatch(CHINESE_PUNCT)
    expect(main).not.toMatch(/[!！]/)
  })

  it('translates a configured row while leaving the label somebody typed alone', async () => {
    await seedApp()
    const main = mainOf(await settingsHtml())

    expect(main).toContain('Being stopped · 1')
    expect(main).toContain('Wait · seconds')
    expect(main).toContain('Quiet · seconds')
    expect(main).toContain('Save')
    // Their own display name is data, in either language.
    expect(main).toContain('<span class="sname">小红书</span>')
    expect(main).not.toMatch(CHINESE_PUNCT)
  })

  it('translates the in-app browser notice, quoting the app menu it names', async () => {
    // WeChat's embedded browser: the one place the page has to tell somebody
    // to leave. The app's name stays as the app writes it; the instruction is
    // copy and follows the reader.
    const html = await (
      await handleSettings(
        new Request(`${BASE}/settings`, {
          headers: { ...EN, 'user-agent': 'Mozilla/5.0 (iPhone) MicroMessenger/8.0' },
        }),
        env,
        user,
      )
    ).text()
    const main = mainOf(html)
    expect(main).toContain('You are inside the browser built into <b>微信</b>')
    expect(main).toContain('Tap “⋯” in the top-right corner → “Open in browser”')
    expect(main).not.toContain('内置的浏览器')
  })

  it('hands the field script its strings, with the jump still synchronous', async () => {
    const js = scriptOf(await settingsHtml())

    expect(js).toContain('Use this')
    expect(js).toContain('Two lists agree')
    expect(js).not.toMatch(/试跳|用这个|先填/)
    // The one rule translation was never allowed to touch.
    expect(js.match(/location\.href\s*=/g) ?? []).toHaveLength(1)
    expect(js).toContain('function jump(scheme)')
  })
})

describe('/review in English', () => {
  it('words every count so it reads at one as well as at many', async () => {
    // Three of the /review numbers can be 1, and 「1 stops」 / 「held 1 times」
    // is how a page tells the reader it was written for the plural case only.
    const at = (n: number, hold: number): string =>
      translator('en')('共 <b class="num">{n}</b> 次拦下，忍住 <b class="num">{hold}</b> 次，放弃率 <b class="num">{rate}</b>。', {
        n,
        hold,
        rate: '50%',
      })
    for (const line of [at(1, 1), at(12, 6)]) {
      expect(line).not.toMatch(/\b1 (?:stops|times)\b/)
      expect(line).not.toMatch(/[一-鿿]/)
    }
    const t = translator('en')
    expect(t('<b class="num">{n}</b> 次', { n: 1 })).toBe('stops: <b class="num">1</b>')
    expect(t('{date}：拦下 {n} 次，忍住 {hold}，没做选择 {idle}，进去了 {go}', {
      date: '9-13', n: 1, hold: 1, idle: 0, go: 0,
    })).toBe('9-13: stopped 1, held 1, no choice 0, went in 0')
    expect(t('另有 {n} 次是点「继续」跳回 App 时自动化重复触发的，属于机器噪音，未计入以上任何数字。', { n: 1 })).toContain(
      'Plus 1 from the automation firing again',
    )
  })

  it('translates the empty state and the Breathe face nav', async () => {
    const html = await (await renderReview(req('/review'), env, user)).text()

    expect(html).toContain('<html lang="en">')
    expect(html).toContain('<title>Log · Alex</title>')
    const main = mainOf(html)
    expect(main).toContain('<h2>No records yet</h2>')
    expect(main).toContain('You have not been stopped even once.')
    expect(main).toContain('<a href="/settings">Settings</a>')
    expect(main).not.toMatch(CHINESE_PUNCT)

    const nav = html.match(/<nav aria-label="Navigation">([\s\S]*?)<\/nav>/)
    expect(nav, 'nav missing or still labelled in Chinese').toBeTruthy()
    for (const label of ['Log', 'Settings', 'Guide', 'Account']) {
      expect(nav![1]).toContain(`<span class="lb">${label}</span>`)
    }
  })
})

// ============================================================================
// /setup — the Shortcut walkthrough
// ============================================================================

/**
 * The longest page in the product, and the one an English reader could not use
 * at all before batch 2: it is the only way to install the Breathe half.
 *
 * Two fixtures, because the page has two shapes and only one of them carries
 * the tester. `?k=` is a token in the address bar; `?show=1` on an account
 * whose token was sealed unseals it. A row from the ticket-window era has only
 * a hash, so `?show=1` there is the degraded shape — no token, no tester, and
 * a paragraph saying why.
 */
async function setupUserWithApps(): Promise<{ user: User; token: string }> {
  const created = await register(env, { email: 'setup-en@example.com', password: 'correct-horse-1' })
  expect(created.ok, 'register failed').toBe(true)
  if (!created.ok) throw new Error('register failed')
  // Latin labels on purpose: a label somebody typed is data and is never
  // translated, so a Chinese one would defeat the CJK sweep below.
  await upsertUserApp(env.DB, {
    user_id: created.user.id, app: 'instagram', label: 'Instagram', scheme: 'instagram://',
    wait_seconds: 10, grace_seconds: 90, enabled: 1,
  })
  return { user: created.user, token: created.token }
}

async function setupHtmlEn(user: User, query: string): Promise<string> {
  const res = await renderSetup(new Request(`${BASE}/setup${query}`, { headers: EN }), env, user)
  expect(res.status).toBe(200)
  return await res.text()
}

describe('/setup in English', () => {
  it('declares the language and names the iOS actions the way English iOS does', async () => {
    const { user, token } = await setupUserWithApps()
    const html = await setupHtmlEn(user, `?k=${token}`)

    expect(html).toContain('<html lang="en">')
    // The Chinese pair differs by word order alone, and so does the English:
    // /today/setup is 「怎么配 · 一息」 / 'Guide · 一息', this page is the other
    // way round. Two tabs open at once have to be tellable apart in English as
    // much as in Chinese, and no guard can see across two dictionary values.
    expect(html).toContain('<title>一息 · Guide</title>')
    const other = await renderTodaySetup(new Request(`${BASE}/today/setup`, { headers: EN }), env, user)
    expect(await other.text()).toContain('<title>Guide · 一息</title>')

    const main = inside(html, '<main class="wrap doc">')
    expect(main).toContain('<h1>Guide</h1>')
    expect(main).toContain('Shortcuts')
    expect(main).toContain('Get Contents of URL')
    expect(main).toContain('Contents of URL')
    expect(main).toContain('End If')
    expect(main).toContain('Ask Before Running')
    expect(main).toContain('Notify When Run')
    expect(main).toContain('Is Opened')
    expect(main).not.toMatch(CHINESE_PUNCT)
    expect(main).not.toMatch(/[!！]/)
  })

  /**
   * The strongest clause on this page, and the reason it is written as a CJK
   * sweep rather than a punctuation one: a tutorial this long is exactly where
   * one untranslated sentence hides. 一息 is the product's name and stays in
   * both languages; nothing else Chinese may survive into <main>.
   */
  it('leaves no Chinese anywhere in the page except the brand', async () => {
    const { user, token } = await setupUserWithApps()
    const main = inside(await setupHtmlEn(user, `?k=${token}`), '<main class="wrap doc">')
    expect(main.split('一息').join('')).not.toMatch(/[一-鿿]/)
  })

  it('translates the copy lines, and leaves the addresses they copy alone', async () => {
    const { user, token } = await setupUserWithApps()
    const main = inside(await setupHtmlEn(user, `?k=${token}`), '<main class="wrap doc">')

    expect(main).toContain('>Copy</button>')
    expect(main).toContain('aria-label="Copy token"')
    expect(main).toContain('aria-label="Copy test address"')
    // The label is the reader's own data and is never translated.
    expect(main).toContain('aria-label="Copy Instagram"')
    // The gate line is bytes to paste, not copy: unchanged in either language.
    expect(main).toContain(`${BASE}/gate?app=instagram&amp;k=${token}&amp;fmt=text`)
    expect(main).toContain(`${BASE}/gate?app=zzztest&amp;k=${token}`)
  })

  it('hands the tester its sentences in English, through the JSON escape', async () => {
    const { user, token } = await setupUserWithApps()
    const html = await setupHtmlEn(user, `?k=${token}`)

    const js = scriptOf(html)
    expect(js).toContain('data-test')
    expect(html).toContain('Check whether this line gets through')
    expect(js).toContain('"Connecting…"')
    expect(js).toContain('"The server refused it: {body}"')
    expect(js).toContain('Through · this line will stop you')
    // Never a bare interpolation: every sentence arrives as a JSON literal.
    expect(js).not.toMatch(/[一-鿿]/)
  })

  it('unseals the token behind ?show=1, and keeps the tester with it', async () => {
    const { user } = await setupUserWithApps()
    const html = await setupHtmlEn(user, '?show=1')

    expect(html).toContain('data-test=')
    expect(html).toContain('Check whether this line gets through')
    const main = inside(html, '<main class="wrap doc">')
    expect(main).not.toContain('[tap “Show” above first]')
    expect(main.split('一息').join('')).not.toMatch(/[一-鿿]/)
  })

  it('explains an unreadable token in English, and offers no tester for it', async () => {
    // A ticket-window row: only the hash was ever stored, so nothing can
    // reproduce the plaintext and there is no line worth testing.
    const res = await env.DB.prepare(
      "INSERT INTO users (name, token_hash, is_owner, created_at) VALUES ('Old', 'hash-only', 0, 0)",
    ).run()
    const user: User = { id: Number(res.meta.last_row_id), name: 'Old', is_owner: 0, created_at: 0 }
    const html = await setupHtmlEn(user, '?show=1')

    const main = inside(html, '<main class="wrap doc">')
    expect(main).toContain('This server cannot read the plaintext of your token')
    expect(main).toContain('<a href="/claim">Attach them once</a>')
    expect(main).not.toContain('data-test=')
    expect(main.split('一息').join('')).not.toMatch(/[一-鿿]/)
  })

  /**
   * The one assertion in this block that runs code rather than reading it.
   *
   * `fill`'s `{body}` is emitted into the page as a literal, and the
   * placeholder it has to match lives in two `t()` sources and their two
   * translations. Guard ③ keeps source and translation in step with each
   * other, and the substring checks above see the translated sentence reach
   * the script — but rename the placeholder on *both* those sides at once and
   * every one of them stays green while the tester prints a raw `{body}` at
   * the reader. So this calls the shipped function against the real
   * translation and demands the placeholder was actually consumed.
   *
   * `fillBody` is the same function object the page emits through
   * `Function.prototype.toString()`, so there is no second copy to drift.
   */
  it('fills {body} with the server’s answer, in the sentence the reader gets', async () => {
    const en = translator('en')
    const zh = translator('zh')

    for (const source of ['服务器拒绝了：{body}', '通了 · 返回「{body}」，现在不拦（免打扰窗口里或者这个 App 没启用）']) {
      for (const t of [en, zh]) {
        const filled = fillBody(t(source), 'kCFErrorDomainCFNetwork')
        expect(filled, source).toContain('kCFErrorDomainCFNetwork')
        expect(filled, source).not.toContain('{body}')
      }
    }

    expect(fillBody(en('服务器拒绝了：{body}'), 'nope')).toBe('The server refused it: nope')

    // Whatever the server echoed is data: a replacement *string* would read
    // `$&` as a substitution pattern, a replacer function does not.
    expect(fillBody(en('服务器拒绝了：{body}'), '$& $` $1')).toBe('The server refused it: $& $` $1')

    // And the page only ever assigns the result to textContent, never to HTML.
    const { user, token } = await setupUserWithApps()
    const js = scriptOf(await setupHtmlEn(user, `?k=${token}`))
    expect(js).toContain('out.textContent = fill(')
    expect(js).not.toMatch(/innerHTML|insertAdjacentHTML|outerHTML|document\.write/)
  })

  it('translates the empty state and the Breathe face nav', async () => {
    const created = await register(env, { email: 'setup-empty@example.com', password: 'correct-horse-1' })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const html = await setupHtmlEn(created.user, '?show=1')

    const main = inside(html, '<main class="wrap doc">')
    expect(main).toContain('You have no apps configured')
    expect(main).toContain('<a href="/settings">Settings</a>')
    expect(main).toContain('No apps configured yet.')

    const nav = html.match(/<nav aria-label="Navigation">([\s\S]*?)<\/nav>/)
    expect(nav, 'nav missing or still labelled in Chinese').toBeTruthy()
    for (const label of ['Log', 'Settings', 'Guide', 'Account']) {
      expect(nav![1]).toContain(`<span class="lb">${label}</span>`)
    }
  })
})

// ============================================================================
// /surf, /surf/review, /surf/setup — the 渡 face
// ============================================================================

describe('/surf in English', () => {
  async function surfHtml(en = true, u: User = user): Promise<string> {
    return await (await handleSurf(new Request(`${BASE}/surf`, { headers: headers(en) }), env, u)).text()
  }

  it('declares the language and translates the opening screen', async () => {
    const html = await surfHtml(true, { ...user, surf_scene: 'feed' })
    expect(html).toContain('<html lang="en">')
    expect(html).toContain('<title>Surf · 一息</title>')
    const main = inside(html, '<main class="flow">')
    expect(main).toContain('<h1>An urge came.</h1>')
    expect(main).toContain('The fingers want to move. You do not want to watch.')
    expect(main).toContain('Put the phone down and go to another room. Tap again when you are back.')
    expect(main).toContain('I am up')
    expect(main).not.toMatch(CHINESE_PUNCT)
  })

  it('translates step 1 whole: both scene tasks, the five titles and the grounding lines', async () => {
    const html = await surfHtml(true, { ...user, surf_scene: 'snack' })
    for (const line of [
      // The chosen scene's own two tasks — segment a's errand and segment d's.
      'Drink a glass of warm water, slowly, all of it.',
      'Brush your teeth.',
      'Your hands',
      'Your eyes',
      'Around you',
      'Your body',
      'Breath',
      'Tap it.',
      'Follow it.',
      // The first grounding line is on the page; the other four ride in the
      // config island, and an untranslated one would switch the segment back
      // into Chinese on its second tap.
      'Find five blue things in the room.',
      'Name one taste in your mouth right now.',
      // The only counted string in the product, placeholder intact so the
      // script can fill it per beat.
      'Number {n}',
    ]) {
      expect(html, line).toContain(line)
    }
  })

  it('translates the neutral default for an account that never picked a scene, and its setup link', async () => {
    const main = inside(await surfHtml(), '<main class="flow">')
    expect(main).toContain('It will pass.')
    expect(main).toContain('Tell me which one this is first')
    expect(main).not.toMatch(CHINESE_PUNCT)
  })

  it('translates the remaining steps, the parting lines and the noscript fallback', async () => {
    const html = await surfHtml()
    const main = inside(html, '<main class="flow">')
    expect(main).toContain('Ten minutes.')
    expect(main).toContain('It passed')
    expect(main).toContain('Still there')
    expect(main).toContain('Another ten minutes')
    expect(main).toContain('I opened it')
    expect(main).toContain('Again')
    expect(html).toContain('This page needs JavaScript. Go back to the home screen and open it again.')
    expect(main).not.toMatch(CHINESE_PUNCT)
  })

  it('renders no <header> at all, in either language — the flow page owns its own chrome', async () => {
    expect(await surfHtml()).not.toContain('<header>')
  })
})

describe('/surf/review in English', () => {
  it('translates the empty state and the 渡 face nav', async () => {
    const html = await (await renderSurfReview(new Request(`${BASE}/surf/review`, { headers: EN }), env, user)).text()

    expect(html).toContain('<html lang="en">')
    expect(html).toContain('<title>Review · Alex</title>')
    const main = mainOf(html)
    expect(main).toContain('<h1>Review</h1>')
    expect(main).toContain('Nothing recorded yet. When an urge comes, tap “Surf” on the home screen.')
    expect(main).not.toMatch(CHINESE_PUNCT)

    const nav = html.match(/<nav aria-label="Navigation">([\s\S]*?)<\/nav>/)
    expect(nav, 'nav missing or still labelled in Chinese').toBeTruthy()
    // 'Surf' (渡) is deliberately not among these: /surf writes an `urges` row
    // on load, so it is not a tab on its own face's nav — see console.ts.
    for (const label of ['Review', 'Guide', 'Account']) {
      expect(nav![1]).toContain(`<span class="lb">${label}</span>`)
    }
  })

  it('translates both cards and the counts', async () => {
    const passed = await createUrge(env.DB, { userId: 1, state: '', trigger: 'lust', now: NOW })
    await finishUrge(env.DB, 1, passed, 'passed', NOW)
    const opened = await createUrge(env.DB, { userId: 1, state: '', trigger: '', now: NOW })
    await finishUrge(env.DB, 1, opened, 'opened', NOW)

    const html = await (await renderSurfReview(new Request(`${BASE}/surf/review`, { headers: EN }), env, user)).text()
    const main = mainOf(html)
    expect(main).toContain('<h2>30 days</h2>')
    expect(main).toContain('<h2>Time of day</h2>')
    expect(main).toContain('Surfed 2 times in 30 days')
    expect(main).toContain('Passed 1')
    expect(main).toContain('Opened it 1')
    expect(main).not.toMatch(CHINESE_PUNCT)
  })
})

describe('/surf/setup in English', () => {
  it('translates the form, the five scenes and the two entry points', async () => {
    const html = await (await handleSurfSetup(new Request(`${BASE}/surf/setup`, { headers: EN }), env, user)).text()

    expect(html).toContain('<html lang="en">')
    const main = mainOf(html)
    expect(main).toContain('<h1>Guide</h1>')
    expect(main).toContain(
      'You pick once. After that, an urge means you open this and the flow starts, with nothing left to answer.',
    )
    for (const label of ['Lust', 'Short video', 'Games', 'Late-night eating', 'Something else']) {
      expect(main, label).toContain(`<span>${label}</span>`)
    }
    expect(main).toContain('Write your own')
    expect(main).toContain('One line for yourself in that moment')
    expect(main).toContain('>Save</button>')
    expect(main).toContain('<h2>Access</h2>')
    expect(main).toContain(
      'Home screen: open /surf in Safari, then Share → Add to Home Screen, and you get a separate “Surf” icon.',
    )
    expect(main).toContain('Shortcuts')
    expect(main).toContain('/account')
    expect(main).not.toMatch(CHINESE_PUNCT)

    const nav = html.match(/<nav aria-label="Navigation">([\s\S]*?)<\/nav>/)
    expect(nav, 'nav missing or still labelled in Chinese').toBeTruthy()
    // 'Surf' (渡) is deliberately not among these: /surf writes an `urges` row
    // on load, so it is not a tab on its own face's nav — see console.ts.
    for (const label of ['Review', 'Guide', 'Account']) {
      expect(nav![1]).toContain(`<span class="lb">${label}</span>`)
    }
  })
})

// ============================================================================
// The nav, and the Chinese baseline
// ============================================================================

describe('the shared console header', () => {
  it('carries English tab labels on every page of the 今日 face', async () => {
    for (const html of [await todayHtml(), await goalsHtml(), await progressHtml(), await setupHtml()]) {
      const nav = html.match(/<nav aria-label="Navigation">([\s\S]*?)<\/nav>/)
      expect(nav, 'nav missing or still labelled in Chinese').toBeTruthy()
      for (const label of ['Today', 'Goals', 'Review', 'Guide', 'Account']) {
        expect(nav![1]).toContain(`<span class="lb">${label}</span>`)
      }
    }
  })

  it('offers the other face in English beside the brand, keeping the brand itself', async () => {
    const html = await todayHtml()
    expect(html).toContain('<span class="brand">一息</span><span class="facename">· Today</span>')
    expect(html).toMatch(/<a class="face" href="\/review">Breathe\s*›<\/a>/)
  })
})

describe('with no language header at all, nothing changed', () => {
  it('still renders Chinese on all four pages', async () => {
    await seed('健身', { target: 'bilibili://video/BV1', label: 'B 站' })

    const today = await todayHtml(false)
    expect(today).toContain('<html lang="zh-Hans">')
    expect(today).toContain('去 B 站')
    expect(today).toContain('<a class="linky" href="/today/goals">编辑目标</a>')

    expect(await goalsHtml(false)).toContain('<h1>目标</h1>')
    expect(await progressHtml(false)).toContain('<h1>回看</h1>')
    expect(await setupHtml(false)).toContain('<h1>怎么配</h1>')
  })

  it('still renders Chinese on the breathing page, the landing page and /mock', async () => {
    const sid = await seedBreathe(null)
    const breathe = await (await renderBreathe(new Request(`${BASE}/b?s=${sid}`), env)).text()
    expect(breathe).toContain('<html lang="zh-Hans">')
    expect(breathe).toContain('你正要打开<b>小红书</b>')
    expect(breathe).toContain('>算了<')
    expect(breathe).toContain('>继续打开<')
    expect(breathe).toContain('>吸气<')
    expect(configOf(breathe).leftSub).toBe('可以锁屏了。')
    expect(configOf(breathe).wentMain).toBe('正在打开小红书……')

    const landing = await renderLanding(new Request(`${BASE}/`)).text()
    expect(landing).toContain('<html lang="zh-Hans">')
    expect(landing).toContain('<p class="lede">在你打开一个 App 之前，先呼吸十秒。</p>')
    expect(landing).toContain('<a href="/mock?v=1">墨</a><a href="/mock?v=2">息</a>')

    const mock = await renderMock(new Request(`${BASE}/mock?v=1`)).text()
    expect(mock).toContain('<html lang="zh-Hans">')
    expect(mock).toContain('你正要打开<b>小红书</b>')
    expect(mock).toContain('>墨</a>')
    expect(mock).toContain('<span>预览</span>')
  })

  it('still renders Chinese on the account pages, /settings and /review', async () => {
    const register = await (await handleRegister(req('/register', false), env)).text()
    expect(register).toContain('<html lang="zh-Hans">')
    expect(register).toContain('<h1>注册</h1>')
    expect(register).toContain('两样都丢了')

    const login = await (await handleLogin(req('/login', false), env)).text()
    expect(login).toContain('<h1>登录</h1>')
    expect(login).toContain('<a href="/recover">用 token 重置</a>')
    expect(login).toContain('<p class="lang"><a href="?lang=en">English</a> · 中文</p>')

    const account = await (await handleAccount(req('/account', false), env, user)).text()
    expect(account).toContain('<html lang="zh-Hans">')
    expect(account).toContain('<h2>你的 token</h2>')
    expect(account).toContain('退出登录')

    const settings = await (await handleSettings(req('/settings', false), env, user)).text()
    expect(settings).toContain('<h1>要拦哪些 App</h1>')
    expect(settings).toContain('还没有配置任何 App')
    expect(settings).toContain('>试跳</button>')

    const review = await (await renderReview(req('/review', false), env, user)).text()
    expect(review).toContain('<h2>还没有记录</h2>')
    expect(review).toContain('你还没有被拦下过一次。')

    const setup = await (await renderSetup(req('/setup', false), env, user)).text()
    expect(setup).toContain('<html lang="zh-Hans">')
    expect(setup).toContain('<h1>怎么配</h1>')
    expect(setup).toContain('先记住一件事：一个 App 一条，各配各的')
  })

  it('still renders Chinese on the 渡 face — /surf, /surf/review and /surf/setup', async () => {
    const surf = await (await handleSurf(new Request(`${BASE}/surf`), env, user)).text()
    expect(surf).toContain('<html lang="zh-Hans">')
    expect(surf).toContain('<h1>冲动来了。</h1>')
    expect(surf).toContain('它会过去的。')
    expect(surf).not.toContain('<header>')

    const review = await (await renderSurfReview(req('/surf/review', false), env, user)).text()
    expect(review).toContain('<html lang="zh-Hans">')
    expect(review).toContain('<h1>回看</h1>')
    expect(review).toContain('还没有记录。冲动来的时候，点主屏上的「渡」。')

    const setup = await (await handleSurfSetup(req('/surf/setup', false), env, user)).text()
    expect(setup).toContain('<html lang="zh-Hans">')
    expect(setup).toContain('<h1>怎么配</h1>')
    expect(setup).toContain('<span>深夜加餐</span>')
  })
})

// ============================================================================
// The breathing page, the landing page and /mock
// ============================================================================

/** The breathing page's config island: what its inline script actually runs on. */
function configOf(html: string): Record<string, unknown> {
  const m = html.match(/<script type="application\/json" id="cfg">([\s\S]*?)<\/script>/)
  expect(m, 'config island missing').toBeTruthy()
  return JSON.parse(m![1]!) as Record<string, unknown>
}

/** The inline behaviour script (the one with no type attribute). */
function scriptOf(html: string): string {
  const m = html.match(/<script>([\s\S]*?)<\/script>/)
  expect(m, 'inline script missing').toBeTruthy()
  return m![1]!
}

/**
 * Only the part of a page a reader sees. The punctuation sweep cannot run over
 * whole documents here: both stylesheets carry comments naming the two skins,
 * 「墨」 and 「息」, and those are notes to the next programmer rather than copy.
 */
function inside(html: string, open: string): string {
  const m = html.match(new RegExp(open + '([\\s\\S]*?)</main>'))
  expect(m, `no ${open} found`).toBeTruthy()
  return m![1]!
}

/**
 * A real /b link: an app row, a live session, and the account's own language.
 * `locale` is what the whole point of this hangs on — an iOS Shortcut opens
 * the breathing page with no cookie of ours, so the stored column is the only
 * thing that can make the page English.
 */
async function seedBreathe(locale: string | null): Promise<string> {
  await env.DB.prepare('UPDATE users SET locale = ?1 WHERE id = 1').bind(locale).run()
  await env.DB.prepare(
    `INSERT OR REPLACE INTO user_apps (user_id, app, label, scheme, wait_seconds, grace_seconds, enabled)
     VALUES (1, 'xhs', '小红书', 'xhsdiscover://', 10, 90, 1)`,
  ).run()
  const sid = 'i18n-' + Math.random().toString(36).slice(2)
  await env.DB.prepare(
    'INSERT INTO sessions (sid, user_id, app, created_at, resolved_at) VALUES (?1, 1, ?2, ?3, NULL)',
  )
    .bind(sid, 'xhs', NOW)
    .run()
  return sid
}

describe('/b in English', () => {
  it('takes the language from the account, since the Shortcut brings nothing else', async () => {
    const sid = await seedBreathe('en')
    // No Accept-Language, no cookie: exactly what a Shortcut sends.
    const html = await (await renderBreathe(new Request(`${BASE}/b?s=${sid}`), env)).text()

    expect(html).toContain('<html lang="en">')
    const stage = inside(html, '<main class="stage">')
    // The label is the user's own data and is never translated.
    expect(stage).toContain('You are about to open <b>小红书</b>')
    expect(stage).toContain('>Never mind<')
    expect(stage).toContain('>Open it anyway<')
    expect(stage).toContain('>Inhale<')
    expect(stage).toContain('aria-label="Breathing guide"')
    expect(stage).not.toMatch(CHINESE_PUNCT)
    expect(html).toContain('This page needs JavaScript.')
  })

  it('hands both phase words and every closing line to the script as English', async () => {
    const sid = await seedBreathe('en')
    const cfg = configOf(await (await renderBreathe(new Request(`${BASE}/b?s=${sid}`), env)).text())

    expect(cfg.inhaleWord).toBe('Inhale')
    expect(cfg.exhaleWord).toBe('Exhale')
    expect(cfg.leftSub).toBe('You can lock the screen now.')
    expect(cfg.wentMain).toBe('Opening 小红书…')
    expect(cfg.wentSub).toBe('If nothing happens, go back to the home screen and open it yourself.')
    expect(String(cfg.leftMain)).not.toMatch(CHINESE_PUNCT)
    expect(String(cfg.leftMain)).not.toMatch(/[!！]/)
  })

  it('leaves the gesture-stack jump exactly as it was — one synchronous location.href', async () => {
    const sid = await seedBreathe('en')
    const js = scriptOf(await (await renderBreathe(new Request(`${BASE}/b?s=${sid}`), env)).text())

    // The one thing translation was never allowed to touch. Two assignments
    // would mean a second navigation path had appeared beside the real one.
    expect(js.match(/location\.href=/g) ?? []).toHaveLength(1)
    expect(js).toContain('if(SCHEME)location.href=SCHEME;')
    // The phase word now comes from the island, so the script itself is the
    // same bytes in either language.
    expect(js).toContain('var word=inhaling?cfg.inhaleWord:cfg.exhaleWord;')
    expect(js).not.toMatch(/吸气|呼气/)
  })

  it('answers a dead link in English too', async () => {
    const res = await renderBreathe(new Request(`${BASE}/b`, { headers: EN }), env)
    expect(res.status).toBe(400)
    const html = await res.text()
    expect(html).toContain('<html lang="en">')
    expect(html).toContain('This link has expired.')
    expect(html).toContain('Go back to the home screen and open it again.')
  })
})

describe('/ in English', () => {
  it('translates the page a stranger lands on, its title and its description', async () => {
    const html = await renderLanding(new Request(`${BASE}/`, { headers: EN })).text()

    expect(html).toContain('<html lang="en">')
    expect(html).toContain('<title>一息 (yixi) — ten seconds of breathing before an app opens')
    expect(html).toMatch(/<meta name="description" content="Before an app like Instagram opens/)

    const doc = inside(html, '<main class="doc">')
    expect(doc).toContain('<h1>一息</h1>')
    expect(doc).toContain('Ten seconds of breathing before you open an app.')
    expect(doc).toContain('<h2>How it works</h2>')
    expect(doc).toContain('<h2>On privacy</h2>')
    // The examples turn into apps an English reader would name.
    expect(doc).toContain('Instagram')
    expect(doc).not.toContain('小红书')
    expect(doc).not.toMatch(CHINESE_PUNCT)
    expect(doc).not.toMatch(/[!！]/)
  })

  it('offers the other language in the footer, and never links the one being read', async () => {
    const en = await renderLanding(new Request(`${BASE}/`, { headers: EN })).text()
    expect(en).toContain('<p class="lang">English · <a href="?lang=zh">中文</a></p>')

    const zh = await renderLanding(new Request(`${BASE}/`)).text()
    expect(zh).toContain('<p class="lang"><a href="?lang=en">English</a> · 中文</p>')
  })

  it('keeps its cache, and names what the page varies on', async () => {
    const res = renderLanding(new Request(`${BASE}/`, { headers: EN }))
    expect(res.headers.get('cache-control')).toContain('max-age')
    // The browser's own cache is what has to hear this: without it, the copy
    // a visitor is reading stays fresh for up to a minute after the switcher
    // above has changed the cookie, and the switch looks broken.
    expect(res.headers.get('vary')).toBe('Accept-Language, Cookie')
  })

  it('gives the English phase word its own width, gated so Chinese does not move', async () => {
    const html = await renderLanding(new Request(`${BASE}/`, { headers: EN })).text()
    // 4em is two CJK glyphs; an English word needs more room and wants to be
    // centred under the orb rather than starting at the left of the box.
    expect(html).toContain('html[lang="en"] .peek .phase{width:6em;text-align:center}')
    // The Chinese rule is untouched, and the override cannot reach it.
    expect(html).toContain('.peek .phase{position:relative;margin:0;height:1.2em;width:4em;')
  })
})

describe('/mock in English', () => {
  it('follows the request, names both skins in English and uses an English example', async () => {
    const html = await renderMock(new Request(`${BASE}/mock?v=1`, { headers: EN })).text()

    expect(html).toContain('<html lang="en">')
    expect(html).toContain('You are about to open <b>Instagram</b>')
    expect(html).toContain('<span>Preview</span>')
    expect(html).toContain('>Ink</a>')
    expect(html).toContain('>Breath</a>')
    expect(html).toContain('>Again</a>')
    expect(html).toContain('aria-label="Visual preview"')

    const cfg = configOf(html)
    expect(cfg.wentMain).toBe('This is where it would jump back to Instagram.')
    expect(cfg.wentSub).toBe('A preview page goes nowhere.')
  })

  it('still treats a label somebody typed as data, in either language', async () => {
    const html = await renderMock(new Request(`${BASE}/mock?v=1&label=微博`, { headers: EN })).text()
    expect(html).toContain('You are about to open <b>微博</b>')
    expect(configOf(html).wentMain).toBe('This is where it would jump back to 微博.')
  })
})
