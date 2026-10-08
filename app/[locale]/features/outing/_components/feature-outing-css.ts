/*
 * Page-only styles for /features/outing (#1633), inlined like brand-inner.ts
 * (same reason: one render-blocking request less on a brand page) and with the
 * same names-array + `f` map pattern, but kept out of brand-inner.ts so the
 * other brand pages' bytes do not change. The shared vocabulary (.bi-band,
 * .bi-rows, .bi-faq, .bi-ember ...) still comes from brand-inner.ts.
 *
 * No new tokens: every value is an existing var(--*) or a mix of one. Type
 * sizes are not set here; the markup uses the text-* classes.
 *
 * Motion rules (PRODUCT.md / DESIGN.md): transform and opacity only,
 * cubic-bezier(0.22, 1, 0.36, 1), at most 600 ms per animation or transition,
 * nothing bounces, nothing loops.
 *
 * Two failure modes this file is built around, both silent:
 * - The resting state of every animated element is its FINAL frame. Animation
 *   only applies when a script has set data-live (walkthrough) or
 *   data-reveal="armed" (reveals). No script, or reduced motion, shows the
 *   finished picture; the reverse would leave blank boxes.
 * - The @media (prefers-reduced-motion: reduce) block at the end strips every
 *   animation and transition. A new rule added without a line there still
 *   moves for people who asked it not to.
 */
export const FO_NAMES = [
  'a',
  'amt',
  'aDash',
  'aHot',
  'aSoft',
  'art',
  'btn',
  'bubble',
  'card',
  'cards',
  'ch',
  'chat',
  'chip',
  'ctaRow',
  'ctl',
  'ctlIcon',
  'dot',
  'dotOn',
  'e',
  'fChip',
  'fTag',
  'fcard',
  'field',
  'fill',
  'flying',
  'fold',
  'foldRow',
  'friends',
  'label',
  'mHot',
  'motif',
  'name',
  'phone',
  'phoneWrap',
  'reveal',
  'row',
  'rows',
  'scene',
  'step',
  'stepBody',
  'stepNum',
  'stepTitle',
  'steps',
  'tag',
  'walk',
] as const
type Name = (typeof FO_NAMES)[number]

/** Class names as `f.walk` etc., so JSX reads like a CSS module. */
export const f = Object.fromEntries(FO_NAMES.map((n) => [n, `fo-${n}`])) as Record<Name, string>

export const FEATURE_OUTING_CSS = `.fo-ctaRow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px 24px;
}
@media (min-width: 768px) {
  .fo-ctaRow {
    justify-content: flex-start;
  }
}
.fo-motif {
  display: block;
  width: 200px;
  height: auto;
  margin: 28px auto 0;
}
@media (min-width: 768px) {
  .fo-motif {
    margin-left: 0;
  }
}
.fo-motif path {
  fill: none;
  stroke: var(--ink-3);
  stroke-width: 1.5;
  stroke-linecap: round;
  opacity: 0.6;
}
.fo-motif circle {
  fill: var(--surface);
  stroke: var(--ink-3);
  stroke-width: 1.5;
}
.fo-motif .fo-mHot {
  fill: var(--accent);
  stroke: none;
}
.fo-walk {
  display: grid;
  gap: 24px;
}
@media (min-width: 640px) {
  .fo-walk {
    grid-template-columns: 264px minmax(0, 1fr);
    gap: 40px;
    align-items: center;
  }
}
.fo-phoneWrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.fo-phone {
  position: relative;
  width: 264px;
  max-width: 100%;
  height: 440px;
  overflow: hidden;
  border-radius: var(--radius-card);
  border: 1px solid var(--hairline);
  background: var(--surface-alt);
}
.fo-phone::before {
  content: '';
  position: absolute;
  top: 10px;
  left: 50%;
  z-index: 1;
  width: 48px;
  height: 4px;
  margin-left: -24px;
  border-radius: 2px;
  background: var(--grabber);
}
.fo-scene {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 32px 16px 16px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 240ms cubic-bezier(0.22, 1, 0.36, 1);
}
.fo-scene.is-active {
  opacity: 1;
}
.fo-label {
  margin: 0;
  color: var(--ink-3);
}
.fo-field {
  display: flex;
  align-items: center;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--hairline);
  border-radius: var(--radius-bubble);
  background: var(--surface);
  color: var(--ink);
}
.fo-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  border-radius: var(--radius-bubble);
  background: var(--ink);
  color: var(--on-fill);
}
.fo-card {
  padding: 12px;
  border: 1px solid var(--hairline);
  border-radius: var(--radius-bubble);
  background: var(--surface);
}
.fo-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 12px;
  border-radius: var(--radius-chip);
  background: var(--accent-soft);
  color: var(--ink);
}
.fo-chat {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin-top: 16px;
}
.fo-bubble {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  max-width: 92%;
  padding: 12px;
  border-radius: var(--radius-bubble);
  background: var(--surface);
  border: 1px solid var(--hairline);
  color: var(--ink);
}
.fo-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.fo-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--hairline);
  border-radius: var(--radius-bubble);
  background: var(--surface);
  color: var(--ink);
}
.fo-row > .fo-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fo-name {
  min-width: 0;
}
.fo-amt {
  flex: none;
  font-variant-numeric: tabular-nums;
}
.fo-dot {
  position: relative;
  flex: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid var(--ink-3);
}
.fo-dot > .fo-fill {
  position: absolute;
  inset: -1px;
  border-radius: 50%;
  background: var(--accent);
}
.fo-dotOn {
  background: var(--accent);
  border-color: var(--accent);
}
.fo-tag {
  flex: none;
  color: var(--ink-3);
}
.fo-e {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--hairline);
  color: var(--ink);
}
.fo-e > div {
  min-width: 0;
}
.fo-e p {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fo-ctl {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  min-width: 44px;
  padding: 0 16px;
  border: 1px solid var(--hairline);
  border-radius: var(--radius-chip);
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
}
.fo-ctlIcon {
  flex: none;
  fill: currentColor;
}
.fo:not([data-live]) .fo-ctl {
  visibility: hidden;
}
.fo-steps {
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--hairline);
}
.fo-steps > li {
  border-bottom: 1px solid var(--hairline);
}
.fo-step {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr);
  column-gap: 12px;
  width: 100%;
  min-height: 44px;
  padding: 16px 8px 16px 8px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 200ms ease;
}
.fo-step:hover {
  background-color: color-mix(in srgb, var(--surface-alt) 75%, transparent);
}
.fo-step[aria-current='step'] {
  background-color: color-mix(in srgb, var(--accent-soft) 45%, transparent);
}
.fo-stepNum {
  padding-top: 2px;
}
.fo-stepTitle {
  display: block;
  color: var(--ink);
  letter-spacing: -0.2px;
}
.fo-stepBody {
  display: block;
  margin-top: 4px;
  color: var(--ink-2);
  line-height: 1.7;
}
.fo-cards {
  display: grid;
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}
@media (min-width: 640px) {
  .fo-cards {
    grid-template-columns: 1fr 1fr;
  }
}
.fo-cards > li {
  display: flex;
}
.fo-cards > li > div {
  display: flex;
  flex: 1;
}
.fo-cards .fo-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  padding: 20px;
  border-radius: var(--radius-card);
}
.fo-art {
  display: block;
  width: 48px;
  height: 48px;
  margin-bottom: 4px;
}
.fo-art path,
.fo-art rect,
.fo-art circle,
.fo-art line {
  fill: none;
  stroke: var(--ink-3);
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.fo-art .fo-aHot {
  fill: var(--accent);
  stroke: none;
}
.fo-art .fo-aSoft {
  fill: var(--accent-soft);
}
.fo-art .fo-aDash {
  stroke-dasharray: 3 3;
}
.fo-foldRow {
  position: relative;
  width: 100%;
  max-width: 360px;
  margin: 0 auto;
}
.fo-fold {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  column-gap: 32px;
}
.fo-fcard {
  min-height: 112px;
  padding: 16px;
  border: 1px solid var(--hairline);
  border-radius: var(--radius-card);
  background: var(--surface);
  color: var(--ink);
}
.fo-fcard p {
  margin: 0;
}
.fo-fTag {
  display: inline-block;
  margin-top: 8px;
  padding: 2px 8px;
  border-radius: var(--radius-chip);
  background: var(--hairline);
  color: var(--ink-2);
}
.fo-fChip {
  position: absolute;
  top: 62px;
  left: calc(50% + 28px);
  width: calc(50% - 40px);
  justify-content: center;
  padding: 0 8px;
  text-align: center;
}
.fo-friends {
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--hairline);
}
.fo-friends > li {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr);
  column-gap: 12px;
  padding: 16px 0;
  border-bottom: 1px solid var(--hairline);
  color: var(--ink-2);
  line-height: 1.7;
}
.fo-friends > li > .bi-ember {
  margin-top: 9px;
}

/* Walkthrough: runs only once the island has set data-live (it is in view and
 * motion is allowed). Without data-live every scene rests on its final frame. */
@keyframes fo-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes fo-rise {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}
@keyframes fo-drop {
  from { opacity: 0; transform: translateY(-88px); }
  to { opacity: 1; transform: none; }
}
.fo[data-live] .is-active .fo-ch {
  animation: fo-fade 120ms linear both;
}
.fo[data-live] .is-active .fo-btn {
  animation: fo-fade 360ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
.fo[data-live] .is-active .fo-a,
.fo[data-live] .is-active .fo-bubble {
  animation: fo-rise 480ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
.fo[data-live] .is-active .fo-bubble {
  animation-delay: 200ms;
}
.fo[data-live] .is-active .fo-flying {
  animation: fo-drop 600ms cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: 500ms;
}
.fo[data-live] .is-active .fo-fill {
  animation: fo-fade 360ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
.fo[data-live] .is-active .fo-d0 { animation-delay: 0ms; }
.fo[data-live] .is-active .fo-d1 { animation-delay: 200ms; }
.fo[data-live] .is-active .fo-d2 { animation-delay: 400ms; }
.fo[data-live] .is-active .fo-d3 { animation-delay: 600ms; }
.fo[data-live] .is-active .fo-d4 { animation-delay: 500ms; }
.fo[data-live] .is-active .fo-d5 { animation-delay: 1300ms; }
.fo[data-live] .is-active .fo-d6 { animation-delay: 1000ms; }
.fo[data-live] .is-active .fo-d7 { animation-delay: 1200ms; }
.fo[data-live] .is-active .fo-d8 { animation-delay: 1400ms; }
.fo[data-live] .is-active .fo-d9 { animation-delay: 1600ms; }

/* One-shot reveals (scenario cards, fold diagram). armed = pose before the
 * entrance, in = the transition to the resting pose; no attribute = resting. */
.fo-reveal[data-reveal='armed'] .fo-card,
.fo-reveal[data-reveal='armed'] .fo-fcard {
  opacity: 0;
  transform: translateY(12px);
}
.fo-reveal[data-reveal='in'] .fo-card,
.fo-reveal[data-reveal='in'] .fo-fcard {
  transition: opacity 500ms cubic-bezier(0.22, 1, 0.36, 1), transform 500ms cubic-bezier(0.22, 1, 0.36, 1);
}
.fo-reveal[data-reveal='in'] .fo-fcard + .fo-fcard {
  transition-delay: 120ms;
}
.fo-reveal[data-reveal='armed'] .fo-fTag {
  opacity: 0;
}
.fo-reveal[data-reveal='armed'] .fo-fChip {
  transform: translateX(calc(-100% - 56px));
}
.fo-reveal[data-reveal='in'] .fo-fTag {
  transition: opacity 400ms cubic-bezier(0.22, 1, 0.36, 1) 300ms;
}
.fo-reveal[data-reveal='in'] .fo-fChip {
  transition: transform 600ms cubic-bezier(0.22, 1, 0.36, 1) 500ms;
}

@media (prefers-reduced-motion: reduce) {
  .fo *,
  .fo-reveal,
  .fo-reveal * {
    animation: none !important;
    transition: none !important;
  }
  .fo-reveal[data-reveal] .fo-card,
  .fo-reveal[data-reveal] .fo-fcard,
  .fo-reveal[data-reveal] .fo-fTag,
  .fo-reveal[data-reveal] .fo-fChip {
    opacity: 1 !important;
    transform: none !important;
  }
  .fo-ctl {
    display: none !important;
  }
}`
