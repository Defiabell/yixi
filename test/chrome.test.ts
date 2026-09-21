// The signed-in pages are one surface, and this file is what keeps them that
// way. It exists because they stopped being one and nothing noticed.
//
// /review rendered its own <header>: three text-only tabs, no icons, a
// different layout, and — the part that actually hurt — no link to 「怎么配」,
// 「账号」 or 「发号」 at all. Tabbing to 回顾 changed the furniture and took
// three destinations away, with no way back except the browser's back button.
//
// test/icons.test.ts already asserted the nav had 回顾 among its tabs. It stayed
// green through all of it, because it only ever rendered pages that shared the
// nav. The bug lived in the page the test never asked about.
//
// So the assertion here is not "the nav is right on some page". It is that
// every signed-in page emits the SAME nav *as the rest of its own face*, diffed
// against every sibling, with the page list derived from the router rather than
// hand-copied. A page that renders its own chrome fails this file on the day it
// is added — and so does a page that quietly leaks the other face's tabs.
//
// --- three faces --------------------------------------------------------------
//
// The nav is now three navs: 今日 (/today, /today/goals, /today/review,
// /today/setup), 拦截 (/review, /settings, /setup) and 渡 (/surf/review,
// /surf/setup). So the shape-equality check runs within each face's own page
// set rather than across all of them, and a handful of checks (which hrefs a
// face may and may not offer, the owner's extra tab, the a.face switch link)
// are asserted per face explicitly. `/surf` itself is the one exception: the
// ten-minute flow renders no shared header at all, by design, so it has no
// nav to diff and is covered by its own standalone test instead — and it is
// deliberately not a tab on its own face either, because it writes an `urges`
// row on load, and a nav entry would let browsing between faces silently
// start a record. The face's home is /surf/review, not /surf.

import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { handleToday } from '../src/ui/today'
import { handleGoals } from '../src/ui/goals'
import { renderTodaySetup } from '../src/ui/todaysetup'
import { renderProgress } from '../src/ui/progress'
import { handleSettings } from '../src/ui/settings'
import { renderReview } from '../src/ui/review'
import { renderSetup } from '../src/ui/setup'
import { handleAccount } from '../src/ui/account'
import { handleSurf } from '../src/ui/surf'
import { renderSurfReview } from '../src/ui/surfreview'
import { handleSurfSetup } from '../src/ui/surfsetup'
import { handleAdmin } from '../src/api/admin'
import { CONSOLE_CSS, FACE_COOKIE, faceForPath } from '../src/ui/console'
import { breathePage } from '../src/ui/breathe'
import { renderLanding } from '../src/ui/landing'
import { renderMock } from '../src/ui/mock'
import { DEFAULT_THEME } from '../src/ui/layout'
import { COOKIE_NAME, issueCookie } from '../src/auth'
import { upsertUserApp } from '../src/db'
import type { User } from '../src/types'

const BASE = 'https://yixi.test'
const user: User = { id: 1, name: '张三', is_owner: 0, created_at: Date.now() }
const owner: User = { ...user, is_owner: 1 }

async function reset(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM events'),
    env.DB.prepare('DELETE FROM user_apps'),
    env.DB.prepare('DELETE FROM goal_checkins'),
    env.DB.prepare('DELETE FROM goal_tasks'),
    env.DB.prepare('DELETE FROM goals'),
    env.DB.prepare('DELETE FROM sessions_web'),
    env.DB.prepare('DELETE FROM users'),
  ])
  await env.DB.prepare(
    'INSERT INTO users (id, name, token_hash, is_owner, created_at) VALUES (1, ?1, ?2, 0, ?3)',
  )
    .bind('张三', 'hash-chrome', Date.now())
    .run()
  await upsertUserApp(env.DB, {
    user_id: 1,
    app: 'xhs',
    label: '小红书',
    scheme: 'xhsdiscover://',
    wait_seconds: 10,
    grace_seconds: 90,
    enabled: 1,
  })
}
beforeEach(reset)

type PageFn = (u: User) => Promise<Response>

/**
 * /account with a `yixi_face` cookie for the given face — used below to fold
 * /account into each face's own shape-equality check, now that its header
 * borrows the remembered face instead of always falling back to 拦截.
 */
function accountAs(face: 'today' | 'breathe' | 'surf'): PageFn {
  return (u) => handleAccount(new Request(`${BASE}/account`, { headers: { cookie: `${FACE_COOKIE}=${face}` } }), env, u)
}

/** The 今日 face — all four pages now exist. */
const TODAY_PAGES: Record<string, PageFn> = {
  today: (u) => handleToday(new Request(`${BASE}/today`, { headers: { 'user-agent': 'x' } }), env, u),
  goals: (u) => handleGoals(new Request(`${BASE}/today/goals`), env, u),
  progress: (u) => renderProgress(new Request(`${BASE}/today/review`), env, u),
  todaysetup: (u) => renderTodaySetup(new Request(`${BASE}/today/setup`), env, u),
  account: accountAs('today'),
}

/** The 拦截 face — the original console. */
const BREATHE_PAGES: Record<string, PageFn> = {
  review: (u) => renderReview(new Request(`${BASE}/review`), env, u),
  settings: (u) => handleSettings(new Request(`${BASE}/settings`), env, u),
  setup: (u) => renderSetup(new Request(`${BASE}/setup`), env, u),
  account: accountAs('breathe'),
}

/**
 * The 渡 face. `/surf` itself is deliberately absent from this table: the
 * ten-minute flow renders no shared header at all (see the standalone test
 * below), so it has no nav to diff against its two siblings.
 */
const SURF_PAGES: Record<string, PageFn> = {
  surfreview: (u) => renderSurfReview(new Request(`${BASE}/surf/review`), env, u),
  surfsetup: (u) => handleSurfSetup(new Request(`${BASE}/surf/setup`), env, u),
  account: accountAs('surf'),
}

/**
 * Every page reachable from any face's nav, for checks that don't care which
 * face. `account` is pinned back to the plain, no-cookie render rather than
 * whichever face-specific variant the object spread below would otherwise
 * leave behind (the three maps above all key their own /account render as
 * `account`, and a later spread silently wins over an earlier one) — the
 * checks that iterate this table care about universal properties (one
 * header, noindex, a link to /account, nothing below 11px), not about which
 * face's variant they happen to be looking at.
 */
const ALL_PAGES: Record<string, PageFn> = {
  ...TODAY_PAGES,
  ...BREATHE_PAGES,
  ...SURF_PAGES,
  account: (u) => handleAccount(new Request(`${BASE}/account`), env, u),
}

async function html(pages: Record<string, PageFn>, name: string, u: User = user): Promise<string> {
  const res = await pages[name]!(u)
  return await res.text()
}

function navOf(page: string, where: string): string {
  const m = page.match(/<nav aria-label="导航">([\s\S]*?)<\/nav>/)
  expect(m, `${where}: no shared nav — is it rendering a <header> of its own?`).toBeTruthy()
  return m![1]!.trim()
}

/** The nav minus the current-tab marker, which is the one thing that may differ. */
function shape(nav: string): string {
  return nav.replace(/ class="on" aria-current="page"/g, '').replace(/\s+/g, ' ')
}

describe('one nav a face, on every signed-in page', () => {
  it('renders byte-identical tabs within a face, marker aside', async () => {
    for (const pages of [TODAY_PAGES, BREATHE_PAGES, SURF_PAGES]) {
      const names = Object.keys(pages)
      const shapes = new Map<string, string>()
      for (const name of names) shapes.set(name, shape(navOf(await html(pages, name), name)))

      const [first, ...rest] = names
      for (const name of rest) {
        // Diffed against a sibling rather than a golden string: the point is
        // that they agree, not that they match something written down here.
        expect(shapes.get(name), `${name} nav differs from ${first}`).toBe(shapes.get(first!))
      }
    }
  })

  it('offers /account from every page, whichever face it is on', async () => {
    for (const name of Object.keys(ALL_PAGES)) {
      const nav = navOf(await html(ALL_PAGES, name), name)
      expect(nav, `${name} has no link to /account`).toContain('href="/account"')
    }
  })

  it('gives the 今日 face its four hrefs and none of 拦截’s', async () => {
    for (const name of Object.keys(TODAY_PAGES)) {
      const nav = navOf(await html(TODAY_PAGES, name), name)
      for (const href of ['/today', '/today/goals', '/today/review', '/today/setup']) {
        expect(nav, `${name} has no link to ${href}`).toContain(`href="${href}"`)
      }
      expect(nav, `${name} leaked a 拦截 href`).not.toMatch(/href="\/review"/)
      expect(nav, `${name} leaked a 拦截 href`).not.toMatch(/href="\/settings"/)
      expect(nav, `${name} leaked a 拦截 href`).not.toMatch(/href="\/setup"/)
      expect(nav.match(/<a /g), `${name} tab count`).toHaveLength(5)
    }
  })

  it('gives the 拦截 face its three hrefs and none of 今日’s', async () => {
    for (const name of Object.keys(BREATHE_PAGES)) {
      const nav = navOf(await html(BREATHE_PAGES, name), name)
      for (const href of ['/review', '/settings', '/setup']) {
        expect(nav, `${name} has no link to ${href}`).toContain(`href="${href}"`)
      }
      expect(nav, `${name} leaked a 今日 href`).not.toMatch(/href="\/today"/)
      expect(nav, `${name} leaked a 今日 href`).not.toMatch(/href="\/today\/goals"/)
      expect(nav, `${name} leaked a 今日 href`).not.toMatch(/href="\/today\/review"/)
      expect(nav, `${name} leaked a 今日 href`).not.toMatch(/href="\/today\/setup"/)
      expect(nav.match(/<a /g), `${name} tab count`).toHaveLength(4)
    }
  })

  it('gives the 渡 face its two hrefs and none of the other two faces’', async () => {
    for (const name of Object.keys(SURF_PAGES)) {
      const nav = navOf(await html(SURF_PAGES, name), name)
      for (const href of ['/surf/review', '/surf/setup', '/account']) {
        expect(nav, `${name} has no link to ${href}`).toContain(`href="${href}"`)
      }
      // /surf itself writes an `urges` row on load, so it must never be a tab —
      // that would let switching faces silently start a record.
      expect(nav, `${name} offers /surf as a tab`).not.toMatch(/href="\/surf"/)
      expect(nav, `${name} leaked a 今日 href`).not.toMatch(/href="\/today"/)
      expect(nav, `${name} leaked a 拦截 href`).not.toMatch(/href="\/review"/)
      expect(nav, `${name} leaked an admin href`).not.toMatch(/href="\/admin"/)
      expect(nav.match(/<a /g), `${name} tab count`).toHaveLength(3)
    }
  })

  it('marks the page you are on, and only that one', async () => {
    for (const name of Object.keys(ALL_PAGES)) {
      const nav = navOf(await html(ALL_PAGES, name), name)
      expect(nav.match(/aria-current="page"/g), `${name} current tab`).toHaveLength(1)
    }
  })

  /**
   * Not just "exactly one tab is current" (the test above) but "current is
   * the RIGHT tab" — the failure mode that check cannot catch is two pages
   * swapping markers, each still marking exactly one.
   */
  it('marks the right tab, not just exactly one', async () => {
    const expectedHref: Record<string, string> = {
      today: '/today',
      goals: '/today/goals',
      progress: '/today/review',
      todaysetup: '/today/setup',
      review: '/review',
      settings: '/settings',
      setup: '/setup',
      account: '/account',
      surfreview: '/surf/review',
      surfsetup: '/surf/setup',
    }
    for (const name of Object.keys(ALL_PAGES)) {
      const nav = navOf(await html(ALL_PAGES, name), name)
      const m = nav.match(/<a href="([^"]+)" class="on" aria-current="page"/)
      expect(m, `${name}: no current-tab anchor found`).toBeTruthy()
      expect(m![1], `${name} current tab href`).toBe(expectedHref[name])
    }
  })

  /**
   * Three faces now exist (今日, 拦截, 渡), so the switch beside the brand is
   * one `a.face` per face OTHER than the one you are on — two links, not
   * one — each pointing at that face's home (/today, /review or
   * /surf/review — not /surf, which writes a record on load).
   */
  it('offers an a.face link to each of the other faces’ homes, beside the brand', async () => {
    for (const name of Object.keys(TODAY_PAGES)) {
      const page = await html(TODAY_PAGES, name)
      expect(page.match(/<a class="face" /g), `${name} a.face count`).toHaveLength(2)
      expect(page, `${name} a.face`).toMatch(/<a class="face" href="\/review">拦截\s*›<\/a>/)
      expect(page, `${name} a.face`).toMatch(/<a class="face" href="\/surf\/review">渡\s*›<\/a>/)
    }
    for (const name of Object.keys(BREATHE_PAGES)) {
      const page = await html(BREATHE_PAGES, name)
      expect(page.match(/<a class="face" /g), `${name} a.face count`).toHaveLength(2)
      expect(page, `${name} a.face`).toMatch(/<a class="face" href="\/today">今日\s*›<\/a>/)
      expect(page, `${name} a.face`).toMatch(/<a class="face" href="\/surf\/review">渡\s*›<\/a>/)
    }
    for (const name of Object.keys(SURF_PAGES)) {
      const page = await html(SURF_PAGES, name)
      expect(page.match(/<a class="face" /g), `${name} a.face count`).toHaveLength(2)
      expect(page, `${name} a.face`).toMatch(/<a class="face" href="\/today">今日\s*›<\/a>/)
      expect(page, `${name} a.face`).toMatch(/<a class="face" href="\/review">拦截\s*›<\/a>/)
    }
  })

  it('gives the owner an extra 发号 tab only on the 拦截 face', async () => {
    for (const name of Object.keys(BREATHE_PAGES)) {
      const nav = navOf(await html(BREATHE_PAGES, name, owner), `${name} (owner)`)
      expect(nav.match(/<a /g), `${name} owner tab count`).toHaveLength(5)
      expect(nav, `${name} owner`).toContain('/admin')
    }
    for (const name of Object.keys(TODAY_PAGES)) {
      const nav = navOf(await html(TODAY_PAGES, name, owner), `${name} (owner)`)
      expect(nav.match(/<a /g), `${name} owner tab count`).toHaveLength(5)
      expect(nav, `${name} owner should have no 发号`).not.toContain('/admin')
    }
    for (const name of Object.keys(SURF_PAGES)) {
      const nav = navOf(await html(SURF_PAGES, name, owner), `${name} (owner)`)
      expect(nav.match(/<a /g), `${name} owner tab count`).toHaveLength(3)
      expect(nav, `${name} owner should have no 发号`).not.toContain('/admin')
    }
    const adminNav = navOf(await (await handleAdmin(new Request(`${BASE}/admin`), env, owner)).text(), 'admin')
    expect(adminNav.match(/<a /g)).toHaveLength(5)
    expect(adminNav).toContain('/admin')
  })

  it('draws an icon in every tab — a text-only nav is the old /review', async () => {
    for (const name of Object.keys(TODAY_PAGES)) {
      const nav = navOf(await html(TODAY_PAGES, name), name)
      expect(nav.match(/<svg /g), `${name} tab icons`).toHaveLength(5)
      expect(nav.match(/<span class="lb">/g), `${name} tab labels`).toHaveLength(5)
    }
    for (const name of Object.keys(BREATHE_PAGES)) {
      const nav = navOf(await html(BREATHE_PAGES, name), name)
      expect(nav.match(/<svg /g), `${name} tab icons`).toHaveLength(4)
      expect(nav.match(/<span class="lb">/g), `${name} tab labels`).toHaveLength(4)
    }
    for (const name of Object.keys(SURF_PAGES)) {
      const nav = navOf(await html(SURF_PAGES, name), name)
      expect(nav.match(/<svg /g), `${name} tab icons`).toHaveLength(3)
      expect(nav.match(/<span class="lb">/g), `${name} tab labels`).toHaveLength(3)
    }
  })

  it('lets no page ship a second <header> of its own', async () => {
    for (const name of Object.keys(ALL_PAGES)) {
      const page = await html(ALL_PAGES, name)
      expect(page.match(/<header>/g), `${name} header count`).toHaveLength(1)
      // /review's private copy is gone; nobody may style the nav back down.
      expect(page.split('${')[0]).not.toMatch(/header nav\s*\{[^}]*font-size/)
    }
  })

  /**
   * /surf — the ten-minute flow itself, as opposed to its two console
   * siblings above — is the one signed-in page that renders NO shared
   * header at all, by design: it is opened at the exact moment somebody is
   * reaching for a distraction, and the nav chrome (a face switch, four
   * tabs) has nothing to do with the five-step walkthrough. This is not an
   * oversight the byte-identical-nav check above should ever "fix".
   */
  it('renders no <header> on /surf itself — the flow page owns its own chrome', async () => {
    const page = await (await handleSurf(new Request(`${BASE}/surf`), env, user)).text()
    expect(page.match(/<header>/g), 'the flow page must not have grown a shared header').toBeNull()
  })
})

/**
 * The bug this cookie fixes: 「点击账号按钮之后就会跳转到拦截主题」. /account
 * and /admin belong to no face, and `faceOf` used to fall back to 拦截
 * unconditionally, so opening 账号 from 今日 or 渡 silently swapped the whole
 * header out from under the reader. `yixi_face` remembers the last face a
 * real page visit resolved (`faceForPath`, applied by src/index.ts) so a
 * face-less page can render with that face instead.
 */
describe('yixi_face cookie: /account borrows the remembered face', () => {
  async function accountHtml(cookie?: string): Promise<string> {
    const init = cookie ? { headers: { cookie } } : undefined
    const res = await handleAccount(new Request(`${BASE}/account`, init), env, user)
    return await res.text()
  }

  it('shows the 渡 nav and facename with yixi_face=surf', async () => {
    const page = await accountHtml(`${FACE_COOKIE}=surf`)
    const nav = navOf(page, 'account (surf cookie)')
    expect(nav).toContain('href="/surf/review"')
    expect(nav).toContain('href="/surf/setup"')
    expect(nav).toContain('href="/account"')
    expect(nav, 'leaked a 今日 href').not.toMatch(/href="\/today"/)
    expect(nav, 'leaked a 拦截 href').not.toMatch(/href="\/review"/)
    expect(page).toContain('class="facename">· 渡</span>')
  })

  it('shows the 今日 nav and facename with yixi_face=today', async () => {
    const page = await accountHtml(`${FACE_COOKIE}=today`)
    const nav = navOf(page, 'account (today cookie)')
    expect(nav).toContain('href="/today"')
    expect(nav).toContain('href="/today/goals"')
    expect(nav).toContain('href="/account"')
    expect(nav, 'leaked a 拦截 href').not.toMatch(/href="\/review"/)
    expect(nav, 'leaked a 渡 href').not.toMatch(/href="\/surf\/review"/)
    expect(page).toContain('class="facename">· 今日</span>')
  })

  it('falls back to 拦截, as before, with no cookie or an unrecognised value', async () => {
    for (const cookie of [undefined, `${FACE_COOKIE}=bogus`, `${FACE_COOKIE}=`]) {
      const page = await accountHtml(cookie)
      const nav = navOf(page, `account (${cookie ?? 'no cookie'})`)
      expect(nav, `${cookie}: href`).toContain('href="/review"')
      expect(nav, `${cookie}: href`).toContain('href="/settings"')
      expect(nav, `${cookie}: href`).toContain('href="/setup"')
      expect(page, `${cookie}: facename`).toContain('class="facename">· 拦截</span>')
    }
  })
})

/**
 * The cookie itself is only ever written by the router, on a page visit that
 * resolves to a real face — `handleAccount` above never sets it, and neither
 * does `handleAdmin`, which is what keeps opening 账号 from cooking its own
 * remembered face right back out from under it.
 */
describe('yixi_face cookie: written by the router, only on real face pages', () => {
  async function signedIn(path: string): Promise<Response> {
    const cookie = await issueCookie(env, user)
    const sessionValue = cookie.split(';')[0]!.slice(COOKIE_NAME.length + 1)
    return await worker.fetch(
      new Request(`${BASE}${path}`, { headers: { Cookie: `${COOKIE_NAME}=${sessionValue}`, 'user-agent': 'x' } }),
      env,
    )
  }

  it('sets yixi_face=surf on /surf/review', async () => {
    const res = await signedIn('/surf/review')
    expect(res.headers.get('set-cookie')).toContain(`${FACE_COOKIE}=surf`)
  })

  it('sets yixi_face=today on /today', async () => {
    const res = await signedIn('/today')
    expect(res.headers.get('set-cookie')).toContain(`${FACE_COOKIE}=today`)
  })

  it('sets yixi_face=breathe on /review', async () => {
    const res = await signedIn('/review')
    expect(res.headers.get('set-cookie')).toContain(`${FACE_COOKIE}=breathe`)
  })

  it('does not set yixi_face on /account itself — that is the whole point', async () => {
    const res = await signedIn('/account')
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('never sets yixi_face on a /gate or /b response', async () => {
    const gate = await worker.fetch(new Request(`${BASE}/gate?app=xhs`), env)
    expect(gate.headers.get('set-cookie')).toBeNull()
    const b = await worker.fetch(new Request(`${BASE}/b`), env)
    expect(b.headers.get('set-cookie')).toBeNull()
  })
})

describe('faceForPath', () => {
  it('maps every 今日 path, segment-aware rather than by prefix', () => {
    expect(faceForPath('/today')).toBe('today')
    expect(faceForPath('/today/goals')).toBe('today')
    expect(faceForPath('/today/review')).toBe('today')
    expect(faceForPath('/today/setup')).toBe('today')
    // Not a prefix match: `/todayx` is a different path, not `/today` with
    // something appended.
    expect(faceForPath('/todayx')).toBeNull()
  })

  it('maps every 渡 path, including /surf itself — the flow page, no header', () => {
    expect(faceForPath('/surf')).toBe('surf')
    expect(faceForPath('/surf/review')).toBe('surf')
    expect(faceForPath('/surf/setup')).toBe('surf')
    expect(faceForPath('/surfing')).toBeNull()
  })

  it('maps the three 拦截 pages, and only those exact paths', () => {
    expect(faceForPath('/review')).toBe('breathe')
    expect(faceForPath('/settings')).toBe('breathe')
    expect(faceForPath('/setup')).toBe('breathe')
  })

  it('answers null for the face-less pages and everything else', () => {
    expect(faceForPath('/account')).toBeNull()
    expect(faceForPath('/admin')).toBeNull()
    expect(faceForPath('/')).toBeNull()
    expect(faceForPath('/gate')).toBeNull()
    expect(faceForPath('/b')).toBeNull()
  })
})

describe('type scale', () => {
  /**
   * 9.5px nav labels shipped for weeks. Nothing was wrong with the code — it was
   * just too small to read on the device this product is only ever used on, and
   * no test has an opinion about that unless one is written down.
   *
   * 11px is Apple's own floor for any text in an iOS interface.
   */
  const FLOOR = 11

  async function everyStylesheet(): Promise<Array<[string, string]>> {
    const out: Array<[string, string]> = [['CONSOLE_CSS', CONSOLE_CSS]]
    const rendered: Array<[string, string]> = []
    for (const name of Object.keys(ALL_PAGES)) rendered.push([name, await html(ALL_PAGES, name)])
    // The two pages with no nav, and so not in ALL_PAGES — which is exactly why
    // the first version of this test missed them. They are the two pages a
    // user sees most: the breathing page every single interception, and the
    // landing page before they have an account.
    rendered.push([
      'breathe',
      await breathePage({
        theme: DEFAULT_THEME,
        label: '小红书',
        waitSeconds: 10,
        sid: 'shot',
        scheme: 'xhsdiscover://',
        farewell: '明天再看',
      }).text(),
    ])
    rendered.push(['landing', await renderLanding(new Request('https://yixi.example/')).text()])
    for (const [name, page] of rendered) {
      const styles = page.match(/<style>([\s\S]*?)<\/style>/g) ?? []
      styles.forEach((s, i) => out.push([`${name} <style> #${i + 1}`, s]))
    }
    return out
  }

  /**
   * px AND rem. The first version of this test only read px, which would have
   * let `font-size:.6rem` — 9.6px, the exact size being fixed here — walk
   * straight past it. The breathing page and the landing page are written
   * almost entirely in rem, so that hole covered the two pages people actually
   * look at most.
   *
   * rem resolves against the ROOT element, which nothing in this project sets,
   * so 1rem is the browser default of 16px.
   */
  const ROOT_PX = 16

  function sizesIn(css: string): Array<[string, number]> {
    const out: Array<[string, number]> = []
    for (const m of css.matchAll(/font-size:\s*([0-9.]+)(px|rem|em)/g)) {
      const n = Number(m[1])
      // `em` is relative to the parent, which this file cannot resolve from
      // the text alone. Every current use is one level inside body-sized prose
      // (inline <code>, which SHOULD scale with its sentence), so it is scored
      // against the root — conservative, since console body is 17px, not 16.
      // A nested em that this under-counts would fail here, not slip through.
      out.push([m[0]!, m[2] === 'px' ? n : n * ROOT_PX])
    }
    return out
  }

  it('renders nothing below 11px on any page, in px or rem', async () => {
    for (const [where, css] of await everyStylesheet()) {
      for (const [text, px] of sizesIn(css)) {
        expect(px, `${where}: ${text}`).toBeGreaterThanOrEqual(FLOOR)
      }
    }
  })

  it('reads darker than the breathing page: console greys are retuned, notes are not faint', () => {
    expect(CONSOLE_CSS).toMatch(/:root\{[^}]*--dim:rgba\(31,28,24,\.70\)/)
    expect(CONSOLE_CSS).toMatch(/:root\{[^}]*--faint:rgba\(31,28,24,\.46\)/)
    expect(CONSOLE_CSS).toMatch(/\.note\{[^}]*color:var\(--dim\)/)
  })

  it('stacks the header into two rows on a phone rather than squeezing one', () => {
    // iPhone 14 (390px): with brand, face name, user, face switch and five tabs
    // on one row, 「一息」 broke across two lines and 「账号」 fell to a third.
    const m = CONSOLE_CSS.match(/@media \(max-width:479px\)\{([\s\S]*?)\n\}/)
    expect(m, 'no narrow-width header rule').toBeTruthy()
    expect(m![1]).toMatch(/header\{[^}]*flex-wrap:wrap/)
    expect(m![1]).toMatch(/header nav\{[^}]*flex-basis:100%/)
    expect(CONSOLE_CSS).toMatch(/\.brand\{[^}]*white-space:nowrap/)
  })

  it('sets body text at 17px, the size iOS itself uses', async () => {
    expect(CONSOLE_CSS).toContain('body{font-size:17px')
  })

  it('keeps every input at 16px, or mobile Safari zooms and never zooms back', async () => {
    // Not a readability rule like the others — this one is load-bearing.
    for (const m of CONSOLE_CSS.matchAll(/input[^{]*\{[^}]*font-size:\s*([0-9.]+)px/g)) {
      expect(Number(m[1]), `input at ${m[1]}px`).toBeGreaterThanOrEqual(16)
    }
  })

  it('keeps row titles in full ink — the fold summary colour must not leak into details.app', () => {
    // The global summary rule in icons.ts (13px, --faint) is for small fold
    // summaries. But details.app > summary on /settings and /today/goals must
    // read in full ink (--fg), not inherit the --faint rule. Check that the CSS
    // includes the override.
    expect(CONSOLE_CSS).toContain('details.app > summary{')
    const detailsSummaryRule = CONSOLE_CSS.match(/details\.app\s*>\s*summary\s*\{[^}]*\}/)?.[0]
    expect(detailsSummaryRule, 'details.app > summary rule exists').toBeTruthy()
    expect(detailsSummaryRule, 'details.app > summary has full ink').toContain('color:var(--fg)')

    // .skey and .mini are secondary labels on collapsed rows, so they should
    // be --dim (medium grey), not --faint (30% ink).
    const skeyRule = CONSOLE_CSS.match(/\.skey\{[^}]*\}/)?.[0]
    expect(skeyRule, '.skey rule exists').toBeTruthy()
    expect(skeyRule, '.skey must not have --faint').not.toContain('var(--faint)')
    expect(skeyRule, '.skey must have --dim').toContain('color:var(--dim)')

    const miniRule = CONSOLE_CSS.match(/\.mini\{[^}]*\}/)?.[0]
    expect(miniRule, '.mini rule exists').toBeTruthy()
    expect(miniRule, '.mini must not have --faint').not.toContain('var(--faint)')
    expect(miniRule, '.mini must have --dim').toContain('color:var(--dim)')
  })
})

/**
 * Which pages a search engine may keep.
 *
 * The whole site used to be noindex, set once in pageHtml and never revisited
 * — including the landing page, the one page whose entire job is to be found
 * by somebody who has never heard of this. Promoting a URL that no crawler is
 * allowed to index means the only traffic it can ever get is traffic that was
 * pushed to it.
 *
 * The invariant now has two halves and this test pins both, because getting
 * only the first half right is how a session URL ends up in a search result:
 * the landing page is indexable, and everything else is not.
 */
describe('what may be indexed', () => {
  const ORIGIN = 'https://yixi.example'

  async function privatePages(): Promise<Array<[string, string]>> {
    const out: Array<[string, string]> = []
    for (const name of Object.keys(ALL_PAGES)) out.push([name, await html(ALL_PAGES, name)])
    out.push([
      'breathe',
      await breathePage({
        theme: DEFAULT_THEME,
        label: '小红书',
        waitSeconds: 10,
        sid: 'shot',
        scheme: 'xhsdiscover://',
        farewell: '明天再看',
      }).text(),
    ])
    out.push(['mock', await renderMock(new Request(`${ORIGIN}/mock?v=1`)).text()])
    out.push([
      'today',
      await (await handleToday(new Request(`${BASE}/today`, { headers: { 'user-agent': 'x' } }), env, user)).text(),
    ])
    out.push(['goals', await (await handleGoals(new Request(`${BASE}/goals`), env, user)).text()])
    return out
  }

  it('keeps noindex on every page that is not the front door', async () => {
    for (const [name, page] of await privatePages()) {
      expect(page, `${name} lost its noindex`).toMatch(
        /<meta name="robots" content="noindex,nofollow">/,
      )
    }
  })

  it('lets the landing page be found', async () => {
    const page = await renderLanding(new Request(`${ORIGIN}/`)).text()
    expect(page).not.toMatch(/name="robots"/)
    expect(page).toMatch(/<meta name="description" content="[^"]{40,}">/)
  })

  it('gives the landing page an entrance into the 今日 face', async () => {
    const page = await renderLanding(new Request(`${ORIGIN}/`)).text()
    expect(page).toContain('href="/today"')
  })

  /**
   * The canonical URL and og:url must come from the request, not a constant.
   * A self-hosted copy that names the public instance as canonical is telling
   * every crawler to credit somebody else's domain with its content — and
   * every self-hoster would ship that bug without ever seeing it.
   */
  it('takes its canonical URL from whoever is being asked', async () => {
    const mine = await renderLanding(new Request('https://breathe.example.org/')).text()
    expect(mine).toContain('<link rel="canonical" href="https://breathe.example.org/">')
    expect(mine).toContain('<meta property="og:url" content="https://breathe.example.org/">')
    expect(mine).not.toContain('yixi-app.pages.dev')
  })

  /**
   * og:* is for pages meant to be shared. A chat client fetches these URLs
   * server-side to build the preview card, so emitting them on a session page
   * would mean a bot opening somebody's breathing session.
   */
  it('offers no unfurl for a private page', async () => {
    for (const [name, page] of await privatePages()) {
      expect(page, `${name} advertises og: tags`).not.toMatch(/property="og:/)
    }
  })
})
