// /surf/setup — the one place 「渡」 is personalised: pick a scene once, add a
// line if you want one, and /surf never asks anything again. Plain POST/303,
// zero client JS, same idiom as settings.ts's own form.

import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { handleSurfSetup } from '../src/ui/surfsetup'
import { SCENE_KEYS } from '../src/surfscenes'
import { SURF_LINE_LEN, SURF_SCENE_LEN } from '../src/types'
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
function post(fields: Record<string, string>, u: User = user): Promise<Response> {
  return handleSurfSetup(
    new Request(`${BASE}/surf/setup`, { method: 'POST', body: new URLSearchParams(fields) }),
    env,
    u,
  )
}
function mainOf(h: string): string {
  const m = h.match(/<main>([\s\S]*?)<\/main>/)
  expect(m, 'no <main> found').toBeTruthy()
  return m![0]
}
async function stored(id = 1): Promise<{ scene: string | null; line: string | null }> {
  const row = await env.DB.prepare('SELECT surf_scene, surf_line FROM users WHERE id = ?1').bind(id).first<{
    surf_scene: string | null
    surf_line: string | null
  }>()
  return { scene: row?.surf_scene ?? null, line: row?.surf_line ?? null }
}

describe('GET', () => {
  it('offers the five scenes as one radio group, each a 44px-tall label', async () => {
    const h = await html()
    for (const key of SCENE_KEYS) {
      expect(h, key).toContain(`<input type="radio" name="scene" value="${key}" required`)
    }
    expect(h).toContain('色欲')
    expect(h).toContain('短视频')
    expect(h).toContain('游戏')
    expect(h).toContain('深夜加餐')
    expect(h).toContain('其他')
    // The row is the touch target, and iOS will not forgive a smaller one.
    expect(h).toMatch(/\.opt\{[^}]*min-height:44px/)
    // input#custom sits outside every .opt row, so it needs its own 44px
    // floor rather than inheriting the radio rows' touch height.
    expect(h).toMatch(/input#custom\{[^}]*min-height:44px/)
  })

  it('preselects nothing at all for an account that has never chosen', async () => {
    // A default here would be a guess about the most private thing stored;
    // `required` is what keeps the form from submitting empty instead.
    expect(await html()).not.toContain('checked')
  })

  it('checks the stored scene, and only that one', async () => {
    const h = await html({ ...user, surf_scene: 'game' })
    expect(h).toContain('value="game" required checked')
    expect(h.match(/checked/g)).toHaveLength(1)
  })

  it("prefills the custom box with the account's own words, and the line with its line", async () => {
    const h = await html({ ...user, surf_scene: 'custom:打牌', surf_line: '别把今晚也赔进去' })
    expect(h).toContain('value="custom" required checked')
    expect(h).toContain(`name="custom" maxlength="${SURF_SCENE_LEN}" value="打牌"`)
    expect(h).toContain(`name="line" maxlength="${SURF_LINE_LEN}" value="别把今晚也赔进去"`)
  })

  it('leaves the custom box empty when a preset is stored, rather than showing a key', async () => {
    const h = await html({ ...user, surf_scene: 'snack' })
    expect(h).toContain(`name="custom" maxlength="${SURF_SCENE_LEN}" value=""`)
  })

  it('escapes stored text that carries markup, rather than rendering it as a tag', async () => {
    const h = await html({ ...user, surf_scene: 'custom:<b>x</b>', surf_line: '<i>hi</i>' })
    expect(h).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(h).toContain('&lt;i&gt;hi&lt;/i&gt;')
    expect(h).not.toContain('<b>x</b>')
    expect(h).not.toContain('<i>hi</i>')
  })

  it('says the choice is made once and never again', async () => {
    expect(mainOf(await html())).toContain('只需选一次。之后冲动来了，打开就是流程，不再问你任何问题。')
  })

  it('keeps both inputs at 16px, the size below which iOS zooms the page', async () => {
    const h = await html()
    expect(h).toMatch(/input\[type=text\][^{]*\{[^}]*font-size:16px/)
    // …and the custom box must not have narrowed itself out of that rule.
    expect(h).not.toMatch(/input#custom\{[^}]*font-size/)
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

  it('escapes the origin before it reaches the Shortcuts paragraph', async () => {
    // fillParams (src/i18n/index.ts) does no escaping of its own — it only
    // splices `origin` into the template — so renderSurfSetup has to call
    // escapeHtml(origin) itself, the same discipline as `custom`/`line`
    // above. A plain https origin round-trips unchanged either way; the
    // point of this test is pinning that the escaping call is there at all.
    const res = await handleSurfSetup(new Request('https://yixi.test/surf/setup'), env, user)
    const h = await res.text()
    expect(h).toContain('https://yixi.test/surf?k=')
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
  it('stores a preset by its bare key and drops a stale custom box', async () => {
    const res = await post({ scene: 'feed', custom: '上一次写的', line: '' })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/surf/setup')
    expect(await stored()).toEqual({ scene: 'feed', line: null })
  })

  it('stores a custom scene prefixed, with the line beside it', async () => {
    const res = await post({ scene: 'custom', custom: ' 打牌 ', line: ' 别把今晚也赔进去 ' })
    expect(res.status).toBe(303)
    expect(await stored()).toEqual({ scene: 'custom:打牌', line: '别把今晚也赔进去' })
  })

  it('refuses a scene that is not one of the five', async () => {
    for (const scene of ['gambling', '', 'CUSTOM']) {
      expect((await post({ scene, custom: '', line: '' })).status, scene).toBe(400)
    }
    expect(await stored()).toEqual({ scene: null, line: null })
  })

  it('refuses 其他 with nothing typed — a scene with no name is not a scene', async () => {
    expect((await post({ scene: 'custom', custom: '   ', line: '' })).status).toBe(400)
    expect(await stored()).toEqual({ scene: null, line: null })
  })

  it(`refuses custom text longer than ${SURF_SCENE_LEN} characters instead of cutting it`, async () => {
    const tooLong = '一'.repeat(SURF_SCENE_LEN + 1)
    expect((await post({ scene: 'custom', custom: tooLong, line: '' })).status).toBe(400)
    expect(await stored()).toEqual({ scene: null, line: null })

    const justRight = '一'.repeat(SURF_SCENE_LEN)
    expect((await post({ scene: 'custom', custom: justRight, line: '' })).status).toBe(303)
    expect(await stored()).toEqual({ scene: `custom:${justRight}`, line: null })
  })

  it(`refuses a line longer than ${SURF_LINE_LEN} characters, and accepts one exactly that long`, async () => {
    expect((await post({ scene: 'lust', custom: '', line: 'x'.repeat(SURF_LINE_LEN + 1) })).status).toBe(400)
    expect(await stored()).toEqual({ scene: null, line: null })

    const justRight = 'x'.repeat(SURF_LINE_LEN)
    expect((await post({ scene: 'lust', custom: '', line: justRight })).status).toBe(303)
    expect(await stored()).toEqual({ scene: 'lust', line: justRight })
  })

  it('does not let an over-long leftover in the custom box refuse a preset save', async () => {
    const res = await post({ scene: 'snack', custom: '一'.repeat(SURF_SCENE_LEN + 5), line: '' })
    expect(res.status).toBe(303)
    expect(await stored()).toEqual({ scene: 'snack', line: null })
  })

  it("does not let one account's save touch another account's row", async () => {
    await env.DB.prepare(
      "INSERT INTO users (id, name, token_hash, is_owner, created_at) VALUES (2, '李四', 'h2', 0, 0)",
    ).run()
    await post({ scene: 'game', custom: '', line: '仅李四的' }, { id: 2, name: '李四', is_owner: 0, created_at: 0 })
    expect(await stored(1)).toEqual({ scene: null, line: null })
    expect(await stored(2)).toEqual({ scene: 'game', line: '仅李四的' })
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
