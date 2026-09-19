import { env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { expiredPage, renderBreathe, safeScheme } from '../src/ui/breathe'
import { renderMock } from '../src/ui/mock'
import { renderLanding } from '../src/ui/landing'
import { DEFAULT_THEME } from '../src/ui/layout'
import { SESSION_TTL_MS } from '../src/types'

/**
 * The breathing page is the whole product surface, so these tests guard three
 * different kinds of thing:
 *
 *   - the Safari gesture-stack contract (proceed must jump synchronously),
 *   - the deliberate psychology (no numbers, 算了 first and louder),
 *   - the "opens instantly on a bad connection" rule (nothing external).
 *
 * The first one is the reason this file exists. If a future refactor turns the
 * proceed handler into `await fetch(...)` everything still looks fine locally
 * and the product silently stops working on the only device it targets.
 */

let userId = 0

beforeAll(async () => {
  const res = await env.DB.prepare(
    'INSERT INTO users (name, token_hash, is_owner, created_at) VALUES (?1, ?2, 0, ?3)',
  )
    .bind('tester', 'hash-breathe-tests', Date.now())
    .run()
  userId = Number(res.meta.last_row_id)
})

let n = 0
function nextSid(): string {
  return 'sid-' + ++n + '-' + Math.random().toString(36).slice(2)
}

async function seedApp(app: string, label: string, scheme: string, wait = 10): Promise<void> {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO user_apps (user_id, app, label, scheme, wait_seconds, grace_seconds, enabled)
     VALUES (?1, ?2, ?3, ?4, ?5, 90, 1)`,
  )
    .bind(userId, app, label, scheme, wait)
    .run()
}

async function seedSession(
  app: string,
  opts: { createdAt?: number; resolvedAt?: number | null } = {},
): Promise<string> {
  const sid = nextSid()
  await env.DB.prepare(
    'INSERT INTO sessions (sid, user_id, app, created_at, resolved_at) VALUES (?1, ?2, ?3, ?4, ?5)',
  )
    .bind(sid, userId, app, opts.createdAt ?? Date.now(), opts.resolvedAt ?? null)
    .run()
  return sid
}

function get(path: string): Request {
  return new Request('https://yixi.example' + path)
}

/** The page's config island: what the inline script actually runs on. */
function configOf(html: string): Record<string, unknown> {
  const m = html.match(/<script type="application\/json" id="cfg">([\s\S]*?)<\/script>/)
  expect(m, 'config island missing').toBeTruthy()
  return JSON.parse(m![1]!) as Record<string, unknown>
}

/** The inline behaviour script (the one without a type attribute). */
function scriptOf(html: string): string {
  const m = html.match(/<script>([\s\S]*?)<\/script>/)
  expect(m, 'inline script missing').toBeTruthy()
  return m![1]!
}

/**
 * Strips comments so that assertions about the code are about the code. The
 * script deliberately carries a comment warning never to `await` before the
 * scheme jump; a naive search for that word would be satisfied by the warning
 * itself and would go green on exactly the bug it exists to catch.
 * The `[^:]` guard keeps `https://` from being read as a line comment.
 */
function codeOnly(js: string): string {
  return js.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** A session row with a fixed sid, bypassing nextSid()'s randomness — the
 * byte-identity guard below needs every input to be deterministic, since the
 * sid itself ends up in the rendered config island and (via pickFarewell)
 * picks which farewell line is shown. */
async function seedFixedSession(sid: string, app: string): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO sessions (sid, user_id, app, created_at, resolved_at) VALUES (?1, ?2, ?3, ?4, NULL)',
  )
    .bind(sid, userId, app, Date.now())
    .run()
}

/** SHA-256 hex digest — Web Crypto is available in workerd. */
async function sha256(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Pins the exact bytes /b and expiredPage() emit, hashed with SHA-256. The
 * hex constants below were captured against breathe.ts before the orb
 * markup and its CSS moved out to src/ui/breathing.ts (orbHtml()/ORB_CSS);
 * this test must keep passing, unchanged, after that extraction. A refactor
 * that reorders a CSS rule, drops a newline, or changes an attribute is
 * exactly the kind of change every other assertion in this file (all
 * substring/regex checks) would miss — this is the one guard that cannot.
 */
describe('breathing extraction is byte-identical', () => {
  it('/b renders the same bytes as before the orb moved to breathing.ts', async () => {
    await seedApp('hashguard', '守卫应用', 'guardscheme://', 12)
    const sid = 'sid-hash-guard-fixed'
    await seedFixedSession(sid, 'hashguard')
    const html = await (await renderBreathe(get('/b?s=' + sid), env)).text()
    expect(await sha256(html)).toBe('4be79047af5bded7c6c498c49fbe4367cb56bc9f8b6f76bf0fa05208b990f750')
  })

  it('expiredPage() renders the same bytes as before the orb moved to breathing.ts', async () => {
    const html = await expiredPage(DEFAULT_THEME, 'zh', 410).text()
    expect(await sha256(html)).toBe('b37f135e829094c3c5ad93a2da15be75a6679970e7da4e97090e7753892e0999')
  })
})

describe('/b renders the wait', () => {
  it('shows the app, the breath and a ring', async () => {
    await seedApp('xhs', '小红书', 'xhsdiscover://')
    const sid = await seedSession('xhs')

    const res = await renderBreathe(get('/b?s=' + sid), env)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(res.headers.get('cache-control')).toBe('no-store')

    const html = await res.text()
    expect(html).toContain('小红书')
    expect(html).toContain('吸气')
    expect(html).toContain('id="ring"')
    expect(html).toContain('算了')
    expect(html).toContain('继续打开')

    const cfg = configOf(html)
    expect(cfg.sid).toBe(sid)
    expect(cfg.scheme).toBe('xhsdiscover://')
    expect(cfg.wait).toBe(10)
    // 4s in, 6s out — the longer exhale is the point.
    expect(cfg.inhale).toBe(4000)
    expect(cfg.exhale).toBe(6000)
  })

  it('hides both buttons during the countdown', async () => {
    await seedApp('xhs', '小红书', 'xhsdiscover://')
    const sid = await seedSession('xhs')
    const html = await (await renderBreathe(get('/b?s=' + sid), env)).text()

    expect(html).toMatch(/<button[^>]*id="stop"[^>]*hidden>/)
    expect(html).toMatch(/<button[^>]*id="go"[^>]*hidden>/)
    expect(html).toContain('body[data-state="wait"] .actions{visibility:hidden}')
  })

  it('shows progress as a ring, never as a number', async () => {
    await seedApp('xhs', '小红书', 'xhsdiscover://')
    const sid = await seedSession('xhs')
    const js = scriptOf(await (await renderBreathe(get('/b?s=' + sid), env)).text())

    expect(js).toContain('strokeDashoffset')
    // Nothing may render a remaining-seconds figure: watching a number tick
    // down is exactly the attention trap this page exists to interrupt.
    expect(js).not.toMatch(/Math\.ceil|Math\.floor|toFixed\(0\)|秒/)
  })

  it('falls back to something usable when the app row is gone', async () => {
    const sid = await seedSession('deleted-app')
    const res = await renderBreathe(get('/b?s=' + sid), env)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('deleted-app')
    expect(configOf(html).scheme).toBe('')
  })
})

describe('proceed stays inside the Safari gesture stack', () => {
  let js = ''
  /** The same script with comments removed — see codeOnly(). */
  let code = ''

  beforeAll(async () => {
    await seedApp('xhs', '小红书', 'xhsdiscover://')
    const sid = await seedSession('xhs')
    js = scriptOf(await (await renderBreathe(get('/b?s=' + sid), env)).text())
    code = codeOnly(js)
  })

  it('never awaits anywhere in the page script', () => {
    // A single `await` before the jump is enough to break the product: Safari
    // drops a custom-scheme navigation that is not in the gesture's own stack.
    expect(code).not.toMatch(/\bawait\b/)
    expect(code).not.toMatch(/\basync\b/)
  })

  it('reports with sendBeacon and jumps on the very next statement', () => {
    const start = code.indexOf("report('proceed')")
    const jump = code.indexOf('location.href=SCHEME')
    expect(start).toBeGreaterThan(-1)
    expect(jump).toBeGreaterThan(start)

    const between = code.slice(start, jump)
    expect(between).not.toMatch(/await|\.then\(|setTimeout|Promise|requestAnimationFrame/)
  })

  it('falls back to a non-awaited keepalive fetch when sendBeacon is missing', () => {
    expect(js).toContain("navigator.sendBeacon('/resolve',payload)")
    expect(js).toMatch(/fetch\('\/resolve',\{method:'POST',body:payload,keepalive:true\}\)/)
  })

  it('reports abandon too', () => {
    expect(js).toContain("report('abandon')")
  })
})

describe('the exit is the default path', () => {
  let html = ''

  beforeAll(async () => {
    await seedApp('xhs', '小红书', 'xhsdiscover://')
    const sid = await seedSession('xhs')
    html = await (await renderBreathe(get('/b?s=' + sid), env)).text()
  })

  it('offers 算了 first and 继续 only 800ms later', () => {
    const js = scriptOf(html)
    const stopAt = js.indexOf('show(stop)')
    const goAt = js.indexOf('show(go)')
    expect(stopAt).toBeGreaterThan(-1)
    expect(goAt).toBeGreaterThan(stopAt)
    expect(js).toMatch(/setTimeout\(function\(\)\{show\(go\)\},800\)/)
  })

  it('gives 算了 the loud treatment and 继续 the quiet one', () => {
    // 算了 is a filled pill; 继续 is a small underlined link. Balancing these
    // two would quietly undo the whole design.
    expect(html).toMatch(/\.stop\{[^}]*background:var\(--stop-bg\)/)
    expect(html).toMatch(/\.go\{[^}]*text-decoration:underline/)
    expect(html).not.toMatch(/\.go\{[^}]*background:var\(--stop-bg\)/)
  })

  it('puts 算了 before 继续 in the document', () => {
    expect(html.indexOf('算了')).toBeLessThan(html.indexOf('继续打开'))
  })
})

describe('dead links stay quiet', () => {
  it('does not 500 on a missing sid', async () => {
    const res = await renderBreathe(get('/b'), env)
    expect(res.status).toBe(400)
    expect(await res.text()).toContain('这个链接过期了')
  })

  it('404s an unknown sid', async () => {
    const res = await renderBreathe(get('/b?s=nope-nope-nope'), env)
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('这个链接过期了')
  })

  it('410s a session that was already resolved', async () => {
    await seedApp('xhs', '小红书', 'xhsdiscover://')
    const sid = await seedSession('xhs', { resolvedAt: Date.now() })
    const res = await renderBreathe(get('/b?s=' + sid), env)
    expect(res.status).toBe(410)
    expect(await res.text()).toContain('这个链接过期了')
  })

  it('410s a session older than the TTL', async () => {
    await seedApp('xhs', '小红书', 'xhsdiscover://')
    const sid = await seedSession('xhs', { createdAt: Date.now() - SESSION_TTL_MS - 1000 })
    const res = await renderBreathe(get('/b?s=' + sid), env)
    expect(res.status).toBe(410)
  })

  it('renders a session that is just inside the TTL', async () => {
    await seedApp('xhs', '小红书', 'xhsdiscover://')
    const sid = await seedSession('xhs', { createdAt: Date.now() - SESSION_TTL_MS + 5000 })
    expect((await renderBreathe(get('/b?s=' + sid), env)).status).toBe(200)
  })
})

describe('user-supplied label and scheme cannot become code', () => {
  it('escapes a hostile label', async () => {
    await seedApp('evil', '<img src=x onerror=alert(1)>', 'xhsdiscover://')
    const sid = await seedSession('evil')
    const html = await (await renderBreathe(get('/b?s=' + sid), env)).text()

    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x')
    // …and it must not escape through the JSON island either.
    expect(html).not.toMatch(/<script type="application\/json" id="cfg">[^<]*<img/)
  })

  it('drops a javascript: scheme instead of handing it to location.href', () => {
    expect(safeScheme('javascript:alert(1)')).toBe('')
    expect(safeScheme('JavaScript:alert(1)')).toBe('')
    expect(safeScheme('data:text/html,x')).toBe('')
    expect(safeScheme('xhs discover://')).toBe('')
    expect(safeScheme('not-a-scheme')).toBe('')
    expect(safeScheme('xhsdiscover://')).toBe('xhsdiscover://')
    expect(safeScheme('  weibointernational://  ')).toBe('weibointernational://')
  })

  it('leaves the page with an empty scheme rather than a live one', async () => {
    await seedApp('evil2', '坏蛋', 'javascript:alert(1)')
    const sid = await seedSession('evil2')
    const html = await (await renderBreathe(get('/b?s=' + sid), env)).text()
    expect(configOf(html).scheme).toBe('')
    expect(html).not.toContain('alert(1)')
  })
})

describe('nothing is fetched from anywhere', () => {
  it('inlines everything on /b', async () => {
    await seedApp('xhs', '小红书', 'xhsdiscover://')
    const sid = await seedSession('xhs')
    assertSelfContained(await (await renderBreathe(get('/b?s=' + sid), env)).text())
  })

  it('inlines everything on /mock and /', async () => {
    assertSelfContained(await renderMock(new Request('https://yixi.example/mock?v=1')).text())
    assertSelfContained(await renderLanding(new Request('https://yixi.example/')).text())
  })
})

/**
 * The rule is that the page makes no request of its own — not that no URL may
 * appear in it.
 *
 * The blunt version banned every `https://` in the markup, which held only
 * while no page had a reason to link anywhere. The landing page now points at
 * the source repository, which is a link a reader may choose to follow, not a
 * resource the browser fetches on load. `test/icons.test.ts` already drew this
 * line correctly for provenance links; banning the substring here would have
 * meant deleting the link rather than the guard, which is the wrong thing to
 * delete.
 *
 * So: resource-loading attributes only, plus the CSS entry points. An <a href>
 * is fine; a <script src>, a stylesheet <link>, an @import, an <img src> or a
 * non-data url() is not.
 */
function assertSelfContained(html: string): void {
  expect(html).not.toMatch(/<script[^>]+\ssrc=/)
  expect(html).not.toMatch(/<link[^>]+stylesheet/)
  expect(html).not.toMatch(/@import/)
  // The only url() allowed would be a data: URI; today there are none at all.
  expect(html).not.toMatch(/url\((?!['"]?data:)/)

  // Every attribute that makes the browser go and get something, and every
  // <link> whatever its rel — a preload or prefetch is a request too.
  for (const m of html.matchAll(/\b(?:src|srcset|xlink:href|poster|data)\s*=\s*"([^"]*)"/g)) {
    expect(m[1], `loads ${m[0]}`).not.toMatch(/^(?:https?:)?\/\//)
  }
  for (const m of html.matchAll(/<link[^>]*>/g)) {
    const tag = m[0]
    const href = tag.match(/\bhref\s*=\s*"([^"]*)"/)?.[1]
    if (href === undefined) continue
    // rel="canonical" is the one <link> that names a URL without asking the
    // browser to go and get it — it is a declaration about this page's own
    // address, and on an indexable page it is necessarily absolute. Same
    // distinction the <a href> rule below draws: a resource is banned, a
    // statement about where something lives is not. Every other rel, preload
    // and prefetch included, still has to be local.
    if (/\brel\s*=\s*"canonical"/.test(tag)) continue
    expect(href, `<link> to ${href}`).not.toMatch(/^(?:https?:)?\/\//)
  }

  // And an <a> may only go somewhere a person chose to go: no javascript:, and
  // nothing that could be mistaken for a resource.
  for (const m of html.matchAll(/<a[^>]*\bhref\s*=\s*"([^"]*)"/g)) {
    expect(m[1], `<a href> to ${m[1]}`).not.toMatch(/^javascript:/i)
  }
}

describe('/mock previews both looks without a session', () => {
  it('serves 墨 for v=1 and 息 for v=2', async () => {
    const one = await renderMock(new Request('https://yixi.example/mock?v=1')).text()
    const two = await renderMock(new Request('https://yixi.example/mock?v=2')).text()

    expect(one).toContain('class="t-ink"')
    expect(two).toContain('class="t-breath"')
    // Same page, two skins: the JS must be byte-identical.
    expect(scriptOf(one)).toBe(scriptOf(two))
  })

  it('never reports, because there is no session to report', async () => {
    const html = await renderMock(new Request('https://yixi.example/mock?v=2')).text()
    const cfg = configOf(html)
    expect(cfg.sid).toBeNull()
    expect(cfg.scheme).toBe('')
    expect(html).toContain('/mock?v=1')
    expect(html).toContain('/mock?v=2')
  })

  it('accepts a shorter wait and a different label for iterating', async () => {
    const html = await renderMock(
      new Request('https://yixi.example/mock?v=1&wait=3&label=微博'),
    ).text()
    const cfg = configOf(html)
    expect(cfg.wait).toBe(3)
    expect(html).toContain('微博')
  })

  it('clamps nonsense parameters', async () => {
    const cfg = configOf(
      await renderMock(new Request('https://yixi.example/mock?v=9&wait=-99&label=')).text(),
    )
    expect(cfg.wait).toBe(0)
  })
})

describe('/ explains itself', () => {
  it('renders and points at both previews', async () => {
    const res = renderLanding(new Request('https://yixi.example/'))
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('一息')
    expect(html).toContain('/mock?v=1')
    expect(html).toContain('/mock?v=2')
    // No sign-up: tokens are handed out by hand, so there is nothing to submit.
    expect(html).not.toMatch(/<form|<input/)
  })
})
