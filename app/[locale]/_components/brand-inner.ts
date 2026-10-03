/*
 * Warm Lamp, deepened (#1524): shared vocabulary of the inner brand pages
 * (use-case, migrate, sign-in), inlined into the page as a <style> instead of
 * shipped as a stylesheet. Why: a separate CSS file is one more render-blocking
 * request, and on these routes that cost one simulated RTT (sign-in LCP 2.32 s
 * -> 2.55 s against the 2.5 s gate); Tailwind utilities would instead grow
 * app/globals.css, which the landing also loads and which sits on the same
 * knife-edge. Inline <style> is the pattern the brand layouts already use.
 * No new tokens: every value is an existing var(--*) or a mix of one.
 *
 * Vocabulary: .bi-ember (the one marker: a small point of light), .bi-rows /
 * .bi-row / .bi-link (hairline lists, linked rows warm on hover), .bi-band
 * (heading rail + content column from 1024px), .bi-flow (page column; children
 * that are not .bi-hero/.bi-band sit on the content rail), .bi-pool / .bi-ribbon
 * / .bi-window (one lamp structure per page family).
 * Motion: transform/opacity/background only; off under prefers-reduced-motion.
 */
export const BI_NAMES = [
  'arrow',
  'band',
  'container',
  'devDate',
  'ember',
  'faq',
  'flow',
  'h2',
  'hero',
  'link',
  'more',
  'num',
  'pill',
  'pills',
  'pool',
  'ribbon',
  'ribbonA',
  'ribbonB',
  'ribbonSage',
  'row',
  'rowBody',
  'rowTitle',
  'rows',
  'stack',
  'window',
  'windowImg',
] as const
type Name = (typeof BI_NAMES)[number]

/** Class names as `s.band` etc., so JSX reads like a CSS module. */
export const s = Object.fromEntries(BI_NAMES.map((n) => [n, `bi-${n}`])) as Record<Name, string>

export const BRAND_INNER_CSS = `.bi-container {
  margin-inline: auto;
  width: 100%;
  max-width: 720px;
}
.bi-flow {
  display: flex;
  flex-direction: column;
  gap: 40px;
}
.bi-hero {
  position: relative;
}
@media (min-width: 1024px) {
  .bi-container {
    max-width: 1120px;
  }
  .bi-flow {
    gap: 72px;
  }
  .bi-flow > :not(.bi-hero):not(.bi-band):not(script) {
    margin-left: 280px;
  }
  .bi-band {
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
    column-gap: 40px;
    align-items: start;
  }
  .bi-band > h2 {
    position: sticky;
    top: 32px;
  }
}
.bi-band > h2 {
  margin: 0 0 8px;
}
@media (min-width: 1024px) {
  .bi-band > h2 {
    margin: 0;
    padding-top: 18px;
  }
}
.bi-ember {
  position: relative;
  flex: none;
  width: 8px;
  height: 8px;
  margin: 0 9px;
  border-radius: 50%;
  background: var(--accent);
}
.bi-ember::after {
  content: '';
  position: absolute;
  inset: -9px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--accent) 40%, transparent) 0,
    transparent 70%
  );
  opacity: 0.55;
  transition: opacity 200ms ease;
}
.bi-num {
  font-family: var(--font-fraunces);
  font-style: italic;
  color: var(--ink-2);
  letter-spacing: 0.8px;
}
.bi-rows {
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--hairline);
}
.bi-rows > li {
  border-bottom: 1px solid var(--hairline);
}
.bi-row {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr);
  column-gap: 12px;
  align-items: start;
  padding: 18px 0;
}
.bi-row > .bi-ember {
  margin-top: 9px;
}
.bi-rowTitle {
  margin: 0;
  color: var(--ink);
  letter-spacing: -0.2px;
}
.bi-rowBody {
  margin: 4px 0 0;
  color: var(--ink-2);
  line-height: 1.7;
}
.bi-link {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) 24px;
  column-gap: 12px;
  align-items: start;
  padding: 18px 8px 18px 0;
  min-height: 44px;
  color: inherit;
  text-decoration: none;
  background: transparent;
  transition: background-color 200ms ease;
}
.bi-link > .bi-ember {
  margin-top: 9px;
}
.bi-arrow {
  align-self: center;
  color: var(--ink-2);
  transition: transform 200ms ease, color 200ms ease;
}
.bi-link:hover,
.bi-link:focus-visible {
  background-color: color-mix(in srgb, var(--surface-alt) 75%, transparent);
}
.bi-link:hover .bi-arrow,
.bi-link:focus-visible .bi-arrow {
  transform: translateX(4px);
  color: var(--ink);
}
.bi-link:hover .bi-ember::after,
.bi-link:focus-visible .bi-ember::after {
  opacity: 1;
}
.bi-link:active {
  background-color: color-mix(in srgb, var(--accent-soft) 45%, transparent);
}
@media (min-width: 1024px) {
  .bi-link {
    grid-template-columns: 26px 200px minmax(0, 1fr) 24px;
    padding-left: 4px;
  }
  .bi-link .bi-rowBody {
    margin-top: 0;
  }
  .bi-link .bi-rowTitle {
    padding-top: 1px;
  }
}
.bi-stack {
  grid-template-columns: 26px minmax(0, 1fr) 24px;
}
@media (min-width: 1024px) {
  .bi-link.bi-stack {
    grid-template-columns: 26px minmax(0, 1fr) 24px;
  }
}
.bi-pills {
  border-top: 1px solid var(--hairline);
  margin: 0;
  padding: 8px 0 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 20px;
}
.bi-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 44px;
  color: var(--ink-2);
  text-decoration: none;
  transition: color 200ms ease, background-color 200ms ease;
}
.bi-pill:hover,
.bi-pill:focus-visible {
  color: var(--ink);
}
.bi-pill:hover .bi-ember::after,
.bi-pill:focus-visible .bi-ember::after {
  opacity: 1;
}
.bi-pool {
  position: absolute;
  left: 50%;
  top: 0;
  width: min(1100px, 160vw);
  height: 520px;
  transform: translateX(-62%);
  pointer-events: none;
  background: radial-gradient(
    closest-side,
    color-mix(in srgb, var(--accent-soft) 55%, var(--surface-alt)) 0,
    color-mix(in srgb, var(--surface-alt) 45%, transparent) 55%,
    transparent 100%
  );
}
@media (min-width: 1024px) {
  .bi-pool {
    height: 640px;
    transform: translateX(-70%);
  }
}
.bi-ribbon {
  display: block;
  width: 100%;
  height: 56px;
  margin-top: 8px;
  overflow: visible;
}
.bi-ribbonA {
  stop-color: var(--accent);
  stop-opacity: 0;
}
.bi-ribbonB {
  stop-color: var(--accent);
  stop-opacity: 0.85;
}
.bi-ribbonSage {
  stop-color: var(--saving);
  stop-opacity: 0.7;
}
.bi-window {
  position: relative;
  margin-bottom: 16px;
  width: 100%;
  height: 160px;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to bottom, transparent, var(--ink) 35%, var(--ink) 65%, transparent);
  mask-image: linear-gradient(to bottom, transparent, var(--ink) 35%, var(--ink) 65%, transparent);
}
@media (min-width: 1024px) {
  .bi-window {
    height: 240px;
  }
}
.bi-windowImg {
  position: absolute;
  left: -6%;
  top: 50%;
  width: 112%;
  max-width: none;
  height: auto;
  transform: translateY(-56%);
  opacity: 0.9;
}
.bi-h2 {
  color: var(--ink);
  letter-spacing: -0.2px;
}
.bi-faq {
  margin: 0;
  border-top: 1px solid var(--hairline);
}
.bi-faq > div {
  padding: 18px 0;
  border-bottom: 1px solid var(--hairline);
}
.bi-faq dt {
  color: var(--ink);
  letter-spacing: -0.2px;
}
.bi-faq dd {
  margin: 6px 0 0;
  color: var(--ink-2);
  line-height: 1.7;
}
.bi-more {
  border-bottom: 1px solid var(--hairline);
}
.bi-more > summary {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  cursor: pointer;
  list-style: none;
  color: var(--ink-2);
}
.bi-more > summary::-webkit-details-marker {
  display: none;
}
.bi-more > summary:hover {
  color: var(--ink);
}
.bi-more[open] > summary {
  display: none;
}
.bi-more > .bi-rows {
  border-top: 0;
}
.bi-devDate {
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
}
@media (prefers-reduced-motion: reduce) {
  .bi-ember::after,
  .bi-link,
  .bi-arrow,
  .bi-pill {
    transition: none;
  }
  .bi-link:hover .bi-arrow,
  .bi-link:focus-visible .bi-arrow {
    transform: none;
  }
}`
