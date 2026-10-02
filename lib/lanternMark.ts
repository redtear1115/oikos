/**
 * Futari lantern (提燈) — shape data only, no React.
 *
 * Single source for every renderer that draws the mark by hand:
 * `components/FutariMark.tsx` (React) and `scripts/build-native-offline-page.ts`
 * (plain-HTML offline page for the native shell, #1423). The offline page used
 * to carry its own hand-written SVG and kept the old desk lamp for two weeks
 * after the 2026-09-16 logo unification. Failure mode: nothing errors, the
 * offline screen just shows a different logo.
 *
 * Attribute names are React-style camelCase; the HTML generator kebab-cases them.
 * `ink` / `accent` are role placeholders that each renderer resolves to a colour.
 */
export type LanternColor = 'ink' | 'accent'

export interface LanternPart {
  tag: 'path' | 'rect'
  /** Presentation attributes except fill/stroke colours. */
  attrs: Record<string, string>
  fill: LanternColor | 'none'
  stroke?: LanternColor
}

export const LANTERN_VIEWBOX = '0 0 32 32'
export const LANTERN_GROUP_TRANSFORM = 'translate(16 16.4)'

export const LANTERN_PARTS: readonly LanternPart[] = [
  { tag: 'path', attrs: { d: 'M -3.5 -8.4 A 3.5 3.5 0 0 1 3.5 -8.4', strokeWidth: '2.2', strokeLinecap: 'round' }, fill: 'none', stroke: 'ink' },
  { tag: 'rect', attrs: { x: '-5.676', y: '-8.5', width: '11.352', height: '2.75', rx: '1.21' }, fill: 'ink' },
  { tag: 'path', attrs: { d: 'M -6.6 -6.4 L 6.6 -6.4 L 5.7 6.4 L -5.7 6.4 Z', strokeWidth: '2.2', strokeLinejoin: 'round' }, fill: 'none', stroke: 'ink' },
  { tag: 'rect', attrs: { x: '-7.128', y: '6.07', width: '14.256', height: '2.97', rx: '1.21' }, fill: 'ink' },
  { tag: 'path', attrs: { d: 'M 0 -4.62 C 1.995 -2.415, 2.625 -0.63, 2.625 0.945 C 2.625 2.94, 1.418 4.2, 0 4.2 C -1.418 4.2, -2.625 2.94, -2.625 0.945 C -2.625 -0.63, -1.995 -2.415, 0 -4.62 Z' }, fill: 'accent' },
]
