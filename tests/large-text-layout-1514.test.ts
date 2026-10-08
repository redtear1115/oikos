import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { NAV_LABEL_CLASS } from '@/app/(dashboard)/_components/BottomNav'

// #1514 — layout at large system text. Failure looks like: tab labels
// ellipsised or a list row's description squeezed to ~3 characters per line at
// iOS AX sizes / Android font scale 2.0; no error anywhere.
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8')

describe('large-text layout (#1514)', () => {
  it('nav tab is an em container; label shrinks and drops tracking via em conditions', () => {
    const nav = read('app/(dashboard)/_components/BottomNav.tsx')
    expect(nav).toMatch(/className="@container text-nav-label /)
    expect(NAV_LABEL_CLASS).toContain('@max-[4em]:text-[0.65em]')
    expect(NAV_LABEL_CLASS).toContain('@max-[4.5em]:tracking-normal')
  })

  it('CompactRow is a scale-aware em container and stacks the amount below 16em', () => {
    const row = read('app/(dashboard)/dashboard/_components/CompactRow.tsx')
    expect(row).toContain('"@container text-base grid grid-cols-[auto_minmax(0,1fr)_auto]')
    expect(row).toContain('@max-[16em]:col-start-2')
    // Amount block (incl. the ≈ and my-share lines) is a single child, so it moves as one.
    expect(row.match(/@max-\[16em\]:row-start-2/g)).toHaveLength(1)
  })

  it('loading skeletons use min-height like the real nav', () => {
    for (const f of ['dashboard', 'records', 'assets', 'settings']) {
      const src = read(`app/(dashboard)/${f}/loading.tsx`)
      expect(src, f).toContain("minHeight: 'calc(64px + env(safe-area-inset-bottom))'")
      expect(src, f).not.toMatch(/[^n]height: 'calc\(64px/)
    }
  })
})
