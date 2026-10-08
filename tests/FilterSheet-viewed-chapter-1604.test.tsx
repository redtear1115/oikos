import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'
import { MemberProvider, type MemberContextValue, type ChapterIdentity } from '@/app/(dashboard)/_components/MemberContext'
import { FilterSheet } from '@/app/(dashboard)/records/_components/FilterSheet'
import { defaultFilter } from '@/lib/filter'

// #1604 (S3 verifier advisory A1) — the 誰付的 / 分攤 sections follow the
// chapter being viewed, not today's group row.
//
// A stayer who is solo today, pinned to the duo chapter they had with an ex,
// must still be able to filter 「對方」: resolveViewedPair maps it to that
// chapter's partner, and the ex's rows are right there. Gating on today's
// isSolo hid the whole section, with no error. And the reverse: a solo chapter
// has no 「對方」 even if the viewer is paired today.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/records',
}))

const EX: ChapterIdentity = {
  partner: { id: 'u-ex', displayName: '阿前', initial: '阿', avatarUrl: null },
  isSolo: false,
}
const SOLO_CHAPTER: ChapterIdentity = { partner: null, isSolo: true }

function ctx(opts: { liveSolo: boolean; chapter?: ChapterIdentity | null }): MemberContextValue {
  const isPast = opts.chapter !== undefined
  return {
    group: { id: 'g1', name: '我們家', baseCurrency: 'twd' },
    viewer: { id: 'u-me', initial: '我', displayName: '小明', avatarUrl: null, defaultSplitType: 'half', who: 'M' },
    partner: opts.liveSolo ? null : {
      id: 'u-now', initial: '新', displayName: '新伴', avatarUrl: null, defaultSplitType: 'half', who: 'T',
    },
    viewerIsA: true,
    isSolo: opts.liveSolo,
    isPast,
    chapter: isPast ? opts.chapter : null,
    canAccessGuardian: false,
    epochStartedAt: '2025-01-01T00:00:00.000Z',
    epochEndedAt: isPast ? '2025-06-01T00:00:00.000Z' : null,
  }
}

function renderSheet(value: MemberContextValue) {
  return render(
    <I18nWrapper>
      <MemberProvider value={value}>
        <FilterSheet open currentFilter={defaultFilter()} onClose={() => {}} onApply={() => {}} />
      </MemberProvider>
    </I18nWrapper>,
  )
}

const payerSection = () => screen.queryByText('誰付的')
const splitSection = () => screen.queryByText('分攤')

describe('FilterSheet payer / split sections follow the viewed chapter (#1604)', () => {
  it('solo today, pinned to a duo chapter: 誰付的 (with 對方) and 分攤 are offered', () => {
    renderSheet(ctx({ liveSolo: true, chapter: EX }))
    expect(payerSection()).toBeTruthy()
    expect(splitSection()).toBeTruthy()
    expect(screen.getByRole('button', { name: '對方' })).toBeTruthy()
  })

  it('paired today, pinned to a solo chapter: no 誰付的 / 分攤', () => {
    renderSheet(ctx({ liveSolo: false, chapter: SOLO_CHAPTER }))
    expect(payerSection()).toBeNull()
    expect(splitSection()).toBeNull()
  })

  it('pinned with no readable chapter identity: fails closed (no 對方)', () => {
    renderSheet(ctx({ liveSolo: false, chapter: null }))
    expect(payerSection()).toBeNull()
  })

  it('unpinned: today\'s solo / duo decides, as before', () => {
    const { unmount } = renderSheet(ctx({ liveSolo: false }))
    expect(payerSection()).toBeTruthy()
    unmount()
    renderSheet(ctx({ liveSolo: true }))
    expect(payerSection()).toBeNull()
  })
})
