// /surf — the ten-minute flow. One server-rendered page whose five steps are
// switched client-side, plus the POST contract the page's own script speaks.
//
// The script assertions at the bottom are the load-bearing ones: `round`,
// `finish` and `note` all fire from a page that is about to be closed or
// backgrounded, so they go out through sendBeacon and must never be awaited
// (CONTRIBUTING §2). The comments in the script itself name `await`, so the
// test strips comments before grepping — the same technique as
// test/breathe.test.ts, which learned it the hard way.

import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { farewellLines, handleSurf } from '../src/ui/surf'
import { getUrge, listUrgesSince } from '../src/urges'
import { shanghaiDate } from '../src/db'
import { translator } from '../src/i18n'
import type { Urge, User } from '../src/types'
import { DEFAULT_SURF_TRIGGERS } from '../src/types'

const user: User = { id: 1, name: '张三', is_owner: 0, created_at: 0 }
const other: User = { id: 2, name: '李四', is_owner: 0, created_at: 0 }
const NOW = Date.now()
const TODAY = shanghaiDate(NOW)
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'

async function reset(): Promise<void> {
  await env.DB.batch([env.DB.prepare('DELETE FROM urges'), env.DB.prepare('DELETE FROM users')])
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, name, token_hash, is_owner, created_at) VALUES (1, '张三', 'h1', 0, 0)"),
    env.DB.prepare("INSERT INTO users (id, name, token_hash, is_owner, created_at) VALUES (2, '李四', 'h2', 0, 0)"),
  ])
}
beforeEach(reset)

function get(u: User = user, headers: Record<string, string> = {}): Promise<Response> {
  return handleSurf(new Request('https://yixi.test/surf', { headers }), env, u)
}
async function html(u: User = user, headers: Record<string, string> = {}): Promise<string> {
  return await (await get(u, headers)).text()
}
function post(fields: Record<string, string>, u: User = user): Promise<Response> {
  return handleSurf(
    new Request('https://yixi.test/surf', { method: 'POST', body: new URLSearchParams(fields) }),
    env,
    u,
  )
}
/** The same POST the page's own script sends: identical body, plus the marker header. */
function postFetch(fields: Record<string, string>, u: User = user): Promise<Response> {
  return handleSurf(
    new Request('https://yixi.test/surf', {
      method: 'POST',
      body: new URLSearchParams(fields),
      headers: { 'x-yixi': 'fetch' },
    }),
    env,
    u,
  )
}
async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>
}
function scriptOf(h: string): string {
  const m = h.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)
  expect(m, 'inline script missing').toBeTruthy()
  return m![1]!
}
function stripComments(js: string): string {
  return js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}
/**
 * The `{ … }` block starting at the first brace at or after `from`, brace
 * matched. Good enough for this script, which has no brace inside any string
 * literal; it throws loudly rather than returning something plausible if that
 * ever stops being true.
 */
function blockAfter(src: string, from: number): string {
  const open = src.indexOf('{', from)
  expect(open, 'no block here').toBeGreaterThan(-1)
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return src.slice(open + 1, i)
    }
  }
  throw new Error('unbalanced braces in the page script')
}
/** The body of one top-level `function name(...)` in the page script. */
function fnBody(js: string, name: string): string {
  const at = js.indexOf(`function ${name}(`)
  expect(at, `function ${name}() missing from the page script`).toBeGreaterThan(-1)
  return blockAfter(js, at)
}
/**
 * Every element id the script reaches for. The script dereferences most of
 * these at load with no guard, so an id renamed in the markup alone would
 * freeze the page on step 0 — and there is no DOM in workerd to catch it.
 */
function idsReachedFor(js: string): string[] {
  const out = new Set<string>()
  for (const m of js.matchAll(/getElementById\((['"])([A-Za-z][-\w]*)\1\)/g)) out.add(m[2]!)
  for (const m of js.matchAll(/(?:querySelector|querySelectorAll|closest)\((['"])#([A-Za-z][-\w]*)\1\)/g)) {
    out.add(m[2]!)
  }
  return [...out]
}
function mainOf(h: string): string {
  const m = h.match(/<main[\s\S]*?<\/main>/)
  expect(m, '<main> missing').toBeTruthy()
  return m![0]
}
/** Starts an urge for `u` and returns its id, straight through the route. */
async function startUrge(u: User = user, fields: Record<string, string> = {}): Promise<number> {
  const res = await postFetch({ op: 'start', state: 'tired', trigger: '', ...fields }, u)
  expect(res.status).toBe(200)
  const body = await json(res)
  expect(typeof body.id).toBe('number')
  return body.id as number
}

// --- GET ---------------------------------------------------------------------

describe('the page', () => {
  it('ships all five steps in one document, starting on step 0', async () => {
    const h = await html()
    for (const n of [0, 1, 2, 3, 4]) {
      expect(h, `step ${n} missing`).toContain(`<section class="step" data-step="${n}"`)
    }
    expect(h).toMatch(/<body[^>]*data-step="0"/)
    // The orb's own rules key off body.t-*: without the theme class both the
    // ink wash and the single dot render at once.
    expect(h).toMatch(/<body[^>]*class="t-(?:ink|breath)"/)
  })

  it('offers the five body states and the trigger chips, 其他 last', async () => {
    const h = await html()
    expect(h).toContain('冲动来了。')
    expect(h).toContain('此刻，身体是哪一种？')
    for (const [state, label] of [
      ['hungry', '饿'],
      ['angry', '烦'],
      ['lonely', '孤独'],
      ['tired', '累'],
      ['none', '都不是'],
    ] as const) {
      expect(h).toContain(`data-state="${state}">${label}<`)
    }
    expect(h).toContain('是什么把它引来的？')
    for (const trigger of DEFAULT_SURF_TRIGGERS) {
      expect(h).toContain(`data-trigger="${trigger}">${trigger}<`)
    }
    // 「其他」 is the opt-out, and it stores nothing.
    expect(h).toContain('data-trigger="">其他<')
    const chips = h.slice(h.indexOf('是什么把它引来的？'))
    expect(chips.indexOf('data-trigger=""')).toBeGreaterThan(chips.indexOf(`data-trigger="${DEFAULT_SURF_TRIGGERS[3]}"`))
  })

  it('uses the account own triggers when it has them, escaped', async () => {
    const configured = { ...user, surf_triggers: '深夜加班\n<b>被骂了</b>' }
    const h = await html(configured)
    expect(h).toContain('data-trigger="深夜加班">深夜加班<')
    expect(h).toContain('&lt;b&gt;被骂了&lt;/b&gt;')
    expect(h).not.toContain('<b>被骂了</b>')
    for (const trigger of DEFAULT_SURF_TRIGGERS) expect(h).not.toContain(`data-trigger="${trigger}"`)
    expect(h).toContain('data-trigger="">其他<')
  })

  it('carries 渡 own home-screen head and no console header', async () => {
    const h = await html()
    expect(h).toContain('<link rel="manifest" href="/surf/manifest.webmanifest">')
    expect(h).toContain('<link rel="apple-touch-icon" href="/surf/icon.png">')
    expect(h).toContain('<meta name="apple-mobile-web-app-title" content="渡">')
    // Deliberate, not an omission: the flow page has no chrome to tab away
    // through — the same decision the breathing page makes.
    expect(h).not.toContain('<header')
  })

  it('renders in English without Chinese punctuation leaking into the flow', async () => {
    const main = mainOf(await html(user, { 'accept-language': 'en' }))
    expect(main).toContain('An urge came.')
    expect(main).not.toMatch(/[「」，。！？；：（）]/)
  })

  it('answers anything but GET/POST with 405', async () => {
    const res = await handleSurf(new Request('https://yixi.test/surf', { method: 'DELETE' }), env, user)
    expect(res.status).toBe(405)
  })
})

describe('this month dots', () => {
  it('draws one per day so far, filled by what actually happened', async () => {
    await env.DB.batch([
      env.DB
        .prepare("INSERT INTO urges (user_id, started_at, ended_at, outcome, state, trigger, rounds, note) VALUES (1, ?1, ?1, 'passed', 'tired', '', 1, '')")
        .bind(NOW),
      env.DB
        .prepare("INSERT INTO urges (user_id, started_at, ended_at, outcome, state, trigger, rounds, note) VALUES (1, ?1, ?1, 'opened', 'lonely', '', 1, '')")
        .bind(NOW),
      // Another account's rows must not reach this page.
      env.DB
        .prepare("INSERT INTO urges (user_id, started_at, ended_at, outcome, state, trigger, rounds, note) VALUES (2, ?1, ?1, 'opened', 'tired', '', 1, '')")
        .bind(NOW),
    ])
    const h = await html()
    const month = h.slice(h.indexOf('id="month"'))
    const dots = month.match(/<i class="d[^"]*"><\/i>/g) ?? []
    expect(dots).toHaveLength(Number(TODAY.slice(8, 10)))
    // Today is the last dot: two urges, one of them opened.
    const today = dots[dots.length - 1]!
    expect(today).toContain('n2')
    expect(today).toContain('op')
  })

  it('draws an empty row for an account with no records', async () => {
    const h = await html()
    const month = h.slice(h.indexOf('id="month"'))
    const dots = month.match(/<i class="d[^"]*"><\/i>/g) ?? []
    expect(dots).toHaveLength(Number(TODAY.slice(8, 10)))
    expect(dots.every((d) => d.includes('n0'))).toBe(true)
    expect(month.slice(0, month.indexOf('</div>'))).not.toContain('op')
  })
})

// --- POST --------------------------------------------------------------------

describe('op=start', () => {
  it('records the urge and hands the id back', async () => {
    const res = await postFetch({ op: 'start', state: 'lonely', trigger: '躺床上刷手机' })
    expect(res.status).toBe(200)
    const id = (await json(res)).id as number
    const row = (await getUrge(env.DB, 1, id))!
    expect(row.state).toBe('lonely')
    expect(row.trigger).toBe('躺床上刷手机')
    expect(row.rounds).toBe(1)
    expect(row.outcome).toBeNull()
  })

  it('accepts an empty state and an empty trigger', async () => {
    const id = await startUrge(user, { state: '', trigger: '' })
    const row = (await getUrge(env.DB, 1, id))!
    expect(row.state).toBe('')
    expect(row.trigger).toBe('')
  })

  it('truncates an over-long trigger rather than refusing it', async () => {
    const long = '一二三四五六七八九十一二三四五六七八九十一二三'
    const id = await startUrge(user, { trigger: long })
    expect((await getUrge(env.DB, 1, id))!.trigger).toBe(long.slice(0, 20))
  })

  it('refuses a state outside the enum', async () => {
    expect((await postFetch({ op: 'start', state: 'sleepy', trigger: '' })).status).toBe(400)
    expect(await listUrgesSince(env.DB, 1, 0)).toHaveLength(0)
  })

  it('303s back to /surf without the marker header', async () => {
    const res = await post({ op: 'start', state: 'tired', trigger: '' })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/surf')
    expect(await listUrgesSince(env.DB, 1, 0)).toHaveLength(1)
  })
})

describe('op=round', () => {
  it('counts another ten minutes', async () => {
    const id = await startUrge()
    const res = await postFetch({ op: 'round', id: String(id) })
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ ok: true })
    expect((await getUrge(env.DB, 1, id))!.rounds).toBe(2)
  })

  it('refuses an id that is not a number', async () => {
    expect((await postFetch({ op: 'round', id: 'abc' })).status).toBe(400)
  })

  it('does not reach somebody else row', async () => {
    const id = await startUrge(other)
    expect((await postFetch({ op: 'round', id: String(id) })).status).toBe(404)
    expect((await getUrge(env.DB, 2, id))!.rounds).toBe(1)
  })
})

describe('op=finish', () => {
  it('writes the outcome once and is idempotent afterwards', async () => {
    const id = await startUrge()
    const first = await postFetch({ op: 'finish', id: String(id), outcome: 'passed' })
    expect(first.status).toBe(200)
    expect(await json(first)).toEqual({ ok: true, changed: true })
    const row = (await getUrge(env.DB, 1, id))!
    expect(row.outcome).toBe('passed')
    expect(row.ended_at).not.toBeNull()

    // A page that was closed once the first finish landed has no way to know
    // that; its retry is not an error, and it changes nothing.
    const again = await postFetch({ op: 'finish', id: String(id), outcome: 'opened' })
    expect(again.status).toBe(200)
    expect(await json(again)).toEqual({ ok: true, changed: false })
    expect((await getUrge(env.DB, 1, id))!.outcome).toBe('passed')
  })

  it('refuses an outcome outside the enum, and a non-numeric id', async () => {
    const id = await startUrge()
    expect((await postFetch({ op: 'finish', id: String(id), outcome: 'quit' })).status).toBe(400)
    expect((await postFetch({ op: 'finish', id: 'x', outcome: 'passed' })).status).toBe(400)
    expect((await getUrge(env.DB, 1, id))!.outcome).toBeNull()
  })

  it('tells 404 from already-finished', async () => {
    const mine = await startUrge()
    const theirs = await startUrge(other)
    await postFetch({ op: 'finish', id: String(mine), outcome: 'passed' })
    // Mine, already settled: 200 and changed:false. Theirs: not found at all.
    expect((await postFetch({ op: 'finish', id: String(mine), outcome: 'passed' })).status).toBe(200)
    expect((await postFetch({ op: 'finish', id: String(theirs), outcome: 'passed' })).status).toBe(404)
    expect((await getUrge(env.DB, 2, theirs))!.outcome).toBeNull()
  })
})

describe('op=note', () => {
  it('stores what to change next time', async () => {
    const id = await startUrge()
    await postFetch({ op: 'finish', id: String(id), outcome: 'opened' })
    const res = await postFetch({ op: 'note', id: String(id), note: '先去洗个脸' })
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ ok: true })
    expect((await getUrge(env.DB, 1, id))!.note).toBe('先去洗个脸')
  })

  it('refuses a note past the limit instead of silently cutting it', async () => {
    const id = await startUrge()
    const res = await postFetch({ op: 'note', id: String(id), note: 'x'.repeat(81) })
    expect(res.status).toBe(400)
    expect((await getUrge(env.DB, 1, id))!.note).toBe('')
  })

  it('does not reach somebody else row', async () => {
    const id = await startUrge(other)
    expect((await postFetch({ op: 'note', id: String(id), note: 'hi' })).status).toBe(404)
    expect((await getUrge(env.DB, 2, id))!.note).toBe('')
  })
})

describe('unknown ops', () => {
  it('are a 400, not a silent 303', async () => {
    expect((await postFetch({ op: 'nope' })).status).toBe(400)
    expect((await postFetch({})).status).toBe(400)
  })
})

// --- the page script ---------------------------------------------------------

describe('the page script', () => {
  let js = ''
  beforeEach(async () => {
    js = stripComments(scriptOf(await html()))
  })

  it('never awaits anywhere', () => {
    // round/finish/note all fire from a page that is being closed. An await
    // anywhere in here is the shape of a record that never lands.
    expect(js).not.toMatch(/\bawait\b/)
  })

  it('reports through sendBeacon with a non-awaited keepalive fallback', () => {
    expect(js).toContain("navigator.sendBeacon('/surf'")
    expect(js).toMatch(/fetch\('\/surf',\{[^}]*keepalive:true[^}]*\}\)\.catch\(/)
  })

  it('drives the ten minutes off performance.now and rAF, not a counting timer', () => {
    expect(js).toContain('requestAnimationFrame')
    expect(js).not.toMatch(/setInterval/)
  })

  it('reads its copy from the config island rather than carrying any', () => {
    expect(js).not.toMatch(/[一-鿿]/)
  })

  it('keeps 过去了 immediate and 还想 800ms behind it', async () => {
    const h = await html()
    const code = stripComments(scriptOf(h))
    expect(code).toMatch(/setTimeout\([^)]*?,\s*800\)/)
    // The asymmetry is the feature (CONTRIBUTING: do not balance these
    // buttons). Both halves of it are server-rendered state, not script: 还想
    // and the two links behind it start hidden, 过去了 never is.
    expect(h).toMatch(/id="still"[^>]*hidden/)
    expect(h).toMatch(/id="more"[^>]*hidden/)
    expect(h).not.toMatch(/id="passed"[^>]*hidden/)
    // The same mechanism holds the optional question and the offline notice.
    expect(h).toMatch(/id="noteWrap"[^>]*hidden/)
    expect(h).toMatch(/id="lost"[^>]*hidden/)
  })

  it('drops the pending reveal whenever the flow leaves step 3', () => {
    // Otherwise the 800ms timer fires into step 4 and un-hides 还想 behind a
    // section nobody is looking at, and the next round through step 3 starts
    // with both halves already showing.
    const go = fnBody(js, 'go')
    expect(go).toContain('clearTimeout(pending)')
    expect(go).toMatch(/n!==3/)
  })

  it('paints today dot only when the record actually landed', () => {
    // With no id the start POST never reached us, so there is no row: a dot
    // painted here would disappear on the next reload, right next to the line
    // that says nothing was recorded.
    const finish = fnBody(js, 'finish')
    expect(finish.split('bumpToday(').length - 1, 'bumpToday called more than once').toBe(1)
    const guard = finish.indexOf('urgeId===null')
    expect(guard, 'finish() no longer branches on a missing id').toBeGreaterThan(-1)
    // The `else` of that guard — i.e. the branch that runs only with an id.
    const recorded = blockAfter(finish, finish.indexOf('else', guard))
    expect(recorded).toContain('bumpToday(')
    expect(recorded).toContain("op:'finish'")
    // And the other branch says so instead of drawing anything.
    expect(blockAfter(finish, guard)).toContain('lost.hidden=false')
  })

  it('only reaches for ids the page actually renders', async () => {
    // The script dereferences #cfg, #ring, #phase and the rest at load with no
    // guard: rename one in the markup and the page freezes on step 0 with this
    // suite green. workerd has no DOM to catch that, so the contract is
    // checked as text. The iPhone render is the maximal page — it is the only
    // one that carries the a2hs banner.
    const h = await html(user, { 'user-agent': IPHONE_SAFARI })
    const code = stripComments(scriptOf(h))
    const ids = idsReachedFor(code)
    // A sanity floor: if the extraction ever stops matching, this test must
    // fail rather than quietly assert nothing.
    expect(ids.length).toBeGreaterThanOrEqual(10)
    expect(ids).toContain('cfg')
    expect(ids).toContain('ring')
    for (const id of ids) {
      expect(h, `the script reads #${id}, and the page renders no such id`).toContain(`id="${id}"`)
    }
  })
})

describe('farewellLines', () => {
  it('is five quiet lines, in a fixed order', () => {
    const lines = farewellLines(translator('zh'))
    expect(lines).toEqual([
      '就到这里。',
      '这一阵过去了。',
      '你看着它，它就小了。',
      '记下了。明天还是新的一天。',
      '放下就好。',
    ])
    expect(lines.every((l) => !l.includes('！'))).toBe(true)
  })

  it('translates whole, with no line left behind', () => {
    const en = farewellLines(translator('en'))
    expect(en).toHaveLength(5)
    expect(en.every((l) => !/[一-鿿]/.test(l))).toBe(true)
  })
})

describe('the flow end to end, as the script would walk it', () => {
  it('start, another round, finish, note', async () => {
    const id = await startUrge(user, { state: 'angry', trigger: '情绪低落' })
    await postFetch({ op: 'round', id: String(id) })
    await postFetch({ op: 'finish', id: String(id), outcome: 'opened' })
    await postFetch({ op: 'note', id: String(id), note: '出门走五分钟' })
    const row = (await getUrge(env.DB, 1, id)) as Urge
    expect(row).toMatchObject({
      state: 'angry',
      trigger: '情绪低落',
      rounds: 2,
      outcome: 'opened',
      note: '出门走五分钟',
    })
    expect(shanghaiDate(row.started_at)).toBe(TODAY)
  })
})
