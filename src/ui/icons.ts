/**
 * The icon language for the console pages — the 「印」 direction of the
 * /mock-ui sheet, adopted after it was compared against 「线」 on a phone.
 *
 * Three rules this module exists to keep, all of which were easy to violate
 * once every page drew its own marks:
 *
 *  1. Every icon is inline SVG. Zero external requests is a hard constraint of
 *     this product (layout.ts, enforced by CSP), so an <img> or a webfont icon
 *     set is not merely discouraged, it would be blocked.
 *  2. No emoji, ever. They render differently on every device, they are the
 *     wrong register for this product, and one of them landing in a warning
 *     would make the warning look like a toy.
 *  3. An icon has to carry information. A picture next to a paragraph that
 *     stays intact is more clutter, not less — so an icon arrives only where
 *     the words it sits beside got shorter, folded, or moved into a legend.
 *
 * One 24x24 grid, stroke-only, `currentColor`, no fill: an icon inherits the
 * colour of the text beside it and therefore needs no per-theme variant. Weight
 * is a CSS matter (`ICON_CSS`), not a per-path one, which is why the same
 * geometry serves a hairline caption and a danger line.
 */

import { escapeHtml } from './layout'

export type IconName =
  | 'caveat'
  | 'jump'
  | 'save'
  | 'agree'
  | 'source'
  | 'lockout'
  | 'clock'
  | 'loop'
  | 'chev'
  | 'fetch'
  | 'branch'
  | 'today'
  | 'goals'
  | 'progress'
  | 'todaysetup'
  | 'review'
  | 'settings'
  | 'lookup'
  | 'setup'
  | 'account'
  | 'admin'
  | 'surf'
  | 'surfreview'
  | 'surfsetup'
  | 'plus'

const ICONS: Record<IconName, string> = {
  caveat: '<path d="M12 4.9l8.1 14.2H3.9z"/><path d="M12 9.9v4.4"/><path d="M12 16.7h.01"/>',
  // Arrow leaving a frame: the jump out to another app.
  jump:
    '<path d="M18.4 13.6v4.4a1.4 1.4 0 0 1-1.4 1.4H6.8a1.4 1.4 0 0 1-1.4-1.4V7.8a1.4 1.4 0 0 1 1.4-1.4h4.4"/><path d="M14.6 4.8h4.6v4.6"/><path d="M11.4 12.6l7.6-7.6"/>',
  // Arrow into a tray: write it into the configuration.
  save: '<path d="M5.6 15.2v2.8a1.4 1.4 0 0 0 1.4 1.4h10a1.4 1.4 0 0 0 1.4-1.4v-2.8"/><path d="M12 4.8v9"/><path d="M8.4 10.4L12 14l3.6-3.6"/>',
  // List lines plus a tick clear of them: both collections say the same thing.
  agree: '<path d="M4.6 7.6h10.4M4.6 12h6.4M4.6 16.4h4"/><path d="M12.6 16.2l2.2 2.2 4.6-5.6"/>',
  source:
    '<path d="M10.2 13.8a3.5 3.5 0 0 1 0-5l2-2a3.5 3.5 0 0 1 5 5l-1 1"/><path d="M13.8 10.2a3.5 3.5 0 0 1 0 5l-2 2a3.5 3.5 0 0 1-5-5l1-1"/>',
  // A closed padlock: the failure mode is being locked out of your own phone.
  lockout:
    '<rect x="5.4" y="10.4" width="13.2" height="8.8" rx="2.2"/><path d="M8.6 10.4V8.2a3.4 3.4 0 0 1 6.8 0v2.2"/><path d="M12 13.8v2.2"/>',
  clock: '<circle cx="12" cy="12" r="8.2"/><path d="M12 7.4V12l3.2 2"/>',
  // A closed cycle: the intercept-jump-intercept loop a short grace produces.
  loop:
    '<path d="M6 12a6 6 0 0 1 6-6h5.2"/><path d="M14.8 3.4L17.6 6l-2.8 2.6"/><path d="M18 12a6 6 0 0 1-6 6H6.8"/><path d="M9.2 15.4L6.4 18l2.8 2.6"/>',
  chev: '<path d="M9.4 6.6l5.4 5.4-5.4 5.4"/>',
  // Brackets with a downward arrow: 「获取 URL 的内容」.
  fetch:
    '<path d="M9.4 5.2H6.6a1.4 1.4 0 0 0-1.4 1.4v10.8a1.4 1.4 0 0 0 1.4 1.4h2.8"/><path d="M14.6 5.2h2.8a1.4 1.4 0 0 1 1.4 1.4v10.8a1.4 1.4 0 0 1-1.4 1.4h-2.8"/><path d="M12 8v7.4"/><path d="M9.2 12.6L12 15.4l2.8-2.8"/>',
  // A flowchart decision: one diamond, two exits. 「如果」.
  branch: '<path d="M11.6 3.8l5.8 5.8-5.8 5.8-5.8-5.8z"/><path d="M11.6 15.4v4.8"/><path d="M17.4 9.6h3.4"/>',
  // A ring with the day's one mark inside it: today, and the dot you leave on it.
  today: '<circle cx="12" cy="12" r="8.2"/><circle class="fillmark" cx="12" cy="12" r="2.4"/>',
  // A list, each line with its own dot: three goals, not one running total.
  goals:
    '<path d="M8.6 7.4h10.8M8.6 12h10.8M8.6 16.6h10.8"/><circle class="fillmark" cx="5" cy="7.4" r="1.3"/><circle class="fillmark" cx="5" cy="12" r="1.3"/><circle class="fillmark" cx="5" cy="16.6" r="1.3"/>',
  // review's three bars, plus a dot on the tallest: the today face's 回看
  // looks back at goal days rather than interceptions.
  progress:
    '<path d="M4.4 19.6h15.2"/><path d="M7.6 16.6v-3.4M12 16.6V9.2M16.4 16.6v-5.6"/><circle class="fillmark" cx="16.4" cy="6.4" r="1.4"/>',
  review: '<path d="M4.4 19.6h15.2"/><path d="M7.6 16.6v-4.4M12 16.6V5.8M16.4 16.6v-7.2"/>',
  settings:
    '<path d="M4.4 8.6h15.2M4.4 15.4h15.2"/><circle cx="9.4" cy="8.6" r="2.2"/><circle cx="14.8" cy="15.4" r="2.2"/>',
  lookup: '<circle cx="10.8" cy="10.8" r="5.6"/><path d="M15 15l4.4 4.4"/>',
  setup: '<path d="M4.6 7.8l1.7 1.7 2.7-3"/><path d="M4.6 15.6l1.7 1.7 2.7-3"/><path d="M12.4 8.6h7M12.4 16.4h7"/>',
  // Same mark as setup: the today face's 「怎么配」 is the same idea (make the
  // page one tap away) applied to a different shortcut, not a different concept
  // that happens to share a name.
  todaysetup:
    '<path d="M4.6 7.8l1.7 1.7 2.7-3"/><path d="M4.6 15.6l1.7 1.7 2.7-3"/><path d="M12.4 8.6h7M12.4 16.4h7"/>',
  // A key rather than a person: this account IS a token.
  account: '<circle cx="8.8" cy="12" r="3.4"/><path d="M12.2 12h7.4"/><path d="M16.6 12v2.8M19.2 12v2"/>',
  admin: '<path d="M4.8 11.2l6.4-6.4h7.6v7.6l-6.4 6.4z"/><circle cx="15.4" cy="8.6" r="1.3"/>',
  // A single wave, and the small mark riding above it: the craving as a swell
  // that rises and passes, and staying on top of it rather than under it.
  surf: '<path d="M4.4 15.6a7.8 7.8 0 0 1 15.2 0"/><circle class="fillmark" cx="12" cy="6.2" r="1.6"/>',
  // Three bars of unequal height, no dot on any of them: unlike progress's
  // tally, this is a spread across the day's hours, not a running total with
  // one day picked out.
  surfreview: '<path d="M4.4 19.6h15.2"/><path d="M7.6 16.6v-3.2M12 16.6v-8.4M16.4 16.6v-5.6"/>',
  // Same mark as setup/todaysetup: 渡's 「怎么配」 is the same idea (make the
  // page one tap away) applied to a third shortcut, not a third concept that
  // happens to share a name.
  surfsetup:
    '<path d="M4.6 7.8l1.7 1.7 2.7-3"/><path d="M4.6 15.6l1.7 1.7 2.7-3"/><path d="M12.4 8.6h7M12.4 16.4h7"/>',
  // A plain cross. It rotates 45° when its <details> opens, so the same mark is
  // both 「加一个」 and 「收起来」 without a second icon to learn.
  plus: '<path d="M12 5.4v13.2M5.4 12h13.2"/>',
}

/** The three confidence tiers the /settings picker labels a candidate with. */
export type Tier = 'verified' | 'listed' | 'derived'

/**
 * The tiers are seals rather than generic status glyphs, which is the one place
 * this icon set departs from plain line art. A solid seal with the mark knocked
 * out reads as "stamped, settled"; a hairline seal as "recorded"; a seal drawn
 * in dashes as "not really a seal at all". Rotated a couple of degrees because
 * a stamp pressed by hand never lands square.
 *
 * Shape, not colour, carries the difference — the three must stay
 * distinguishable at 16px in both colour schemes, which is the only criterion
 * these were chosen against.
 */
const SEALS: Record<Tier, string> = {
  verified:
    '<g transform="rotate(-2 12 12)"><rect class="fillmark" x="3.2" y="3.2" width="17.6" height="17.6" rx="3.6"/><path class="knock" d="M8 12.5l2.8 2.6 5.2-5.9"/></g>',
  listed:
    '<g transform="rotate(-2 12 12)"><rect x="3.6" y="3.6" width="16.8" height="16.8" rx="3.4"/><path d="M8 9.6h8M8 12.8h8M8 16h4.6"/></g>',
  derived:
    '<g transform="rotate(-2 12 12)"><rect x="3.6" y="3.6" width="16.8" height="16.8" rx="3.4" stroke-dasharray="2.8 3.2"/><path d="M8.4 15.6l2.2-2.2M13.4 10.6l2.2-2.2"/></g>',
}

export interface IconOpts {
  /**
   * Present only when the icon is the sole carrier of its meaning. An icon
   * beside its own label is decorative and must be hidden from a screen reader,
   * or the label gets read twice.
   */
  label?: string
  cls?: string
}

function svg(inner: string, o: IconOpts): string {
  const a11y =
    o.label === undefined
      ? ' aria-hidden="true" focusable="false"'
      : ` role="img" aria-label="${escapeHtml(o.label)}"`
  return `<svg class="ic${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 24 24"${a11y}>${inner}</svg>`
}

export function icon(name: IconName, o: IconOpts = {}): string {
  return svg(ICONS[name], o)
}

export function seal(tier: Tier, o: IconOpts = {}): string {
  return svg(SEALS[tier], o)
}

/**
 * A row whose reasoning is one tap away.
 *
 * This is the only sanctioned way to shorten a paragraph that must not be
 * deleted: the claim stays permanently visible, the argument for it moves
 * behind a `<summary>`. Native `<details>` on purpose — these pages carry no
 * JavaScript they do not need, and a fold that depends on a script is a fold
 * that can fail to open.
 */
export function fold(summary: string, inner: string, cls?: string): string {
  return `<details${cls ? ` class="${cls}"` : ''}>
    <summary>${icon('chev', { cls: 'chev' })}${summary}</summary>
    ${inner}
  </details>`
}

/**
 * One icon, then prose, on a single flex row.
 *
 * The prose MUST be wrapped in one element — a bare text run beside the inline
 * <svg> becomes a second flex item and each following inline element becomes a
 * third, which collapses the line into a column.
 */
export function hl(iconName: IconName, inner: string): string {
  return `<p class="hl">${icon(iconName)}<span>${inner}</span></p>`
}

/**
 * Appended to CONSOLE_CSS, so every page that wears the console chrome gets the
 * icon primitives without importing them one by one.
 *
 * `--bg` is the knock-out colour for the solid seal, which is why the seal only
 * works on a page background and not, say, inside the dark 「试跳」 button.
 */
export const ICON_CSS = `
.ic{width:17px;height:17px;flex:none;display:inline-block;vertical-align:-.2em;
  fill:none;stroke:currentColor;stroke-width:2.1;stroke-linecap:round;stroke-linejoin:round}
.ic.lg{width:22px;height:22px}
.ic .fillmark{fill:currentColor;stroke:none}
.ic .knock{stroke:var(--bg);stroke-width:2.6}
details{margin:7px 0 0}
summary{display:inline-flex;align-items:center;gap:6px;cursor:pointer;list-style:none;
  font-size:13px;letter-spacing:.04em;color:var(--dim)}
summary::-webkit-details-marker{display:none}
summary::marker{content:""}
details[open] > summary{color:var(--fg)}
summary .ic.chev{width:13px;height:13px;transition:transform .18s ease}
details[open] > summary .ic.chev{transform:rotate(90deg)}
details > p{margin:8px 0 0;font-size:14px;line-height:1.85;color:var(--dim)}
details > p:last-child{margin-bottom:9px}
details > p b{color:var(--fg)}
.hl{display:flex;gap:8px;align-items:flex-start;margin:0}
.hl .ic{margin-top:3px}
`
