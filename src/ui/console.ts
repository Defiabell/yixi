// Shared chrome for every signed-in page — /today, /review, /settings, /setup,
// /account, /admin. They must read as one surface that people tab between, not
// six separate designs.
//
// /review used to render its own header, and that is exactly the failure this
// module now prevents: its private copy had drifted to three text-only tabs, so
// tabbing to 「回顾」 visibly changed the furniture AND stranded the reader —
// 「怎么配」, 「账号」 and 「发号」 had no link on that page at all. The nav is
// shared code now, and a test renders every page and diffs their navs.
//
// This lives in its own module rather than inside any one page: a page module
// that doubles as the shared library for its siblings is a dependency direction
// that only gets worse as pages are added.
//
// --- three faces, one header -------------------------------------------------
//
// 「今日」 (goal-tending: /today, /today/goals, /today/review, /today/setup),
// 「拦截」 (the original interception console: /review, /settings, /setup) and
// 「渡」 (urge-surfing: /surf/review, /surf/setup — /surf itself, the flow, is
// reached from the home-screen icon or /surf/review's own entry button, never
// from this nav, so switching faces never auto-starts a record) are three
// different jobs sharing one nav row, and a five-to-six tab row was already the ceiling
// for what fits a phone width without wrapping. Splitting the tabs by face
// keeps each row at four or five, at the cost of one more tap to cross faces
// — which is the right trade, because nobody bounces between them mid-task.
// 「账号」 stays on every face, because it is none of them; the owner's
// 「发号」 stays only on 拦截, because a ticket window for someone else's
// interceptions has nothing to do with today's three goals or a craving being
// surfed. The face switch beside the brand now offers a link to each of the
// OTHER two faces, in a fixed order (today → breathe → surf), not just one.

import type { User } from '../types'
import { msg, type T } from '../i18n'
import { escapeHtml } from './layout'
import { ICON_CSS, icon, type IconName } from './icons'

// --- shared console chrome -------------------------------------------------

/**
 * Every page name is also an icon name, deliberately: a tab that cannot be
 * drawn is a compile error rather than a blank square on someone's phone.
 */
export type ConsolePage = Extract<
  IconName,
  | 'today'
  | 'goals'
  | 'progress'
  | 'todaysetup'
  | 'review'
  | 'settings'
  | 'setup'
  | 'account'
  | 'admin'
  | 'surfreview'
  | 'surfsetup'
>

/** The three faces one account can be on. `account` and `admin` are not of any of them. */
export type Face = 'today' | 'breathe' | 'surf'

/** Which face a page's tab belongs to — the only place that mapping is decided. */
export function faceOf(page: ConsolePage): Face {
  if (page === 'today' || page === 'goals' || page === 'progress' || page === 'todaysetup') return 'today'
  if (page === 'surfreview' || page === 'surfsetup') return 'surf'
  return 'breathe'
}

// The tab tables are module-level constants, so their labels cannot call a
// per-request `t()` where they are written — `msg()` marks them instead: the
// Chinese source is still the dictionary key, test/i18n.test.ts's guard finds
// it exactly as it finds a `t()` call, and `consoleHeader` passes each label
// through its own translator at render time.

/** 今日: look, jump, tick — three goals and how they got there. */
const TODAY_TABS: Array<[href: string, name: ConsolePage, label: string]> = [
  ['/today', 'today', msg('今日')],
  ['/today/goals', 'goals', msg('目标')],
  ['/today/review', 'progress', msg('回看')],
  ['/today/setup', 'todaysetup', msg('怎么配')],
]

/** 拦截: the original console — open an app, get one breath first. */
const BREATHE_TABS: Array<[href: string, name: ConsolePage, label: string]> = [
  ['/review', 'review', msg('回顾')],
  ['/settings', 'settings', msg('设置')],
  ['/setup', 'setup', msg('怎么配')],
]

/**
 * 渡: an urge-surfing flow — ride the craving out instead of jumping. `/surf`
 * itself is deliberately not a tab: it writes an `urges` row the moment it
 * loads (src/ui/surf.ts), so a nav entry for it would let somebody browsing
 * between faces silently start a record just by landing here. The face's home
 * is /surf/review instead (see FACE_HOME below), and /surf/review carries its
 * own entry button into the flow for when an urge actually needs surfing.
 */
const SURF_TABS: Array<[href: string, name: ConsolePage, label: string]> = [
  ['/surf/review', 'surfreview', msg('回看')],
  ['/surf/setup', 'surfsetup', msg('怎么配')],
]

const FACE_HOME: Record<Face, { href: string; label: string }> = {
  today: { href: '/today', label: msg('今日') },
  breathe: { href: '/review', label: msg('拦截') },
  // Not /surf: the face switch is a link somebody idly taps to look around,
  // and /surf writes a record on load. /surf/review is read-only.
  surf: { href: '/surf/review', label: msg('渡') },
}

/**
 * Fixed display order for the face switch — today, then breathe, then surf —
 * so a page on any face always offers the other two in the same sequence
 * rather than one that depends on which face happens to be current.
 */
const FACES: Face[] = ['today', 'breathe', 'surf']

/**
 * Four or five tabs a face, plus 账号 on both and 发号 for the owner on 拦截
 * only. It was one row of up to seven.
 *
 * The three that used to share this row with everything else were all the same
 * mistake: a step of one job given a destination of its own. 「实测」 merged
 * into 「候选」 (finding a string and trying it are two halves of one task), and
 * then 「候选」 itself merged into the URL scheme field on /settings — nobody
 * ever wanted to go look at a list of candidates; they wanted to fill in that
 * one box, and being sent away from a half-typed form to do it lost the form.
 *
 * 「今日」 is in the first position of its face because it is the page users
 * open every time.
 *
 * Every remaining tab keeps its word: 「回顾」 、「回看」 and 「怎么配」 have no
 * icon anyone would guess, and an icon-only nav would trade a scroll nobody can
 * see for a guess nobody can make. The current tab sits on a pale ink disc.
 */
export function consoleHeader(user: User, active: ConsolePage, t: T): string {
  const face = faceOf(active)
  const tab = (href: string, name: ConsolePage, text: string): string =>
    `<a href="${href}"${active === name ? ' class="on" aria-current="page"' : ''}>${icon(name)}<span class="lb">${text}</span></a>`
  const faceTabs = face === 'today' ? TODAY_TABS : face === 'breathe' ? BREATHE_TABS : SURF_TABS
  const otherFaces = FACES.filter((f) => f !== face).map((f) => FACE_HOME[f])
  return `<header>
  <span class="brand">一息</span><span class="facename">· ${t(FACE_HOME[face].label)}</span>
  <span class="who">${escapeHtml(user.name)}</span>
  ${otherFaces.map((home) => `<a class="face" href="${home.href}">${t(home.label)} ›</a>`).join('\n  ')}
  <nav aria-label="${t('导航')}">
    ${faceTabs.map(([href, name, label]) => tab(href, name, t(label))).join('\n    ')}
    ${tab('/account', 'account', t('账号'))}
    ${user.is_owner && face === 'breathe' ? tab('/admin', 'admin', t('发号')) : ''}
  </nav>
</header>`
}

/**
 * Extends the theme tokens layout.ts already emitted (--bg/--fg/--dim/--faint/
 * --rule/--font), so these pages wear whichever face the owner picks at /mock.
 * /review appends its chart CSS to this rather than carrying a shell of its own.
 *
 * The type scale is deliberately not small. It was: 15px body, 12px notes, and
 * 9.5px nav labels, which is below what Apple will even render legibly on a
 * phone held at arm's length. Nothing here is smaller than 11px now, and the
 * body sits at 17px — iOS's own default.
 *
 * Two additions of their own:
 *   - `--num`, a UI font for figures and numeric inputs. The 「墨」 skin sets a
 *     serif for prose, and 宋体 digits are proportional — fine in a sentence,
 *     bad in a seconds field. Same split /review makes.
 *   - `font-size:16px` on every input, which is load-bearing rather than a
 *     style choice: mobile Safari zooms the viewport on focus for anything
 *     smaller, and never zooms back out.
 */
export const CONSOLE_CSS = `
:root{
  --num:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",system-ui,sans-serif;
  --danger:#a8543c;
  /* The console pages are read, not glanced at, so their secondary greys sit
     darker than the breathing page's: --dim carries whole paragraphs (lede,
     notes, labels) and --faint only what is genuinely decorative. The
     breathing page keeps layout.ts's quieter values. Measured on the paper
     theme: .70 ≈ 6:1, .46 ≈ 3.4:1 against the ground. */
  --dim:rgba(31,28,24,.70);
  --faint:rgba(31,28,24,.46);
  /* Three 国画 pigments, desaturated until they sit on the paper like a wash
     rather than ink, each marking one kind of thing wherever it appears: 花青
     (--qing) a jump out to another app, 赭石 (--zhe) the sub-tasks a goal is
     made of, 朱砂 (--zhu) what was done today. A -wash is a fill that REPLACES
     a border rather than joining one; a -rule is for the hairlines inside a
     washed section. 朱砂 has neither: it only ever paints a dot or a small
     filled circle, never a section, so a --zhu-wash was defined and never
     referenced — every token here has a user. Dark is a second tuning rather
     than an inversion — the light values go muddy on near-black. --danger is
     not one of the three: 删除 keeps its own red, and nothing else may borrow
     it. */
  --qing:#4a6482;
  --qing-wash:rgba(74,100,130,.085);
  --qing-rule:rgba(74,100,130,.28);
  --zhe:#8a6338;
  --zhe-wash:rgba(138,99,56,.085);
  --zhe-rule:rgba(138,99,56,.28);
  --zhu:#b5452f;
}
@media (prefers-color-scheme:dark){:root{
  --danger:#c9795c;--dim:rgba(238,235,228,.68);--faint:rgba(238,235,228,.44);
  --qing:#9db4cf;--qing-wash:rgba(157,180,207,.09);--qing-rule:rgba(157,180,207,.30);
  --zhe:#d0a978;--zhe-wash:rgba(208,169,120,.09);--zhe-rule:rgba(208,169,120,.30);
  --zhu:#e0846c;
}}
body{font-size:17px;line-height:1.75}
header,main{max-width:520px;margin:0 auto;padding:0 18px}
header{display:flex;align-items:center;gap:10px;padding-top:22px;padding-bottom:12px}
.brand{font-size:20px;font-weight:600;letter-spacing:.24em;text-indent:.24em;flex:none;white-space:nowrap}
.facename{font-size:13px;color:var(--faint);margin-left:4px;flex:none;white-space:nowrap}
.who{font-size:13px;color:var(--faint);flex:none;white-space:nowrap}
/* padding, not just line-height, gets the tap target to 44px without making
   the link itself look like a button — it is one line of quiet text next to
   the username, not a call to action. flex:none + white-space:nowrap on this
   and its two neighbours above keep the header's fixed labels from being
   squeezed and wrapped by the flexbox before header nav's own tabs give way
   — a narrow phone should crush the nav, not this row's own furniture. */
a.face{font-size:13px;color:var(--faint);text-decoration:none;display:inline-flex;
  align-items:center;padding:14px 4px;min-height:44px;box-sizing:border-box;
  flex:none;white-space:nowrap}
/* Wrapping is the safety net, not the design: six items at this size fit one
   row inside a 375px phone, and a wrap only ever beats the horizontal scroll
   this used to need — that scrollbar is hidden, so nothing announced it. */
header nav{
  margin-left:auto;display:flex;align-items:flex-end;justify-content:flex-end;
  flex-wrap:wrap;gap:1px;min-width:0;
}
header nav a{flex:none;display:inline-flex;flex-direction:column;align-items:center;gap:3px;
  padding:5px 5px;border-radius:8px;color:var(--faint);text-decoration:none}
header nav a .lb{font-size:11px;line-height:1.3;letter-spacing:0;white-space:nowrap}
header nav a.on{color:var(--fg);background:var(--ring-track)}
/* On a phone the header is two rows, not one squeezed row: brand, face name,
   user and the face switch on the first; the tabs on their own line below,
   aligned with the content. Measured on an iPhone 14 viewport (390px): the
   one-row layout broke 「一息」 across two lines and pushed 「账号」 onto a
   third. Wrapping is the layout here, not a safety net. */
@media (max-width:479px){
  header{flex-wrap:wrap;row-gap:6px}
  header nav{flex-basis:100%;margin-left:0;justify-content:flex-start;gap:6px}
  header nav a{padding:5px 7px}
}
main{padding-bottom:calc(40px + env(safe-area-inset-bottom))}
h1{font-size:20px;font-weight:600;margin:8px 0 6px}
h2{margin:0 0 10px;font-size:14px;font-weight:400;color:var(--dim);letter-spacing:.12em}
p{margin:0 0 10px}
.num{font-family:var(--num);font-variant-numeric:tabular-nums}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:14px}
.lede{font-size:15px;line-height:1.75;color:var(--dim);margin-bottom:18px}
.note{font-size:14px;line-height:1.8;color:var(--dim);margin:10px 0 0}
.note a,.lede a{color:var(--dim)}
.card{border:1px solid var(--rule);border-radius:14px;padding:16px 16px 18px;margin:0 0 14px}
.card.off{opacity:.6}
.card-head{display:flex;align-items:baseline;gap:9px;margin-bottom:14px}
.card-head .name{font-size:17px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.card-head .key{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;color:var(--faint)}
.badge{margin-left:auto;font-size:12px;letter-spacing:.08em;border:1px solid var(--rule);border-radius:99px;padding:1px 9px;color:var(--dim);white-space:nowrap}
label{display:block;font-size:13px;color:var(--dim);margin:0 0 5px;line-height:1.5}
input[type=text],input[type=number]{display:block;width:100%;font:inherit;font-size:16px;line-height:1.4;
  padding:10px 12px;color:var(--fg);background:transparent;border:1px solid var(--rule);border-radius:10px}
input[type=number]{font-family:var(--num)}
input:focus{outline:1px solid var(--ring-prog);outline-offset:0}
.field{margin-bottom:14px}
.row{display:flex;gap:10px}
.row .field{flex:1;min-width:0}
.check{display:flex;align-items:center;gap:10px;margin:0 0 16px}
.check input{width:20px;height:20px;accent-color:var(--fg);margin:0;flex:0 0 auto}
.check label{margin:0;color:var(--fg);font-size:15px}
.actions{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
button.primary{background:var(--stop-bg);color:var(--stop-fg);border:1px solid var(--stop-border);
  border-radius:99px;padding:12px 26px;font-size:16px;min-height:46px}
button.primary:active{opacity:.72}
button.linky{color:var(--dim);font-size:14px;text-decoration:underline;text-underline-offset:3px;padding:11px 0;min-height:44px}
button.linky.danger{color:var(--danger)}
a.linky{color:var(--dim);font-size:14px}
.banner{border:1px solid var(--rule);border-radius:12px;padding:12px 15px;font-size:14px;line-height:1.75;margin:0 0 16px}
.banner.bad{border-color:var(--danger);color:var(--danger)}
/* Not .banner.bad: nothing is broken and nothing was rejected. An in-app
   browser is the environment being wrong for one step, so it reads as a
   caution. Shared, because /settings and /setup both say it. */
.banner.warn{display:flex;gap:9px;align-items:flex-start;border-color:var(--rule);color:var(--dim)}
.banner.warn b{color:var(--fg)}
.banner.warn .ic{flex:none;margin-top:3px;color:var(--dim)}
.banner.good{color:var(--dim)}
.banner-go{margin-left:.5rem;white-space:nowrap;text-underline-offset:3px;color:inherit}
.empty{border:1px dashed var(--rule);border-radius:14px;padding:26px 16px;text-align:center;color:var(--dim);font-size:15px;margin-bottom:16px}
hr.sep{border:0;border-top:1px solid var(--rule);margin:28px 0 18px}
.note-tight{margin-bottom:14px}
.note.flat{margin:0}
p.flat{margin:0}

/* --- add, at the top, one tap when closed --- */
.add{margin:0 0 22px}
.add > summary.addbtn{
  display:flex;align-items:center;justify-content:center;gap:9px;
  border:1px dashed var(--rule);border-radius:14px;padding:15px;
  color:var(--fg);font-size:16px;letter-spacing:.04em;cursor:pointer;list-style:none;
}
.add > summary.addbtn::-webkit-details-marker{display:none}
.add > summary.addbtn::marker{content:""}
.add > summary.addbtn:active{opacity:.7}
.add[open] > summary.addbtn{
  border-style:solid;color:var(--fg);border-radius:14px 14px 0 0;border-bottom:0;padding:14px 16px;
  justify-content:flex-start;
}
.add[open] > summary.addbtn .ic{transform:rotate(45deg);transition:transform .18s ease}
.add > .addform{border-radius:0 0 14px 14px;margin:0}

/* --- one configured app, collapsed to a line --- */
details.app{margin:0 0 10px;border:1px solid var(--rule);border-radius:14px;overflow:hidden}
details.app.off{opacity:.62}
details.app > summary{
  display:flex;align-items:baseline;gap:9px;padding:14px 16px;
  cursor:pointer;list-style:none;color:var(--fg);
}
details.app > summary::-webkit-details-marker{display:none}
details.app > summary::marker{content:""}
details.app > summary:active{background:var(--ring-track)}
details.app[open] > summary{border-bottom:1px solid var(--rule)}
.sname{font-size:17px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:0 1 auto}
.skey{font-size:13px;color:var(--dim);flex:0 0 auto}
.mini{margin-left:auto;flex:0 0 auto;display:inline-flex;align-items:center;gap:4px;
  font-size:13px;color:var(--dim);white-space:nowrap}
.mini .ic{width:14px;height:14px}
.mini .ic:not(:first-child){margin-left:5px}
details.app > summary .badge{margin-left:auto}
/* Without this nothing on a collapsed row says it opens. The row went from
   「a form you scroll past」 to 「a line you tap」, and a line that looks like
   plain text is a line nobody taps. */
details.app > summary .chev{flex:0 0 auto;width:14px;height:14px;color:var(--dim);
  margin-left:8px;transition:transform .18s ease}
details.app[open] > summary .chev{transform:rotate(90deg)}
/* The form inside carries the card's padding but not its border — the <details>
   is the card now, so a second outline would draw a box inside a box. */
details.app > form.card{border:0;border-radius:0;margin:0}
${ICON_CSS}`
