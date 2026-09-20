// /surf — the ten-minute flow. One server-rendered page whose four steps are
// switched client-side, plus the POST contract the page's own script speaks.
//
// Two groups of assertions carry the product rather than the code:
//
//   * Nothing in the flow asks the reader anything. No chips, no form fields,
//     no text box — the scene was picked once at /surf/setup and every
//     per-scene string is rendered in from `users.surf_scene`. Several tests
//     below exist only to keep that true.
//   * `round` and `finish` fire from a page that is about to be closed or
//     backgrounded, so they go out through sendBeacon and must never be
//     awaited (CONTRIBUTING §2). The comments in the script itself name
//     `await`, so the test strips comments before grepping — the same
//     technique as test/breathe.test.ts, which learned it the hard way.

import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { farewellLines, groundingLines, handleSurf } from '../src/ui/surf'
import { createUrge, getUrge, listUrgesSince } from '../src/urges'
import { shanghaiDate } from '../src/db'
import { translator } from '../src/i18n'
import { SCENES } from '../src/surfscenes'
import { SURF_RESUME_MS } from '../src/types'
import type { Urge, User } from '../src/types'

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
 * matched. Good enough for this script, whose only brace inside a string
 * literal is the balanced `'{n}'` the reduced-motion line substitutes into —
 * balanced is all this needs, since it counts rather than parses. It throws
 * loudly rather than returning something plausible if an UNbalanced one ever
 * appears.
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
/** The body of every `addEventListener(…, function(…){ … })` in the script. */
function handlerBodies(js: string): string[] {
  const out: string[] = []
  let at = js.indexOf('addEventListener(')
  while (at > -1) {
    out.push(blockAfter(js, js.indexOf('function', at)))
    at = js.indexOf('addEventListener(', at + 1)
  }
  return out
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
async function startUrge(u: User = user): Promise<number> {
  const res = await postFetch({ op: 'start' }, u)
  expect(res.status).toBe(200)
  const body = await json(res)
  expect(typeof body.id).toBe('number')
  return body.id as number
}

// --- GET ---------------------------------------------------------------------

describe('the page', () => {
  it('ships all four steps in one document, starting on step 0', async () => {
    const h = await html()
    for (const n of [0, 1, 2, 3]) {
      expect(h, `step ${n} missing`).toContain(`<section class="step" data-step="${n}"`)
    }
    expect(h).not.toContain('data-step="4"')
    expect(h).toMatch(/<body[^>]*data-step="0"/)
    // Step 1's own switch, set server-side so segment a is already the visible
    // one before the first frame runs.
    expect(h).toMatch(/<body[^>]*data-seg="a"/)
    // The orb's own rules key off body.t-*: without the theme class both the
    // ink wash and the single dot render at once.
    expect(h).toMatch(/<body[^>]*class="t-(?:ink|breath)"/)
  })

  it('asks nothing anywhere in the flow — no chips, no fields, no text box', async () => {
    const h = await html({ ...user, surf_scene: 'feed' })
    expect(h).not.toContain('class="chip"')
    expect(h).not.toContain('data-state=')
    expect(h).not.toContain('data-trigger=')
    expect(h).not.toContain('name="state"')
    expect(h).not.toContain('id="note"')
    expect(h).not.toContain('<input')
    expect(h).not.toContain('<form')
    // Eight, and every one of them moves the flow forward or ends it: 我起来了
    // on step 0; 做完了, the dot itself and 好了 inside step 1; 过去了, 还想,
    // 再来十分钟 and 我点开了 on step 2. Not one of them is a choice ABOUT
    // anything — the dot is a target, not an option. The 回看/怎么配 exits on
    // step 3 are <a> tags, not <button>, so they do not move this count; see
    // the dedicated test below for those.
    const buttons = mainOf(h).match(/<button/g) ?? []
    expect(buttons).toHaveLength(8)
  })

  it('walks step 1 through five segments in order, with no way to skip or go back', async () => {
    const h = await html({ ...user, surf_scene: 'feed' })
    const step1 = h.match(/<section class="step" data-step="1">([\s\S]*?)\n<\/section>/)
    expect(step1, 'step 1 missing').toBeTruthy()
    const body = step1![1]!
    const segs = [...body.matchAll(/<div class="seg" data-seg="([a-e])">/g)].map((m) => m[1])
    expect(segs).toEqual(['a', 'b', 'c', 'd', 'e'])
    // No sixth segment anywhere, and nothing in the flow offers a way past one.
    expect(h).not.toContain('data-seg="f"')
    expect(body).not.toContain('id="skip"')
    expect(body).not.toContain('id="back"')
  })

  it('counts segment b in sixty cells and segment d in twenty, with no numeral anywhere', async () => {
    // The hairlines are the count. A numeral invites you to tick it down,
    // which is the same objection this page has always had to a countdown.
    const h = await html()
    const bars = h.match(/<div class="bar" id="bar-[bd]" aria-hidden="true">((?:<i><\/i>)+)<\/div>/g) ?? []
    expect(bars).toHaveLength(2)
    const cellsIn = (id: string): number => {
      const m = h.match(new RegExp(`<div class="bar" id="${id}" aria-hidden="true">((?:<i></i>)+)</div>`))
      expect(m, `${id} missing`).toBeTruthy()
      return (m![1]!.match(/<i><\/i>/g) ?? []).length
    }
    expect(cellsIn('bar-b')).toBe(60)
    expect(cellsIn('bar-d')).toBe(20)
    // The only counted string on the page is the reduced-motion line, and it
    // ships empty and hidden — the script fills it a beat at a time.
    expect(h).toContain('<p class="nth" id="nth" hidden></p>')
  })

  it('gives the tap dot a target well past the 44px floor, and takes it out of the gesture stack', async () => {
    const h = await html()
    expect(h).toContain('<button type="button" class="tapdot" id="tapdot"')
    const rule = h.match(/\.tapdot\{([\s\S]*?)\}/)
    expect(rule, '.tapdot rule missing').toBeTruthy()
    const px = rule![1]!.match(/width:(\d+)px/)
    expect(px, '.tapdot has no explicit width').toBeTruthy()
    expect(Number(px![1])).toBeGreaterThanOrEqual(56)
    // Both the dot and the area under it: without touch-action iOS holds every
    // tap for ~300ms in case a second one follows.
    expect(rule![1]).toContain('touch-action:none')
    expect(h).toMatch(/\.zone\{[^}]*touch-action:none/)
  })

  it('offers 回看 and 怎么配 exits only on the closing step, below 再来一次', async () => {
    // 'feed' so step 0 carries no /surf/setup link of its own (see "offers the
    // setup link only while no scene has been chosen" below) — otherwise that
    // pre-existing link would collide with the "steps 0-2 stay untouched"
    // check further down.
    const h = await html({ ...user, surf_scene: 'feed' })
    const step3 = h.match(/<section class="step" data-step="3">([\s\S]*?)<\/section>/)
    expect(step3, 'step 3 missing').toBeTruthy()
    const body = step3![1]!
    expect(body).toContain('<a class="linky" href="/surf/review">回看 ›</a>')
    expect(body).toContain('<a class="linky" href="/surf/setup">怎么配 ›</a>')
    // Below 「再来一次」, not above it.
    const again = body.indexOf('再来一次')
    expect(again).toBeGreaterThan(-1)
    expect(body.indexOf('href="/surf/review"')).toBeGreaterThan(again)
    expect(body.indexOf('href="/surf/setup"')).toBeGreaterThan(again)

    // Steps 0-2 are untouched: zero extra elements leaked backward into them.
    for (const n of [0, 1, 2]) {
      const step = h.match(new RegExp(`<section class="step" data-step="${n}">([\\s\\S]*?)</section>`))
      expect(step, `step ${n} missing`).toBeTruthy()
      expect(step![1]).not.toContain('/surf/review')
      expect(step![1]).not.toContain('/surf/setup')
    }
  })

  it('opens with the chosen scene line and renders that scene own two tasks', async () => {
    const h = await html({ ...user, surf_scene: 'game' })
    expect(h).toContain('<h1>冲动来了。</h1>')
    expect(h).toContain(`<p class="line">${SCENES.game.opening}</p>`)
    // Both tasks are server-rendered into their own segment — neither is in
    // the config island, because neither ever changes mid-walk.
    expect(h).toContain(`<p class="task">${SCENES.game.handTask}</p>`)
    expect(h).toContain(`<p class="task">${SCENES.game.bodyTask}</p>`)
    // And no other scene's leaked in alongside.
    expect(h).not.toContain(SCENES.snack.handTask)
    expect(h).not.toContain(SCENES.snack.opening)
  })

  it('swaps both tasks with the scene, and says so about the body task that is not counted', async () => {
    for (const key of ['lust', 'game', 'snack'] as const) {
      const h = await html({ ...user, surf_scene: key })
      expect(h, key).toContain(`<p class="task">${SCENES[key].handTask}</p>`)
      expect(h, key).toContain(`<p class="task">${SCENES[key].bodyTask}</p>`)
      // 深夜加餐's body task is brushing your teeth, which is not twenty of
      // anything: the config island carries a duration instead of a beat
      // count, and every other scene carries null.
      expect(h, key).toContain(`"bodyMs":${JSON.stringify(SCENES[key].bodyMs)}`)
    }
    expect(SCENES.snack.bodyMs).toBe(90_000)
    expect(SCENES.lust.bodyMs).toBeNull()
    expect(SCENES.game.bodyMs).toBeNull()
  })

  it('falls back to the neutral scene for an account that never configured one', async () => {
    const h = await html()
    expect(h).toContain(`<p class="line">${SCENES.custom.opening}</p>`)
    expect(h).toContain(`<p class="task">${SCENES.custom.handTask}</p>`)
    expect(h).toContain(`<p class="task">${SCENES.custom.bodyTask}</p>`)
  })

  it('carries the segment titles, the two buttons and the 5-4-3-2-1 lines, verbatim', async () => {
    const h = await html()
    for (const title of ['手上的事', '眼睛的事', '周围的事', '身体的事', '呼吸']) {
      expect(h, title).toContain(`<p class="segt">${title}</p>`)
    }
    expect(h).toContain('<button type="button" class="stop" id="did-a">做完了</button>')
    expect(h).toContain('<button type="button" class="stop" id="did-c">好了</button>')
    expect(h).toContain('<p class="hint">点它。</p>')
    expect(h).toContain('<p class="hint">跟着它。</p>')
    // The first grounding line is server-rendered; all five travel in the
    // config island the segment steps through.
    expect(h).toContain('<p class="task" id="around">找出房间里五样蓝色的东西。</p>')
    for (const line of groundingLines(translator('zh'))) expect(h, line).toContain(line)
    // Nothing in the flow raises its voice.
    expect(mainOf(h)).not.toContain('！')
  })

  it('shows the account own line under the opening, escaped, and nothing when there is none', async () => {
    const h = await html({ ...user, surf_scene: 'lust', surf_line: '<b>别把今晚也赔进去</b>' })
    expect(h).toContain('<p class="line own">&lt;b&gt;别把今晚也赔进去&lt;/b&gt;</p>')
    expect(h).not.toContain('<b>别把今晚也赔进去</b>')
    expect(await html({ ...user, surf_scene: 'lust' })).not.toContain('class="line own"')
    expect(await html({ ...user, surf_scene: 'lust', surf_line: '   ' })).not.toContain('class="line own"')
  })

  it('offers the setup link on step 0 only while no scene has been chosen', async () => {
    const unset = await html()
    expect(unset).toContain('<a class="linky" href="/surf/setup">先告诉我这是哪一种 ›</a>')
    // Once a scene exists, step 0's own link is gone for good: it was the one
    // exception to "no choices in the flow", made only for an account that has
    // never told the flow which scene it is. Scoped to step 0 rather than the
    // whole page, because step 3 now carries its own, unconditional
    // href="/surf/setup" (the 「怎么配」 exit — see the dedicated test above),
    // which is a different link and must survive regardless of scene.
    for (const scene of ['lust', 'feed', 'game', 'snack', 'custom:打牌']) {
      const h = await html({ ...user, surf_scene: scene })
      const step0 = h.match(/<section class="step" data-step="0">([\s\S]*?)<\/section>/)
      expect(step0, scene).toBeTruthy()
      expect(step0![1], scene).not.toContain('href="/surf/setup"')
    }
  })

  it('tells you where to go, under the one button', async () => {
    const h = await html()
    expect(h).toContain('<button type="button" class="stop" id="up">我起来了</button>')
    expect(h).toContain('<p class="a2">放下手机，去另一个房间。回来再点。</p>')
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

  it('hides the a2hs banner on every step but the last', async () => {
    // Step 0 also carries the /surf/setup link at the bottom of the column on
    // a first visit; the banner has to stay off there too, not only during
    // the ten minutes, and only appear once the walk-through has ended.
    const h = await html(user, { 'user-agent': IPHONE_SAFARI })
    expect(h).toContain(
      'body[data-step="0"] .a2hs,body[data-step="1"] .a2hs,body[data-step="2"] .a2hs{display:none}',
    )
    expect(h).not.toMatch(/body\[data-step="3"\]\s*\.a2hs\s*\{display:none\}/)
  })

  it('renders in English without Chinese punctuation leaking into the flow', async () => {
    const h = await html({ ...user, surf_scene: 'snack' }, { 'accept-language': 'en' })
    const main = mainOf(h)
    expect(main).toContain('An urge came.')
    expect(main).toContain('Mostly this is tiredness, not hunger.')
    // Both of this scene's tasks, and every segment title and button.
    expect(main).toContain('Drink a glass of warm water, slowly, all of it.')
    expect(main).toContain('Brush your teeth.')
    for (const s of ['Your hands', 'Your eyes', 'Around you', 'Your body', 'Breath', 'Done', 'Got it']) {
      expect(main, s).toContain(s)
    }
    expect(main).toContain('Find five blue things in the room.')
    // The other four grounding lines and the counted line travel in the config
    // island, which sits outside <main> — they have to be translated there
    // too, or the segment would switch back into Chinese on its second line.
    expect(h).toContain('Name one taste in your mouth right now.')
    expect(h).toContain('Number {n}')
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
        .prepare("INSERT INTO urges (user_id, started_at, ended_at, outcome, state, trigger, rounds, note) VALUES (1, ?1, ?1, 'passed', '', 'lust', 1, '')")
        .bind(NOW),
      env.DB
        .prepare("INSERT INTO urges (user_id, started_at, ended_at, outcome, state, trigger, rounds, note) VALUES (1, ?1, ?1, 'opened', '', 'lust', 1, '')")
        .bind(NOW),
      // Another account's rows must not reach this page.
      env.DB
        .prepare("INSERT INTO urges (user_id, started_at, ended_at, outcome, state, trigger, rounds, note) VALUES (2, ?1, ?1, 'opened', '', 'feed', 1, '')")
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
  it('takes no fields at all and fills the trigger from the account own scene', async () => {
    const id = await startUrge({ ...user, surf_scene: 'lust' })
    const row = (await getUrge(env.DB, 1, id))!
    expect(row.trigger).toBe('lust')
    // The body question v1 asked is gone, and nothing writes that column now.
    expect(row.state).toBe('')
    expect(row.rounds).toBe(1)
    expect(row.outcome).toBeNull()
    expect(row.note).toBe('')
  })

  it('writes the account own words for a custom scene, and nothing for an unconfigured one', async () => {
    const custom = await startUrge({ ...user, surf_scene: 'custom:打牌' })
    // Namespaced with the `custom:` prefix so a custom scene never collides
    // with a preset key that happens to read the same in `urges.trigger`.
    expect((await getUrge(env.DB, 1, custom))!.trigger).toBe('custom:打牌')

    // Finished first: otherwise the second start would resume this same open
    // row (see the resume-on-reopen tests below) instead of opening a fresh
    // one, and this test would be asserting about the wrong row.
    await postFetch({ op: 'finish', id: String(custom), outcome: 'passed' })

    const none = await startUrge()
    // Not 「冲动」, the word the page shows: '' has to keep meaning "never
    // chose a scene" in the column.
    expect((await getUrge(env.DB, 1, none))!.trigger).toBe('')
  })

  it('ignores a state or trigger a client tries to post anyway', async () => {
    const res = await postFetch({ op: 'start', state: 'tired', trigger: '自己塞的' }, { ...user, surf_scene: 'feed' })
    expect(res.status).toBe(200)
    const row = (await getUrge(env.DB, 1, (await json(res)).id as number))!
    expect(row.state).toBe('')
    expect(row.trigger).toBe('feed')
  })

  it('303s back to /surf without the marker header', async () => {
    const res = await post({ op: 'start' })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/surf')
    expect(await listUrgesSince(env.DB, 1, 0)).toHaveLength(1)
  })
})

describe('op=start resumes an open urge instead of duplicating it', () => {
  // `start` now fires on every page load (not on a tap), so a reload, a
  // mis-tap that bounces straight back, or iOS restoring a backgrounded tab
  // all replay it. Without resuming, each of those would open its own row for
  // what is really the same urge and inflate 「三十天 N 次」.
  it('returns the same id for two starts inside the resume window, and leaves one row', async () => {
    const first = await startUrge()
    const second = await startUrge()
    expect(second).toBe(first)
    expect(await listUrgesSince(env.DB, 1, 0)).toHaveLength(1)
  })

  it('opens a new row once the open one has been finished', async () => {
    const first = await startUrge()
    await postFetch({ op: 'finish', id: String(first), outcome: 'passed' })
    const second = await startUrge()
    expect(second).not.toBe(first)
    expect(await listUrgesSince(env.DB, 1, 0)).toHaveLength(2)
  })

  it('opens a new row rather than resuming an unfinished one older than SURF_RESUME_MS', async () => {
    const stale = await createUrge(env.DB, {
      userId: 1,
      state: '',
      trigger: '',
      now: Date.now() - SURF_RESUME_MS - 1000,
    })
    const fresh = await startUrge()
    expect(fresh).not.toBe(stale)
    expect((await getUrge(env.DB, 1, stale))!.outcome).toBeNull()
    expect(await listUrgesSince(env.DB, 1, 0)).toHaveLength(2)
  })

  it("never resumes another account's open row", async () => {
    const theirs = await startUrge(other)
    const mine = await startUrge()
    expect(mine).not.toBe(theirs)
    expect(await listUrgesSince(env.DB, 1, 0)).toHaveLength(1)
    expect(await listUrgesSince(env.DB, 2, 0)).toHaveLength(1)
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

describe('unknown ops', () => {
  it('are a 400, not a silent 303', async () => {
    expect((await postFetch({ op: 'nope' })).status).toBe(400)
    expect((await postFetch({})).status).toBe(400)
  })

  it('op=note is one of them now — typing was a choice too', async () => {
    const id = await startUrge()
    await postFetch({ op: 'finish', id: String(id), outcome: 'opened' })
    expect((await postFetch({ op: 'note', id: String(id), note: '先去洗个脸' })).status).toBe(400)
    expect((await getUrge(env.DB, 1, id))!.note).toBe('')
  })
})

// --- the page script ---------------------------------------------------------

describe('the page script', () => {
  let js = ''
  beforeEach(async () => {
    js = stripComments(scriptOf(await html()))
  })

  it('never awaits anywhere', () => {
    // round/finish fire from a page that is being closed. An await anywhere in
    // here is the shape of a record that never lands.
    expect(js).not.toMatch(/\bawait\b/)
  })

  it('opens the record on load, not on a tap', () => {
    // The flow has no first question to gate this on any more, and an urge
    // interrupted three seconds in is still an urge that happened. The call
    // has to sit on the top-level path: inside a handler it would be waiting
    // for the one interaction this page refuses to require.
    expect(fnBody(js, 'start')).toContain("op:'start'")
    expect(js).toMatch(/^start\(\);$/m)
    const handlers = handlerBodies(js)
    expect(handlers.length, 'no event handlers found — did the extraction break?').toBeGreaterThan(0)
    for (const body of handlers) expect(body).not.toMatch(/\bstart\(/)
  })

  it('sends start with no fields of its own', () => {
    const start = fnBody(js, 'start')
    expect(start).toContain("new URLSearchParams({op:'start'})")
    expect(start).not.toMatch(/state|trigger/)
  })

  it('reports through sendBeacon with a non-awaited keepalive fallback that asks the server for JSON', () => {
    expect(js).toContain("navigator.sendBeacon('/surf'")
    // sendBeacon itself cannot set headers, so only the fetch fallback carries
    // x-yixi: without it the server cannot tell this apart from a plain form
    // submission and answers with a 303 that drags a full page GET behind it.
    expect(js).toContain(
      "fetch('/surf',{method:'POST',body:p,keepalive:true,headers:{'x-yixi':'fetch'}}).catch(function(){})",
    )
  })

  it('drives the ten minutes off performance.now and rAF, not a counting timer', () => {
    expect(js).toContain('requestAnimationFrame')
    expect(js).not.toMatch(/setInterval/)
  })

  it('has one function per segment, chained in order by nothing but SEQ', () => {
    // There is no DOM in workerd, so the flow itself cannot be walked here.
    // What can be checked is the shape that makes the order unambiguous: five
    // named functions, one list naming them in order, and one mover — so there
    // is no second place the order could be written down and disagree.
    for (const name of ['segA', 'segB', 'segC', 'segD', 'segE']) fnBody(js, name)
    expect(js).toContain('var SEQ=[segA,segB,segC,segD,segE]')
    expect(js).toContain("var KEYS=['a','b','c','d','e']")
    // Forward only, and the end of the list is the deciding step.
    const next = fnBody(js, 'nextSeg')
    expect(next).toContain('segi+1')
    expect(next).toContain('go(2)')
    expect(next).not.toMatch(/segi-1|segi--/)
    // Every segment is entered through the one door, and nothing else sets
    // data-seg — a segment reached any other way would skip the ring redraw.
    expect(fnBody(js, 'enterSeg')).toContain("doc.setAttribute('data-seg'")
    expect(js.split("setAttribute('data-seg'").length - 1).toBe(1)
    // The two segments a person ends themselves do it through the same mover.
    expect(js).toContain("if(el.closest('#did-a')){nextSeg();return}")
    expect(js).toContain("if(el.closest('#did-c')){sayNext();return}")
    expect(fnBody(js, 'sayNext')).toContain('nextSeg()')
  })

  it('draws the one ring off segment progress, a fifth at a time', () => {
    // Not off the clock any more: 「完成一段进 1/5」. Two of the five segments
    // have no clock at all, so a ring driven by elapsed time would be telling
    // the reader about something other than where they are.
    const draw = fnBody(js, 'drawRing')
    expect(draw).toContain('segi+')
    expect(draw).toContain('SEQ.length')
    expect(draw).toContain('strokeDashoffset')
    // And it is the only place that moves it, after the first paint.
    expect(js.split('strokeDashoffset').length - 1).toBe(2)
  })

  it('counts the dots on pointerdown, never click, and only on the dot itself', () => {
    // iOS holds a click for ~300ms in case a second tap follows, which at one
    // dot a second reads as a page that keeps missing. And the listener being
    // the dot's own is what makes 「点空白处不算」 true by construction rather
    // than by a hit test.
    expect(js).toContain("tapdot.addEventListener('pointerdown'")
    expect(js).not.toMatch(/tapdot\.addEventListener\('click'/)
    const handler = handlerBodies(js).find((b) => b.includes('taps++'))
    expect(handler, 'the tap handler no longer increments taps').toBeTruthy()
    expect(handler!).toContain('ev.preventDefault()')
    expect(handler!).toContain('taps>=TAPS')
    expect(handler!).toContain('nextSeg()')
  })

  it('carries each segment own limits as one number each, and the 15-minute backstop', () => {
    // Sixty dots or 150s for segment b, 20 beats of 2s for d, 120s of breath
    // for e — and CAP, which is not the length of step 1 but the only thing
    // behind the two segments a tap has to end.
    expect(js).toMatch(/var TAPS=60,TAPMS=150000\b/)
    expect(js).toMatch(/var BEATS=20,BEATMS=2000,BREATHE=120000;/)
    expect(js).toMatch(/var CAP=900000;/)
    // The backstop is checked before any segment gets the frame, so a phone
    // put down mid-errand still reaches the deciding step.
    const frame = fnBody(js, 'frame')
    expect(frame).toContain('if(now-t0>=CAP){running=false;go(2);return}')
    expect(frame.indexOf('CAP')).toBeLessThan(frame.indexOf("key==='b'"))
  })

  it('replaces the beating dot with a counted line for a reader who asked for stillness', () => {
    expect(js).toContain("window.matchMedia('(prefers-reduced-motion: reduce)')")
    const segD = fnBody(js, 'segD')
    expect(segD).toContain('beatwrap.hidden=calm')
    expect(segD).toContain('nth.hidden=!(calm&&COUNTED)')
    // And the scale is not written at all in that case — the dot is gone, so
    // a transform on it would be work nobody sees.
    expect(fnBody(js, 'tickD')).toContain("if(!calm)beat.style.transform='scale('")
  })

  it('runs segment d by beats, or by the clock for a body task with nothing to count', () => {
    expect(js).toContain("var COUNTED=typeof cfg.bodyMs!=='number',BODYMS=COUNTED?BEATS*BEATMS:cfg.bodyMs")
    const tick = fnBody(js, 'tickD')
    expect(tick).toContain('el>=BODYMS')
    expect(tick).toContain('COUNTED')
  })

  it('reads its copy from the config island rather than carrying any', () => {
    expect(js).not.toMatch(/[一-鿿]/)
  })

  it('has nothing left to say about a note', () => {
    expect(js).not.toMatch(/note/i)
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
    // The same mechanism holds the offline notice.
    expect(h).toMatch(/id="lost"[^>]*hidden/)
  })

  it('drops the pending reveal whenever the flow leaves the deciding step', () => {
    // Otherwise the 800ms timer fires into the closing step and un-hides 还想
    // behind a section nobody is looking at, and the next round through the
    // deciding step starts with both halves already showing.
    const go = fnBody(js, 'go')
    expect(go).toContain('clearTimeout(pending)')
    expect(go).toMatch(/n!==2/)
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
    expect(ids.length).toBeGreaterThanOrEqual(8)
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

describe('groundingLines', () => {
  it('is 5-4-3-2-1, in that order, one sense at a time', () => {
    expect(groundingLines(translator('zh'))).toEqual([
      '找出房间里五样蓝色的东西。',
      '听出四种不同的声音。',
      '摸三种不同的质地。',
      '闻两种气味。',
      '说出一样你此刻尝到的味道。',
    ])
  })

  it('translates whole, and stays as quiet in English', () => {
    const en = groundingLines(translator('en'))
    expect(en).toHaveLength(5)
    expect(en.every((l) => !/[一-鿿]/.test(l))).toBe(true)
    expect(en.every((l) => !l.includes('!'))).toBe(true)
  })
})

describe('the flow end to end, as the script would walk it', () => {
  it('start on load, another round, finish', async () => {
    const id = await startUrge({ ...user, surf_scene: 'custom:打牌' })
    await postFetch({ op: 'round', id: String(id) })
    await postFetch({ op: 'finish', id: String(id), outcome: 'opened' })
    const row = (await getUrge(env.DB, 1, id)) as Urge
    expect(row).toMatchObject({
      state: '',
      trigger: 'custom:打牌',
      rounds: 2,
      outcome: 'opened',
      note: '',
    })
    expect(shanghaiDate(row.started_at)).toBe(TODAY)
  })
})
