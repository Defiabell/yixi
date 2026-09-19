// The four promises the icon redesign made, asserted against the live pages.
//
// These started life in test/uimock.test.ts, guarding a static before/after
// sheet at /mock-ui. That page has been deleted — its whole purpose was to let
// the owner decide, and the decision is made — but its guards are worth more
// here than they ever were there, because compressing text is exactly the kind
// of edit that quietly loses a sentence:
//
//   1. every icon is inline SVG, and no page loads an external resource,
//   2. no emoji anywhere (they render differently on every device and are the
//      wrong register for this product entirely),
//   3. the three warnings that may be folded but never deleted are still there,
//   4. and the one of those three that must not even be folded is not folded.
//
// (4) is the one worth having. Two of the three warnings are allowed to shrink
// to a visible line plus a fold. The fail-open rule is not: get that condition
// backwards and the tool locks you out of your own phone, and a reader who never
// taps the fold is exactly the reader who inverts it.

import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderSetup } from '../src/ui/setup'
import { handleSettings } from '../src/ui/settings'
import { handleToday } from '../src/ui/today'
import { handleSurf } from '../src/ui/surf'
import { renderSurfReview } from '../src/ui/surfreview'
import { upsertUserApp } from '../src/db'
import type { User } from '../src/types'

const BASE = 'https://yixi.test'
const user: User = { id: 1, name: '张三', is_owner: 0, created_at: Date.now() }
const owner: User = { ...user, id: 1, is_owner: 1 }

async function reset(): Promise<void> {
  await env.DB.batch([env.DB.prepare('DELETE FROM user_apps'), env.DB.prepare('DELETE FROM users')])
  await env.DB.prepare(
    'INSERT INTO users (id, name, token_hash, is_owner, created_at) VALUES (1, ?1, ?2, 0, ?3)',
  )
    .bind('张三', 'hash-icons', Date.now())
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

/** A fetch stand-in, so nothing in this file can reach itunes.apple.com. */
const noNetwork: typeof fetch = (async () => {
  throw new Error('no page in this file should need the App Store')
}) as unknown as typeof fetch

async function setup(): Promise<string> {
  return await (await renderSetup(new Request(`${BASE}/setup?k=deadbeef00112233`), env, user)).text()
}
async function settings(): Promise<string> {
  return await (await handleSettings(new Request(`${BASE}/settings`), env, user)).text()
}
async function today(u: User = user): Promise<string> {
  return await (await handleToday(new Request(`${BASE}/today`, { headers: { 'user-agent': 'x' } }), env, u)).text()
}
/** The 渡 face's flow, GET only — its own step markup carries the orb's SVG. */
async function surf(): Promise<string> {
  return await (await handleSurf(new Request(`${BASE}/surf`, { headers: { 'user-agent': 'x' } }), env, user)).text()
}
/** The 渡 face's 回看 — renders through consoleHeader same as setup/settings/today. */
async function surfreview(): Promise<string> {
  return await (await renderSurfReview(new Request(`${BASE}/surf/review`), env, user)).text()
}

/** Every icon-bearing page, keyed for readable failure messages. */
async function allPages(): Promise<Record<string, string>> {
  return {
    '/setup': await setup(),
    '/settings': await settings(),
    '/surf': await surf(),
    '/surf/review': await surfreview(),
  }
}

/**
 * The page with every `<details>` block removed — i.e. only what a reader sees
 * without tapping anything.
 */
function visibleOnly(html: string): string {
  return html.replace(/<details[\s\S]*?<\/details>/g, '')
}

describe('the icon system', () => {
  it('draws every mark inline and loads no image', async () => {
    for (const [name, html] of Object.entries(await allPages())) {
      expect(html, name).toContain('<svg')
      expect(html, name).not.toContain('<img')
    }
  })

  it('references nothing outside the page as a resource', async () => {
    // Resource-loading attributes only. An <a href> to a scheme collection on
    // GitHub is provenance, and this project insists on it; what the CSP forbids
    // — and what a redesign could break by reaching for an icon font — is a
    // request the page makes on its own.
    const resources = /(?:\bsrc|srcset|xlink:href)\s*=\s*"([^"]*)"/g
    const linkHref = /<link[^>]*\bhref\s*=\s*"([^"]*)"/g
    const cssUrl = /url\(\s*['"]?([^'")]*)/g
    for (const [name, html] of Object.entries(await allPages())) {
      const found: string[] = []
      for (const re of [resources, linkHref, cssUrl]) {
        for (const m of html.matchAll(re)) found.push(m[1] ?? '')
      }
      const external = found.filter((u) => /^(?:https?:)?\/\//i.test(u.trim()))
      expect(external, name).toEqual([])
    }
  })

  it('contains no emoji', async () => {
    // Emoji blocks only. Enclosed numbers (①②③), arrows and math symbols (≠)
    // are deliberately allowed: they are typography this project already uses in
    // prose, not pictographs, and they render identically everywhere.
    const emoji = /[\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{1F000}-\u{1FAFF}]/u
    for (const [name, html] of Object.entries(await allPages())) {
      const hit = html.match(emoji)
      expect(hit, `${name} contains ${hit ? JSON.stringify(hit[0]) : ''}`).toBeNull()
    }
  })

  it('never leaves an icon as the only carrier of meaning without a label', async () => {
    // A decorative icon beside its own words must be hidden from a screen
    // reader, or the label is read twice; an icon standing alone must have one.
    // Either way, no bare <svg class="ic"> may ship.
    for (const [name, html] of Object.entries(await allPages())) {
      const bare = html.match(/<svg class="ic[^"]*" viewBox="0 0 24 24">/g) ?? []
      expect(bare, name).toEqual([])
    }
  })
})

describe('the nav the merge shrank', () => {
  function navOf(html: string): string {
    const m = html.match(/<nav aria-label="导航">([\s\S]*?)<\/nav>/)
    expect(m, 'console nav missing').toBeTruthy()
    return m![1]!
  }

  // The nav that merge shrank has since split into two faces (test/chrome.test.ts
  // §两面 owns the full cross-page shape check); what stays here is the tab
  // count and owner-only tab per face, on the two pages this file already
  // renders.

  it('is four tabs for a normal user and five for the owner, on the 拦截 face', async () => {
    const nav = navOf(await settings())
    expect(nav.match(/<a /g)).toHaveLength(4)

    const ownerNav = navOf(
      await (await handleSettings(new Request(`${BASE}/settings`), env, owner)).text(),
    )
    expect(ownerNav.match(/<a /g)).toHaveLength(5)
    expect(ownerNav).toContain('/admin')
  })

  it('is five tabs on the 今日 face, account included, and no 发号 even for the owner', async () => {
    const nav = navOf(await today())
    expect(nav.match(/<a /g)).toHaveLength(5)

    const ownerNav = navOf(await today(owner))
    expect(ownerNav.match(/<a /g)).toHaveLength(5)
    expect(ownerNav).not.toContain('/admin')
  })

  it('no longer offers 实测 or 候选 as their own tabs, and every tab keeps its word', async () => {
    const breatheNav = navOf(await settings())
    // Three tabs left, all the same mistake: a step of one job given a
    // destination of its own. 「候选」 was the last to go — it is the URL scheme
    // field on /settings now.
    expect(breatheNav).not.toContain('/probe')
    expect(breatheNav).not.toContain('/lookup')
    for (const label of ['回顾', '设置', '怎么配', '账号']) {
      expect(breatheNav, label).toContain(`<span class="lb">${label}</span>`)
    }
    // The current tab is marked for assistive tech, not only with a background.
    expect(breatheNav).toContain('aria-current="page"')

    const todayNav = navOf(await today())
    for (const label of ['今日', '目标', '回看', '怎么配', '账号']) {
      expect(todayNav, label).toContain(`<span class="lb">${label}</span>`)
    }
  })
})

describe('the three warnings that may be folded but never deleted', () => {
  it('1. fail-open — and this one is not even folded', async () => {
    const html = await setup()
    // Both halves of the asymmetry, in the words the protocol actually uses.
    expect(html).toContain('包含')
    expect(html).toContain('https')
    expect(html).toContain('不包含')
    expect(html).toContain('锁在自己手机外面')

    // The override that matters: with every fold collapsed, the argument is
    // still on the screen. A reader who inverts this condition is precisely the
    // reader who never tapped anything.
    const visible = visibleOnly(html)
    expect(visible).toContain('锁在自己手机外面')
    expect(visible).toContain('绝对不能反过来写成')
    expect(visible).toContain('你的 App 正常打开')
    expect(visible).toContain('拿不准就放行')
  })

  it('2. these are candidates; only a real jump counts', async () => {
    // This warning used to live on a page of its own. Folding the picker into
    // the scheme field put it at risk of folding with it — so the claim sits on
    // the field, above the fold, where somebody who never opens the picker
    // still reads it before typing a string they copied from somewhere.
    const page = await settings()

    // `visibleOnly` cannot express this any more: the scheme field itself lives
    // inside the add block's <details>, so stripping every fold strips the
    // field too. What the warning has to survive is the fold it could plausibly
    // have been tucked into — the picker. So: it must appear in the form BEFORE
    // the picker's <details> opens, which is exactly "you read it without
    // going looking for candidates".
    const fieldStart = page.indexOf('class="field scheme"')
    const pickerStart = page.indexOf('<details class="pickwrap"')
    expect(fieldStart, 'scheme field missing').toBeGreaterThan(-1)
    expect(pickerStart, 'picker missing').toBeGreaterThan(fieldStart)
    const beforeThePicker = page.slice(fieldStart, pickerStart)

    expect(beforeThePicker).toContain('没验证过')
    expect(beforeThePicker).toContain('试跳')

    // The ordering rule — try it, THEN save it — is on the buttons, which are
    // rendered client-side now. It has to survive in the renderer.
    const script = page.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? ''
    expect(script).toContain('<span class="ord">1</span>')
    expect(script).toContain('<span class="ord">2</span>')
    expect(script.indexOf("class=\"ctry\"")).toBeLessThan(script.indexOf("class=\"cuse\""))
  })

  it('3. too short a grace window intercepts you the moment you land', async () => {
    const visible = visibleOnly(await settings())
    expect(visible).toContain('又被拦')
    expect(visible).toContain('90')
  })
})
