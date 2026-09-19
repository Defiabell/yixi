// /surf/setup — editing the trigger chips /surf's step 0 offers, plus the
// entry-point instructions (home screen, Shortcuts/Siri). Plain POST/303,
// zero client JS, same idiom as settings.ts's own form.

import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { handleSurfSetup } from '../src/ui/surfsetup'
import { DEFAULT_SURF_TRIGGERS, SURF_TRIGGER_LEN, SURF_TRIGGER_MAX } from '../src/types'
import type { User } from '../src/types'

const BASE = 'https://yixi.example.workers.dev'
const user: User = { id: 1, name: '张三', is_owner: 0, created_at: 0 }

async function reset(): Promise<void> {
  await env.DB.batch([env.DB.prepare('DELETE FROM urges'), env.DB.prepare('DELETE FROM users')])
  await env.DB.prepare(
    "INSERT INTO users (id, name, token_hash, is_owner, created_at) VALUES (1, '张三', 'h1', 0, 0)",
  ).run()
}
beforeEach(reset)

function get(u: User = user): Promise<Response> {
  return handleSurfSetup(new Request(`${BASE}/surf/setup`), env, u)
}
async function html(u: User = user): Promise<string> {
  return await (await get(u)).text()
}
function post(triggers: string, u: User = user): Promise<Response> {
  return handleSurfSetup(
    new Request(`${BASE}/surf/setup`, { method: 'POST', body: new URLSearchParams({ triggers }) }),
    env,
    u,
  )
}
function mainOf(h: string): string {
  const m = h.match(/<main>([\s\S]*?)<\/main>/)
  expect(m, 'no <main> found').toBeTruthy()
  return m![0]
}
async function storedTriggers(): Promise<string | null> {
  const row = await env.DB.prepare('SELECT surf_triggers FROM users WHERE id = ?1').bind(1).first<{
    surf_triggers: string | null
  }>()
  return row?.surf_triggers ?? null
}

describe('GET', () => {
  it('prefills the textarea with the four built-in triggers, one per line, when the account has none of its own', async () => {
    const h = await html()
    const expected = DEFAULT_SURF_TRIGGERS.join('\n')
    expect(h).toContain(`<textarea id="triggers" name="triggers" rows="8">${expected}</textarea>`)
  })

  it("prefills with the account's own raw column, verbatim, when it has one", async () => {
    const h = await html({ ...user, surf_triggers: 'a\n\nb\nb' })
    // Byte for byte, including the blank line and the repeat: this is the raw
    // column, not `surfTriggers()`'s already-deduped read view — re-saving an
    // untouched form must round-trip exactly, not silently clean it up first.
    expect(h).toContain('<textarea id="triggers" name="triggers" rows="8">a\n\nb\nb</textarea>')
  })

  it('escapes a stored trigger that carries markup, rather than rendering it as a tag', async () => {
    const h = await html({ ...user, surf_triggers: '<b>bad</b>' })
    expect(h).toContain('&lt;b&gt;bad&lt;/b&gt;')
    expect(h).not.toContain('<b>bad</b>')
  })

  it('names the request origin in the Shortcuts paragraph, and never renders a token', async () => {
    const h = await html()
    expect(h).toContain(`${BASE}/surf?k=`)
    expect(h).toContain('<a href="/account">')
    // The account's token never has a place to come from in this render path
    // (no `?k=` on the request, nothing in `User` carries one) — this only
    // pins the intent: the literal placeholder, never a real value.
    expect(h).toContain('你的令牌')
  })

  it('marks 渡 · 怎么配 as the current tab', async () => {
    const h = await html()
    expect(h).toMatch(/<a href="\/surf\/setup" class="on" aria-current="page"/)
  })

  it('stays calm — no exclamation marks in the copy', async () => {
    const main = mainOf(await html())
    expect(main).not.toContain('!')
    expect(main).not.toContain('！')
  })
})

describe('POST', () => {
  it('splits on newlines, trims, drops blanks, de-duplicates, and stores the result joined by \\n', async () => {
    const res = await post('  躺床上刷手机  \n\n躺床上刷手机\n新引子\n  \n新引子2')
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/surf/setup')
    expect(await storedTriggers()).toBe('躺床上刷手机\n新引子\n新引子2')
  })

  it(`refuses more than ${SURF_TRIGGER_MAX} distinct lines`, async () => {
    const lines = Array.from({ length: SURF_TRIGGER_MAX + 1 }, (_, i) => `引子${i}`)
    const res = await post(lines.join('\n'))
    expect(res.status).toBe(400)
    expect(await storedTriggers()).toBeNull()
  })

  it('accepts exactly the maximum number of lines', async () => {
    const lines = Array.from({ length: SURF_TRIGGER_MAX }, (_, i) => `引子${i}`)
    const res = await post(lines.join('\n'))
    expect(res.status).toBe(303)
    expect(await storedTriggers()).toBe(lines.join('\n'))
  })

  it(`refuses a line longer than ${SURF_TRIGGER_LEN} characters`, async () => {
    const tooLong = 'x'.repeat(SURF_TRIGGER_LEN + 1)
    const res = await post(tooLong)
    expect(res.status).toBe(400)
    expect(await storedTriggers()).toBeNull()
  })

  it(`accepts a line exactly ${SURF_TRIGGER_LEN} characters long`, async () => {
    const justRight = 'x'.repeat(SURF_TRIGGER_LEN)
    const res = await post(justRight)
    expect(res.status).toBe(303)
    expect(await storedTriggers()).toBe(justRight)
  })

  it('clears the column back to NULL (the built-in four) when the content is empty or all blank lines', async () => {
    await env.DB.prepare('UPDATE users SET surf_triggers = ?2 WHERE id = ?1').bind(1, '之前的自定义').run()
    const res = await post('\n   \n\n')
    expect(res.status).toBe(303)
    expect(await storedTriggers()).toBeNull()
  })

  it("does not let one account's save touch another account's row", async () => {
    await env.DB.prepare(
      "INSERT INTO users (id, name, token_hash, is_owner, created_at) VALUES (2, '李四', 'h2', 0, 0)",
    ).run()
    await post('仅李四的引子', { id: 2, name: '李四', is_owner: 0, created_at: 0 })
    expect(await storedTriggers()).toBeNull()
    const row = await env.DB.prepare('SELECT surf_triggers FROM users WHERE id = 2').first<{
      surf_triggers: string | null
    }>()
    expect(row?.surf_triggers).toBe('仅李四的引子')
  })

  it('rejects a request with no form body', async () => {
    const res = await handleSurfSetup(
      new Request(`${BASE}/surf/setup`, { method: 'POST', body: 'not a form', headers: { 'content-type': 'application/json' } }),
      env,
      user,
    )
    expect(res.status).toBe(400)
  })
})

describe('method handling', () => {
  it('answers anything else with 405', async () => {
    const res = await handleSurfSetup(new Request(`${BASE}/surf/setup`, { method: 'DELETE' }), env, user)
    expect(res.status).toBe(405)
  })
})
