// Two jobs share this file: the mechanism itself (localeOf / translator /
// the ?lang= cookie-and-redirect dance / page({lang})) and the guard that
// keeps translation coverage honest as later i18n tasks wrap the ~600
// remaining Chinese strings in t()/msg(). See
// docs/plans/yixi/2026-09-13-i18n-design.md §4 for the guard's contract.

import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { register } from '../src/account'
import { setUserLocale } from '../src/db'
import { DEFAULT_THEME, escapeHtml, jsSingleQuotedBody, jsonForScript, langSwitch, page, pageHtml } from '../src/ui/layout'
import {
  LANG_COOKIE,
  htmlLang,
  isLocale,
  langCookie,
  localeOf,
  msg,
  translator,
} from '../src/i18n'
import { EN } from '../src/i18n/en'

// --- raw source for the guard, read the same way test/wrangler-config.test.ts
// reads wrangler.toml: vitest-pool-workers runs inside workerd, where
// node:fs is unavailable, so files are pulled in as plain-text Vite assets
// (test/env.d.ts declares `*?raw`) rather than opened at runtime.

import accountRaw from '../src/account.ts?raw'
import candidatesRaw from '../src/api/candidates.ts?raw'
import authRaw from '../src/auth.ts?raw'
import cryptoRaw from '../src/crypto.ts?raw'
import datesRaw from '../src/dates.ts?raw'
import dbRaw from '../src/db.ts?raw'
import onboardingRaw from '../src/onboarding.ts?raw'
import gateRaw from '../src/gate.ts?raw'
import i18nEnRaw from '../src/i18n/en.ts?raw'
import i18nIndexRaw from '../src/i18n/index.ts?raw'
import inappRaw from '../src/inapp.ts?raw'
import indexRaw from '../src/index.ts?raw'
import ratelimitRaw from '../src/ratelimit.ts?raw'
import schemeRaw from '../src/scheme.ts?raw'
import schemesRaw from '../src/schemes.ts?raw'
import snapshotRaw from '../src/snapshot.ts?raw'
import statsRaw from '../src/stats.ts?raw'
import surfscenesRaw from '../src/surfscenes.ts?raw'
import turnstileRaw from '../src/turnstile.ts?raw'
import typesRaw from '../src/types.ts?raw'
import urgesRaw from '../src/urges.ts?raw'
import uiAccountRaw from '../src/ui/account.ts?raw'
import uiBreatheRaw from '../src/ui/breathe.ts?raw'
import uiBreathingRaw from '../src/ui/breathing.ts?raw'
import uiConsoleRaw from '../src/ui/console.ts?raw'
import uiGoalsRaw from '../src/ui/goals.ts?raw'
import uiIconsRaw from '../src/ui/icons.ts?raw'
import uiGuidesRaw from '../src/ui/guides.ts?raw'
import uiLandingRaw from '../src/ui/landing.ts?raw'
import uiLayoutRaw from '../src/ui/layout.ts?raw'
import uiMockRaw from '../src/ui/mock.ts?raw'
import uiProgressRaw from '../src/ui/progress.ts?raw'
import uiPwaRaw from '../src/ui/pwa.ts?raw'
import uiReviewRaw from '../src/ui/review.ts?raw'
import uiSchemefieldRaw from '../src/ui/schemefield.ts?raw'
import uiSettingsRaw from '../src/ui/settings.ts?raw'
import uiSurfRaw from '../src/ui/surf.ts?raw'
import uiSurfreviewRaw from '../src/ui/surfreview.ts?raw'
import uiSurfsetupRaw from '../src/ui/surfsetup.ts?raw'
import uiSetupRaw from '../src/ui/setup.ts?raw'
import uiOnboardingRaw from '../src/ui/onboarding.ts?raw'
import uiTodayRaw from '../src/ui/today.ts?raw'
import uiTodaysetupRaw from '../src/ui/todaysetup.ts?raw'

const BASE = 'https://yixi.test'

// ============================================================================
// Mechanism
// ============================================================================

describe('isLocale', () => {
  it('accepts only the two known locales', () => {
    expect(isLocale('zh')).toBe(true)
    expect(isLocale('en')).toBe(true)
    expect(isLocale('fr')).toBe(false)
    expect(isLocale('')).toBe(false)
    expect(isLocale(null)).toBe(false)
  })
})

describe('localeOf', () => {
  function req(url: string, headers?: Record<string, string>): Request {
    return new Request(url, headers ? { headers } : undefined)
  }

  it('falls back to zh with no language information at all — the existing suite\'s baseline', () => {
    expect(localeOf(req(`${BASE}/today`), null)).toBe('zh')
  })

  it('honours Accept-Language only once nothing more specific is present', () => {
    expect(localeOf(req(`${BASE}/today`, { 'Accept-Language': 'en-US,en;q=0.9' }), null)).toBe('en')
    expect(localeOf(req(`${BASE}/today`, { 'Accept-Language': 'zh-CN,zh;q=0.9' }), null)).toBe('zh')
    expect(localeOf(req(`${BASE}/today`, { 'Accept-Language': 'fr-FR,fr;q=0.9' }), null)).toBe('en')
  })

  it('prefers the yixi_lang cookie over Accept-Language', () => {
    const request = req(`${BASE}/today`, { Cookie: `${LANG_COOKIE}=en`, 'Accept-Language': 'zh-CN' })
    expect(localeOf(request, null)).toBe('en')
  })

  it('ignores a malformed cookie value and falls through to Accept-Language', () => {
    const request = req(`${BASE}/today`, { Cookie: `${LANG_COOKIE}=fr`, 'Accept-Language': 'en-US' })
    expect(localeOf(request, null)).toBe('en')
  })

  it('prefers user.locale over the cookie', () => {
    const request = req(`${BASE}/today`, { Cookie: `${LANG_COOKIE}=zh` })
    expect(localeOf(request, { locale: 'en' })).toBe('en')
  })

  it('treats an absent or null user.locale exactly like no preference', () => {
    const request = req(`${BASE}/today`, { Cookie: `${LANG_COOKIE}=en` })
    expect(localeOf(request, { locale: null })).toBe('en')
    expect(localeOf(request, {})).toBe('en')
  })

  it('prefers ?lang= over everything else', () => {
    const request = req(`${BASE}/today?lang=en`, { Cookie: `${LANG_COOKIE}=zh` })
    expect(localeOf(request, { locale: 'zh' })).toBe('en')
  })

  it('ignores an invalid ?lang= and falls through to the next level', () => {
    const request = req(`${BASE}/today?lang=fr`, { Cookie: `${LANG_COOKIE}=en` })
    expect(localeOf(request, { locale: 'zh' })).toBe('zh')
  })
})

describe('translator', () => {
  it('zh returns the source verbatim, with placeholders filled', () => {
    const t = translator('zh')
    expect(t('还剩 {n} 秒')).toBe('还剩 {n} 秒')
    expect(t('还剩 {n} 秒', { n: 5 })).toBe('还剩 5 秒')
  })

  it('zh leaves an unmatched placeholder untouched', () => {
    expect(translator('zh')('还剩 {n} 秒', {})).toBe('还剩 {n} 秒')
  })

  it('en falls back to the Chinese source when no translation exists, still filling placeholders', () => {
    const t = translator('en')
    expect(t('一个从未翻译过的短语 {n}', { n: 1 })).toBe('一个从未翻译过的短语 1')
  })

  it('en uses the EN dictionary entry when one exists', () => {
    const key = '__i18n_mechanism_test_only__ {n}'
    EN[key] = 'translated {n}'
    try {
      expect(translator('en')(key, { n: 7 })).toBe('translated 7')
    } finally {
      delete EN[key]
    }
  })
})

describe('msg', () => {
  it('is the identity function — a marker for the guard, not a translator', () => {
    expect(msg('原样返回')).toBe('原样返回')
  })
})

// A translation is a string somebody else will write later, and two places put
// one somewhere a plain sentence is not safe: inside `confirm('…')` in an
// onclick, and inside a `<script>` block. Both escapings live in layout.ts so
// there is one of each.

describe('jsSingleQuotedBody', () => {
  it('leaves an ordinary sentence exactly as it was — the Chinese pages must not move', () => {
    expect(jsSingleQuotedBody('删掉这条配置？已经记下的次数不会被删。')).toBe('删掉这条配置？已经记下的次数不会被删。')
    expect(jsSingleQuotedBody('Delete this row? The counts already recorded stay.')).toBe(
      'Delete this row? The counts already recorded stay.',
    )
  })

  it('escapes what would end the string or be read as an escape', () => {
    expect(jsSingleQuotedBody("don't")).toBe("don\\'t")
    expect(jsSingleQuotedBody('a\\b')).toBe('a\\\\b')
    // A backslash before an apostrophe must not be able to un-escape it.
    expect(jsSingleQuotedBody("a\\'b")).toBe("a\\\\\\'b")
    expect(jsSingleQuotedBody('one\ntwo')).toBe('one\\ntwo')
    expect(jsSingleQuotedBody('one\rtwo')).toBe('one\\rtwo')
    // Line terminators to a JavaScript parser, invisible to everyone else.
    expect(jsSingleQuotedBody('a\u2028b')).toBe('a\\u2028b')
    expect(jsSingleQuotedBody('a\u2029b')).toBe('a\\u2029b')
  })

  it('composes with escapeHtml into something a double-quoted attribute holds', () => {
    // The real call shape: onclick="return confirm('…')".
    const attr = escapeHtml(jsSingleQuotedBody('it\'s a "test" <b>'))
    expect(attr).not.toContain('"')
    expect(attr).toBe('it\\&#39;s a &quot;test&quot; &lt;b&gt;')
  })
})

describe('jsonForScript', () => {
  it('is ordinary JSON for ordinary values', () => {
    expect(jsonForScript({ a: 'b' })).toBe('{"a":"b"}')
  })

  it('makes a payload unable to close the element it is written into', () => {
    expect(jsonForScript({ x: '</script><script>alert(1)</script>' })).not.toContain('</script>')
    expect(jsonForScript({ x: 'a\u2028b' })).toBe('{"x":"a\\u2028b"}')
  })
})

describe('langSwitch', () => {
  it('links the other language and leaves the one being read as plain text', () => {
    expect(langSwitch('zh')).toBe('<a href="?lang=en">English</a> · 中文')
    expect(langSwitch('en')).toBe('English · <a href="?lang=zh">中文</a>')
  })

  it('is byte for byte what it was when there is no query to carry', () => {
    // The landing page's Chinese output is pinned to this string.
    expect(langSwitch('zh', '')).toBe(langSwitch('zh'))
    expect(langSwitch('en', '')).toBe(langSwitch('en'))
  })

  it('carries every other param across and rewrites only lang', () => {
    // /login?next=/settings — switching language used to throw the destination
    // away, because `?lang=en` replaces the whole query rather than editing it.
    expect(langSwitch('zh', '?next=%2Fsettings')).toBe(
      '<a href="?next=%2Fsettings&amp;lang=en">English</a> · 中文',
    )
    // A lang already in the query is replaced, not appended a second time.
    expect(langSwitch('en', '?next=%2Fsettings&lang=en')).toBe(
      'English · <a href="?next=%2Fsettings&amp;lang=zh">中文</a>',
    )
  })

  it('cannot be talked out of its own attribute by a param from the address bar', () => {
    const html = langSwitch('zh', '?next=" onmouseover="alert(1)')
    expect(html).not.toContain('onmouseover="')
    expect(html).toContain('%22')
  })
})

describe('htmlLang', () => {
  it('maps zh to zh-Hans and en to en', () => {
    expect(htmlLang('zh')).toBe('zh-Hans')
    expect(htmlLang('en')).toBe('en')
  })
})

describe('langCookie', () => {
  it('is a one-year, HttpOnly, Secure, SameSite=Lax cookie at Path=/', () => {
    expect(langCookie('en')).toBe('yixi_lang=en; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000')
    expect(langCookie('zh')).toBe('yixi_lang=zh; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000')
  })
})

describe('page({ lang }) / pageHtml({ lang })', () => {
  it('defaults to zh-Hans, byte for byte what every page emitted before lang existed', () => {
    expect(pageHtml({ title: 't', theme: DEFAULT_THEME, body: '' })).toContain('<html lang="zh-Hans">')
  })

  it('emits zh-Hans when asked for zh explicitly', () => {
    expect(pageHtml({ title: 't', theme: DEFAULT_THEME, body: '', lang: 'zh' })).toContain('<html lang="zh-Hans">')
  })

  it('emits en when asked', () => {
    expect(pageHtml({ title: 't', theme: DEFAULT_THEME, body: '', lang: 'en' })).toContain('<html lang="en">')
  })

  it('page() carries the same attribute through the Response body', async () => {
    const res = page({ title: 't', theme: DEFAULT_THEME, body: '', lang: 'en' })
    expect(await res.text()).toContain('<html lang="en">')
  })
})

describe('?lang= handling in the router', () => {
  async function reset(): Promise<void> {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions_web'),
      env.DB.prepare('DELETE FROM rate_limit'),
      env.DB.prepare('DELETE FROM user_apps'),
      env.DB.prepare('DELETE FROM users'),
    ])
  }
  beforeEach(reset)

  function get(path: string): Promise<Response> {
    return worker.fetch(new Request(`${BASE}${path}`), env)
  }

  function post(path: string, fields: Record<string, string>): Promise<Response> {
    return worker.fetch(
      new Request(`${BASE}${path}`, { method: 'POST', body: new URLSearchParams(fields) }),
      env,
    )
  }

  const isLocaleWrite = (sql: string): boolean => sql.includes('UPDATE users SET locale')

  /**
   * Every statement one request asked D1 to prepare.
   *
   * A write that does not happen leaves nothing behind to assert on — the row
   * reads the same either way, which is the whole point of skipping it — so the
   * evidence has to be the statement itself. The Worker takes its `env` as an
   * argument, so handing it a DB that records what it is asked needs no module
   * mocking and changes nothing about what actually runs.
   */
  async function sqlOf(path: string): Promise<string[]> {
    const seen: string[] = []
    const db = new Proxy(env.DB, {
      get(target, prop) {
        if (prop === 'prepare') {
          return (sql: string) => {
            seen.push(sql)
            return target.prepare(sql)
          }
        }
        const value = Reflect.get(target, prop) as unknown
        return typeof value === 'function'
          ? (value as (...args: unknown[]) => unknown).bind(target)
          : value
      },
    })
    await worker.fetch(new Request(`${BASE}${path}`), { ...env, DB: db })
    return seen
  }

  it('does not intercept a POST — /login?lang=en must reach handleLogin with its body intact, not 303 with it dropped', async () => {
    const fields = { email: 'nobody@example.com', password: 'whatever-wrong-1' }
    const withLang = await post('/login?lang=en', fields)
    const withoutLang = await post('/login', fields)

    expect(withLang.status).not.toBe(303)
    expect(withLang.headers.get('set-cookie') ?? '').not.toContain(LANG_COOKIE)
    // Same outcome (both 401: readForm still saw email+password) whether or
    // not `?lang=en` rode along — the param must be invisible to a POST.
    expect(withLang.status).toBe(withoutLang.status)
  })

  it('sets the cookie and 303s to the same path with lang stripped, for a signed-out visitor', async () => {
    const res = await get('/?lang=en')
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/')
    expect(res.headers.get('set-cookie')).toContain(`${LANG_COOKIE}=en`)
  })

  it('keeps the rest of the query string, dropping only lang', async () => {
    const res = await get('/setup?show=1&lang=en')
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/setup?show=1')

    const other = await get('/today?lang=en&x=1')
    expect(other.status).toBe(303)
    expect(other.headers.get('location')).toBe('/today?x=1')
  })

  /**
   * The Location is built out of `url.pathname`, which is the WHATWG parser's
   * normalised output — and normalising is what makes these three requests
   * dangerous rather than safe. All three arrive at a pathname of
   * `//evil.example.com`, and a Location header starting `//` is
   * protocol-relative: the browser reads what follows as a hostname and leaves
   * the site, from a link that lived on the real domain. Exactly the shape
   * src/ui/account.ts's `safeNext` already documents and blocks for `?next=`,
   * which is why both now ask the same predicate.
   */
  it('never answers with an off-site Location, whatever shape the path arrives in', async () => {
    for (const path of ['/..//evil.example.com', '//evil.example.com', '/\\evil.example.com']) {
      const res = await get(`${path}?lang=en`)
      expect(res.status, path).toBe(303)
      const location = res.headers.get('location') ?? ''
      expect(location, path).toBe('/')
      expect(new URL(location, BASE).origin, path).toBe(new URL(BASE).origin)
      // The choice still takes effect. Refusing the destination is not a reason
      // to refuse the language — that would make the switcher look broken.
      expect(res.headers.get('set-cookie'), path).toContain(`${LANG_COOKIE}=en`)
    }
  })

  it('spends no write on a language the account has already settled on', async () => {
    const created = await register(env, { email: 'idem@example.com', password: 'correct-horse-1' })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const first = await sqlOf(`/today?k=${created.token}&lang=en`)
    expect(first.some(isLocaleWrite), 'the first choice has to be recorded').toBe(true)

    const again = await sqlOf(`/today?k=${created.token}&lang=en`)
    expect(again.some(isLocaleWrite), 'the column already says en').toBe(false)

    // "No write" must not be reachable by having written the wrong thing.
    const row = await env.DB.prepare('SELECT locale FROM users WHERE id = ?1')
      .bind(created.user.id)
      .first<{ locale: string | null }>()
    expect(row?.locale).toBe('en')

    const back = await sqlOf(`/today?k=${created.token}&lang=zh`)
    expect(back.some(isLocaleWrite), 'switching away is a change and must be written').toBe(true)
  })

  it('ignores an invalid value and falls through to the normal router', async () => {
    const res = await get('/?lang=fr')
    expect(res.status).not.toBe(303)
  })

  it('leaves /gate alone — its fail-open contract runs before lang is ever looked at', async () => {
    const res = await get('/gate?lang=en')
    expect(res.headers.get('location')).not.toBe('/gate')
  })

  it('writes users.locale when the request also authenticates, and keeps k= for the next hop', async () => {
    const created = await register(env, { email: 'lang@example.com', password: 'correct-horse-1' })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const res = await get(`/today?k=${created.token}&lang=en`)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe(`/today?k=${created.token}`)
    expect(res.headers.get('set-cookie')).toContain(`${LANG_COOKIE}=en`)

    const row = await env.DB.prepare('SELECT locale FROM users WHERE id = ?1')
      .bind(created.user.id)
      .first<{ locale: string | null }>()
    expect(row?.locale).toBe('en')
  })

  it('a later request with no ?lang= at all still resolves to the stored locale', async () => {
    const created = await register(env, { email: 'persist@example.com', password: 'correct-horse-1' })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    await setUserLocale(env.DB, created.user.id, 'en')
    const row = await env.DB.prepare('SELECT locale FROM users WHERE id = ?1')
      .bind(created.user.id)
      .first<{ locale: string | null }>()

    // This is the mechanism-level half of "登录后 users.locale 被写入、下次不带
    // 参数仍英文": a page wiring localeOf(request, user) into its own render is
    // a later i18n task's job (see task-2..4 briefs), not this one's — but the
    // fact that the stored column drives localeOf with no ?lang= and no cookie
    // present is exactly what this task's mechanism must already guarantee.
    const bareRequest = new Request(`${BASE}/today`)
    expect(localeOf(bareRequest, { locale: row?.locale ?? null })).toBe('en')
  })
})

// ============================================================================
// Guard
// ============================================================================

/**
 * Files a later i18n task has fully converted — every user-visible string
 * wrapped in `t()`/`msg()`, nothing left in the raw Chinese. Empty until the
 * first such task lands; each one appends its own paths here (and a matching
 * entry in SOURCES below) — that two-line diff is the entire cost of
 * extending this guard to a new file.
 */
export const CONVERTED: string[] = [
  'src/ui/console.ts',
  'src/ui/today.ts',
  'src/ui/goals.ts',
  'src/ui/progress.ts',
  'src/ui/todaysetup.ts',
  'src/ui/breathe.ts',
  'src/ui/breathing.ts',
  'src/ui/landing.ts',
  'src/ui/guides.ts',
  'src/ui/mock.ts',
  'src/ui/layout.ts',
  'src/ui/account.ts',
  'src/account.ts',
  'src/ui/settings.ts',
  'src/ui/schemefield.ts',
  'src/ui/review.ts',
  'src/ui/setup.ts',
  'src/ui/surf.ts',
  'src/ui/surfreview.ts',
  'src/ui/surfsetup.ts',
  'src/surfscenes.ts',
]

/** Raw source for each CONVERTED path, keyed the same way. */
const SOURCES: Record<string, string> = {
  'src/ui/console.ts': uiConsoleRaw,
  'src/ui/today.ts': uiTodayRaw,
  'src/ui/goals.ts': uiGoalsRaw,
  'src/ui/progress.ts': uiProgressRaw,
  'src/ui/todaysetup.ts': uiTodaysetupRaw,
  'src/ui/breathe.ts': uiBreatheRaw,
  'src/ui/breathing.ts': uiBreathingRaw,
  'src/ui/landing.ts': uiLandingRaw,
  'src/ui/guides.ts': uiGuidesRaw,
  'src/ui/mock.ts': uiMockRaw,
  'src/ui/layout.ts': uiLayoutRaw,
  'src/ui/account.ts': uiAccountRaw,
  'src/account.ts': accountRaw,
  'src/ui/settings.ts': uiSettingsRaw,
  'src/ui/schemefield.ts': uiSchemefieldRaw,
  'src/ui/review.ts': uiReviewRaw,
  'src/ui/setup.ts': uiSetupRaw,
  'src/ui/surf.ts': uiSurfRaw,
  'src/ui/surfreview.ts': uiSurfreviewRaw,
  'src/ui/surfsetup.ts': uiSurfsetupRaw,
  'src/surfscenes.ts': surfscenesRaw,
  'src/ui/onboarding.ts': uiOnboardingRaw,
}

/**
 * Every file under src/ meant to carry user-visible copy, minus the one that
 * never will: api/admin.ts, the owner-only tool. ui/setup.ts was the other
 * exclusion until batch 2 translated it; the whole product is covered now.
 *
 * schemes.ts is in the list but is not in CONVERTED, and the split is the
 * point: its `caveat` strings are copy and are wrapped, while `name`,
 * `aliases` and `category` are the data a search matches against and stay
 * Chinese on every page. Guard ① would not be able to tell those apart, so it
 * is guard ② alone that covers this file.
 *
 * Unlike CONVERTED/SOURCES above, nothing here is on the honour system: every
 * `t()`/`msg()` source found in any of these files must already have an EN
 * key the moment it is written, whichever task adds it — guard ② below scans
 * all of them, not just the ones a task remembered to list.
 */
const ALL_SOURCES: Record<string, string> = {
  'src/account.ts': accountRaw,
  'src/api/candidates.ts': candidatesRaw,
  'src/auth.ts': authRaw,
  'src/crypto.ts': cryptoRaw,
  'src/dates.ts': datesRaw,
  'src/db.ts': dbRaw,
  'src/onboarding.ts': onboardingRaw,
  'src/gate.ts': gateRaw,
  'src/i18n/en.ts': i18nEnRaw,
  'src/i18n/index.ts': i18nIndexRaw,
  'src/inapp.ts': inappRaw,
  'src/index.ts': indexRaw,
  'src/ratelimit.ts': ratelimitRaw,
  'src/schemes.ts': schemesRaw,
  'src/scheme.ts': schemeRaw,
  'src/snapshot.ts': snapshotRaw,
  'src/stats.ts': statsRaw,
  'src/surfscenes.ts': surfscenesRaw,
  'src/turnstile.ts': turnstileRaw,
  'src/types.ts': typesRaw,
  'src/urges.ts': urgesRaw,
  'src/ui/account.ts': uiAccountRaw,
  'src/ui/breathe.ts': uiBreatheRaw,
  'src/ui/breathing.ts': uiBreathingRaw,
  'src/ui/console.ts': uiConsoleRaw,
  'src/ui/goals.ts': uiGoalsRaw,
  'src/ui/icons.ts': uiIconsRaw,
  'src/ui/landing.ts': uiLandingRaw,
  'src/ui/guides.ts': uiGuidesRaw,
  'src/ui/layout.ts': uiLayoutRaw,
  'src/ui/mock.ts': uiMockRaw,
  'src/ui/progress.ts': uiProgressRaw,
  'src/ui/pwa.ts': uiPwaRaw,
  'src/ui/review.ts': uiReviewRaw,
  'src/ui/schemefield.ts': uiSchemefieldRaw,
  'src/ui/settings.ts': uiSettingsRaw,
  'src/ui/setup.ts': uiSetupRaw,
  'src/ui/surf.ts': uiSurfRaw,
  'src/ui/surfreview.ts': uiSurfreviewRaw,
  'src/ui/surfsetup.ts': uiSurfsetupRaw,
  'src/ui/onboarding.ts': uiOnboardingRaw,
  'src/ui/today.ts': uiTodayRaw,
  'src/ui/todaysetup.ts': uiTodaysetupRaw,
}

/**
 * `ALL_SOURCES` above, pinned. The workers pool cannot read the filesystem at
 * runtime, so there is no way to enumerate `src/**‍/*.ts` here and diff it
 * against the map — a file added under `src/` (that isn't one of the three
 * exclusions) and never given a `?raw` import + `ALL_SOURCES` entry would
 * silently fall outside guard ②'s coverage forever. This constant cannot
 * catch that omission either, but it does force the *other* direction to be
 * deliberate: whoever edits `ALL_SOURCES` — adding or removing an entry —
 * must also bump this number in the same diff, or "guard rail: ALL_SOURCES
 * count" below goes red. Bump both together.
 */
const ALL_SOURCES_EXPECTED_COUNT = 43

describe('guard rail: ALL_SOURCES has not silently drifted from its pinned count', () => {
  it('covers exactly as many files as it is pinned to', () => {
    expect(Object.keys(ALL_SOURCES).length).toBe(ALL_SOURCES_EXPECTED_COUNT)
  })
})

const CJK_RE = /[一-鿿]/
const CHINESE_PUNCT_RE = /[「」，。！？；：（）]/
const WHITELIST = ['一息', 'zh-Hans', '中文']
/** First arg of a `t(...)` or `msg(...)` call: quote char in group 1, body in group 2. */
const CALL_ARG_RE = /\b(?:t|msg)\(\s*(['"])((?:\\.|(?!\1).)*)\1/g
const TEMPLATE_ARG_RE = /\b(?:t|msg)\(\s*`/

/** Removes `/* … *‍/` blocks and any line whose first non-space characters are `//` or `*`. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart()
      return !trimmed.startsWith('//') && !trimmed.startsWith('*')
    })
    .join('\n')
}

/**
 * Interprets the handful of escapes a real `t()`/`msg()` call could plausibly
 * contain. Not a full JS string-literal parser — workerd disallows
 * generating code from strings (no `eval`/`new Function`), so this is a
 * small hand-rolled unescaper instead; unrecognised escapes fall back to the
 * character itself, same as a JS engine does for an escape it does not know.
 */
function unescapeStringLiteral(content: string): string {
  return content.replace(/\\(.)/g, (_whole, ch: string) => {
    switch (ch) {
      case 'n':
        return '\n'
      case 't':
        return '\t'
      case 'r':
        return '\r'
      default:
        return ch
    }
  })
}

/** Every literal first argument passed to `t(` or `msg(` in this source. */
function extractCalls(src: string): string[] {
  const out: string[] = []
  for (const m of stripComments(src).matchAll(CALL_ARG_RE)) {
    out.push(unescapeStringLiteral(m[2]))
  }
  return out
}

/**
 * Comments stripped, and every `t()`/`msg()` first-argument literal blanked
 * out (down to the call's own open paren) — so a legitimate translation
 * source string cannot itself trip "no residual Chinese outside t()/msg()".
 */
function withoutCallArgs(src: string): string {
  return stripComments(src).replace(CALL_ARG_RE, (whole, quote: string) => whole.slice(0, whole.indexOf(quote)))
}

function hasResidualChinese(text: string): boolean {
  let cleaned = text
  for (const w of WHITELIST) cleaned = cleaned.split(w).join('')
  return CJK_RE.test(cleaned)
}

function placeholdersOf(s: string): string[] {
  return [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
}

/**
 * Something HTML-shaped: an ASCII letter after the `<`, optionally closing.
 * `<[^>]+>` was too greedy and it cost real copy — it read the `<数字>` that a
 * caveat in src/schemes.ts uses to stand for a run of digits as markup, so the
 * tag-parity clause below required the English to carry that Chinese token
 * unchanged, and an English reader was shown `tencent<数字>://`.
 *
 * This is as far as a regex can go, and the limit is worth stating: `<数字>`,
 * `<3` and `a < b` are now prose, but `<digits>` is still counted as a tag,
 * because a bare English word in angle brackets is *exactly* the shape of a
 * real element and nothing here can tell them apart. That is why en.ts writes
 * `tencent[digits]://` — square brackets, which no reader and no regex will
 * mistake for markup.
 */
const TAG_RE = /<\/?[a-zA-Z][^>]*>/g

/**
 * Every HTML tag in a string, whitespace-normalised and sorted. A `<b>` lost
 * in translation, or an `href` quietly pointed somewhere else, shows up as a
 * difference between the source's list and the translation's.
 */
function tagsOf(s: string): string[] {
  return (s.match(TAG_RE) ?? []).map((tag) => tag.replace(/\s+/g, ' ').trim()).sort()
}

/** The prose of a string, with its markup taken out. */
function stripTags(s: string): string {
  return s.replace(TAG_RE, '')
}

describe('guard helpers', () => {
  it('strips block and line comments before scanning', () => {
    const src = "/* 你好 */\n// 世界\nconst x = t('保留')\n"
    expect(hasResidualChinese(withoutCallArgs(src))).toBe(false)
  })

  it('flags Chinese left outside t()/msg()', () => {
    expect(hasResidualChinese(withoutCallArgs("const label = '未包裹的中文'"))).toBe(true)
  })

  it('extracts t() and msg() first arguments alike, unescaping \\n', () => {
    const src = "t('你好 {name}\\n再见'); msg(\"再见\")"
    expect(extractCalls(src)).toEqual(['你好 {name}\n再见', '再见'])
  })

  it('is whitelist-aware for 一息 / zh-Hans / 中文', () => {
    const src = "const brand = '一息'; const attr = 'zh-Hans'; const label = '中文'"
    expect(hasResidualChinese(withoutCallArgs(src))).toBe(false)
  })

  it('placeholdersOf finds every {name}, order-independent', () => {
    expect(placeholdersOf('还剩 {n} 秒，{who} 的第 {n} 次')).toEqual(['n', 'n', 'who'])
  })

  it('tagsOf is order-independent and does not mind the spacing inside a tag', () => {
    expect(tagsOf('<b>x</b> <a href="/t">y</a>')).toEqual(tagsOf('<a  href="/t">y</a><b>x</b>'))
    expect(tagsOf('<a href="/t">y</a>')).not.toEqual(tagsOf('<a href="/other">y</a>'))
    expect(tagsOf('<b>x</b>')).toEqual(['</b>', '<b>'])
  })

  it('reads angle brackets around prose as prose, not as a tag', () => {
    // The reason this matters: a caveat in src/schemes.ts writes a run of
    // digits as `tencent<数字>://`. Counted as a tag, the parity clause pins
    // that Chinese token into the English translation, and it did — see
    // en.ts's scheme-caveat group.
    expect(tagsOf('tencent<数字>://')).toEqual([])
    expect(tagsOf('3 < 5 and 5 > 3')).toEqual([])
    // What this regex cannot tell apart, and why en.ts writes `[digits]`
    // rather than `<digits>`: a bare word in angle brackets is exactly the
    // shape of a real tag, so `<digits>` would be counted as markup.
    expect(tagsOf('tencent<digits>://')).toEqual(['<digits>'])
    expect(tagsOf('tencent[digits]://')).toEqual([])
  })

  it('stripTags leaves the prose and takes the markup', () => {
    expect(stripTags('<a href="/t">y</a><br>z')).toBe('yz')
    expect(stripTags('tencent<数字>://')).toBe('tencent<数字>://')
  })
})

describe('guard ①: every CONVERTED file carries no residual Chinese', () => {
  it('has none left outside t()/msg() sources', () => {
    for (const path of CONVERTED) {
      const src = SOURCES[path]
      expect(typeof src, `${path} listed in CONVERTED but missing from SOURCES`).toBe('string')
      expect(hasResidualChinese(withoutCallArgs(src ?? '')), `${path} still has un-t()-wrapped Chinese`).toBe(false)
    }
  })
})

describe('guard ②: every t()/msg() source anywhere in src/ has an EN key', () => {
  it('covers every file except api/admin.ts', () => {
    const missing: string[] = []
    for (const [path, src] of Object.entries(ALL_SOURCES)) {
      for (const call of extractCalls(src)) {
        if (!(call in EN)) missing.push(`${path}: ${JSON.stringify(call)}`)
      }
    }
    expect(missing, missing.join('\n')).toEqual([])
  })
})

describe('guard ③: en.ts entries are clean, faithful translations', () => {
  /**
   * The whole string, markup included. An `href` or a class name has no
   * business being in Chinese either, and the one string that made this look
   * negotiable — `tencent<数字>://` — was never markup in the first place;
   * `TAG_RE` above now says so, and the English writes `tencent[digits]://`.
   */
  it('contains no residual Chinese characters other than 一息', () => {
    for (const [zh, translation] of Object.entries(EN)) {
      const withoutBrand = translation.split('一息').join('')
      expect(CJK_RE.test(withoutBrand), `EN[${JSON.stringify(zh)}] = ${JSON.stringify(translation)} still has Chinese`).toBe(false)
    }
  })

  it('uses no Chinese punctuation', () => {
    for (const [zh, translation] of Object.entries(EN)) {
      expect(
        CHINESE_PUNCT_RE.test(translation),
        `EN[${JSON.stringify(zh)}] = ${JSON.stringify(translation)} uses Chinese punctuation`,
      ).toBe(false)
    }
  })

  it('keeps the same {placeholder} set as its source', () => {
    for (const [zh, translation] of Object.entries(EN)) {
      expect(placeholdersOf(translation), `EN[${JSON.stringify(zh)}]`).toEqual(placeholdersOf(zh))
    }
  })

  /**
   * Three pages interpolate `t()` straight into `aria-label="…"` — the
   * breathing orb, the /mock switcher and the landing page's miniature — and
   * `t` escapes nothing. A straight double quote in a translation would end
   * the attribute there and put the rest of the sentence into the tag; the
   * curly quotes this file's voice asks for cannot. Quotes inside a tag the
   * source itself carries (`<a href="/today">`) are the markup's own, and the
   * clause below is what checks those.
   */
  it('uses no straight double quote outside a tag, so a translation cannot end an attribute', () => {
    for (const [zh, translation] of Object.entries(EN)) {
      expect(
        stripTags(translation).includes('"'),
        `EN[${JSON.stringify(zh)}] = ${JSON.stringify(translation)} has a straight " — the voice uses “ ”`,
      ).toBe(false)
    }
  })

  /**
   * en.ts's own header asks for no exclamation marks, and the Chinese has
   * none to translate: nothing in this product congratulates the reader, and
   * a single 「！」 turned into English would make one page louder than every
   * other. Cheaper to assert than to notice in review.
   */
  it('uses no exclamation mark', () => {
    for (const [zh, translation] of Object.entries(EN)) {
      expect(
        /!/.test(translation),
        `EN[${JSON.stringify(zh)}] = ${JSON.stringify(translation)} uses an exclamation mark`,
      ).toBe(false)
    }
  })

  /**
   * Markup is not the translator's to change. Same tags, same order-free
   * multiset, same `href` — a translation that drops a `<b>` or retargets a
   * link is a broken page, not a wording choice.
   */
  it('carries exactly the tags and links its source carries', () => {
    for (const [zh, translation] of Object.entries(EN)) {
      expect(tagsOf(translation), `EN[${JSON.stringify(zh)}]`).toEqual(tagsOf(zh))
    }
  })
})

describe('guard ④: no template literal as the first t()/msg() argument', () => {
  it('forbids it across every scanned file (comments excepted — this line names the pattern)', () => {
    const offenders = Object.entries(ALL_SOURCES)
      .filter(([, src]) => TEMPLATE_ARG_RE.test(stripComments(src)))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })

  it('still catches one outside a comment', () => {
    expect(TEMPLATE_ARG_RE.test(stripComments("const x = t(`hi ${name}`)"))).toBe(true)
  })
})
