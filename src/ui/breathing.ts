import type { T } from '../i18n'

/**
 * The breathing orb shared by the interception page (breathe.ts) and the
 * urge-surfing flow (surf.ts): markup, CSS and timing constants, extracted
 * out of breathe.ts so a future change to the breath animation cannot land
 * in one caller and silently miss the other.
 *
 * Extraction, not a rewrite: orbHtml() and ORB_CSS below are the exact bytes
 * breathe.ts rendered inline before this file existed. test/breathe.test.ts
 * hashes the rendered /b and expiredPage() HTML with SHA-256 and pins the
 * result, so any accidental change here (or in how breathe.ts reassembles
 * BREATHE_CSS around ORB_CSS) fails loudly instead of drifting quietly.
 */

/** Inhale 4s, exhale 6s. The longer exhale is what actually settles you. */
export const INHALE_MS = 4000
export const EXHALE_MS = 6000

/**
 * The orb markup: the ink wash (`.ink`, 「墨」) and the single dot
 * (`.dot`, 「息」) share one DOM, toggled by the `body.t-*` rules in
 * ORB_CSS; the ring is the progress indicator, and #phase is the inhale/
 * exhale word the script below swaps in place.
 */
export function orbHtml(t: T): string {
  return `<div class="orbwrap">
  <div class="orb" role="img" aria-label="${t('呼吸引导')}">
    <div class="ink" aria-hidden="true"><i class="l1"></i><i class="l2"></i><i class="l3"></i></div>
    <div class="dot" aria-hidden="true"></div>
    <svg class="ring" viewBox="0 0 240 240" aria-hidden="true" focusable="false">
      <circle class="tr" cx="120" cy="120" r="112"></circle>
      <circle class="pg" id="ring" cx="120" cy="120" r="112"></circle>
    </svg>
  </div>
  <p class="phase" id="phase" aria-hidden="true">${t('吸气')}</p>
</div>`
}

/**
 * CSS for the markup above: `.orbwrap`/`.orb`/`.ring`/`.ink`/`.dot`, their
 * `@keyframes`, and `.phase` — the contiguous span of the original
 * BREATHE_CSS where the orb rules actually sit.
 *
 * Two things that read as "orb" but stay behind in breathe.ts, on purpose:
 * `:root{--level:.5}` (the custom property `.ink`/`.dot` read) and the
 * reduced-motion `.ink i{animation:none}` line. Neither is textually
 * adjacent to this block in the original stylesheet — `.stage`/`.prelude`
 * sit between `:root` and `.orbwrap`, and the reduced-motion line shares
 * a `@media` block with `.stop,.go,.after` — so pulling them in here would
 * force breathe.ts to reorder its stylesheet to put ORB_CSS back together,
 * which is exactly what the SHA-256 byte-identity guard exists to catch.
 * breathe.ts splices this constant back in at the position the block always
 * occupied instead of prepending it.
 */
export const ORB_CSS = `.orbwrap{display:flex;flex-direction:column;align-items:center}
.orb{position:relative;width:min(64vw,268px);height:min(64vw,268px);display:grid;place-items:center}

.ring{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg);overflow:visible}
.ring circle{fill:none;stroke-width:1.3;stroke-linecap:round}
.ring .tr{stroke:var(--ring-track)}
.ring .pg{stroke:var(--ring-prog)}

/* v1 「墨」 — three offset washes drifting on slow coprime cycles inside one
   mass that scales with the breath, so the silhouette never quite repeats. */
.ink{
  position:absolute;width:100%;height:100%;
  transform:scale(calc(.60 + .40*var(--level)));
  opacity:calc(.50 + .50*var(--level));
  will-change:transform,opacity;
}
.ink i{position:absolute;display:block;border-radius:50%;filter:blur(var(--ink-blur))}
.ink .l1{left:6%;top:8%;width:86%;height:84%;
  background:radial-gradient(circle at 47% 45%,var(--ink-a) 0%,var(--ink-b) 44%,transparent 68%);
  animation:d1 41s ease-in-out infinite}
.ink .l2{left:14%;top:3%;width:72%;height:78%;opacity:.74;
  background:radial-gradient(circle at 58% 60%,var(--ink-a) 0%,var(--ink-b) 38%,transparent 63%);
  animation:d2 59s ease-in-out infinite}
.ink .l3{left:1%;top:17%;width:80%;height:73%;opacity:.9;
  background:radial-gradient(circle at 40% 56%,var(--ink-b) 0%,transparent 64%);
  animation:d3 73s ease-in-out infinite}
@keyframes d1{0%{transform:translate(0,0) rotate(0deg) scale(1)}50%{transform:translate(2.5%,-3%) rotate(180deg) scale(1.09)}100%{transform:translate(0,0) rotate(360deg) scale(1)}}
@keyframes d2{0%{transform:translate(0,0) rotate(0deg) scale(1.04)}50%{transform:translate(-3%,3%) rotate(-180deg) scale(.94)}100%{transform:translate(0,0) rotate(-360deg) scale(1.04)}}
@keyframes d3{0%{transform:translate(0,0) rotate(0deg) scale(.96)}50%{transform:translate(3%,3.5%) rotate(150deg) scale(1.07)}100%{transform:translate(0,0) rotate(300deg) scale(.96)}}

/* v2 「息」 — one dot. Nothing else. */
.dot{
  position:absolute;width:22%;height:22%;border-radius:50%;background:var(--dot);
  transform:scale(calc(.44 + .56*var(--level)));
  opacity:calc(.60 + .40*var(--level));
  will-change:transform,opacity;
}
body.t-breath .ink{display:none}
body.t-ink .dot{display:none}

.phase{margin:2.6rem 0 0;font-size:.95rem;color:var(--dim);letter-spacing:.5em;text-indent:.5em}`
