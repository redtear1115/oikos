import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CompactRow } from '@/app/(dashboard)/dashboard/_components/CompactRow'
import {
  MemberProvider,
  type MemberContextValue,
} from '@/app/(dashboard)/_components/MemberContext'
import { FOLD_SETTLEMENT_NOTE_TEMPLATES, isOutingFoldNote } from '@/lib/outing/foldNote'
import { zhTW } from '@/lib/i18n/locales/zh-TW'
import { zhCN } from '@/lib/i18n/locales/zh-CN'
import { en } from '@/lib/i18n/locales/en'
import { ja } from '@/lib/i18n/locales/ja'
import { I18nWrapper } from './_mocks/i18n'

/**
 * #1396 item 1 — an ended outing's fold-back Settlement reads 「出遊結算」 in
 * the feed, not the generic 「我還款」. The note is the only signal, and it's
 * written in the locale of whoever ended the outing, so every locale's
 * template has to be recognised regardless of the viewer's locale.
 */

describe('isOutingFoldNote', () => {
  it('lists exactly the four locale templates endOuting writes', () => {
    expect([...FOLD_SETTLEMENT_NOTE_TEMPLATES].sort()).toEqual(
      [zhTW, zhCN, en, ja].map((l) => l.outing.foldSettlementNote).sort(),
    )
  })

  it('matches a note from any locale, whatever the name', () => {
    for (const l of [zhTW, zhCN, en, ja]) {
      expect(isOutingFoldNote(l.outing.foldSettlementNote.replace('{name}', '沖繩 5 天'))).toBe(true)
    }
  })

  it('does not match ordinary settlement notes or an empty name', () => {
    expect(isOutingFoldNote(null)).toBe(false)
    expect(isOutingFoldNote('還款')).toBe(false)
    expect(isOutingFoldNote('房租')).toBe(false)
    expect(isOutingFoldNote('出遊『』結算')).toBe(false)
    expect(isOutingFoldNote('出遊『沖繩』結算 補差額')).toBe(false)
  })
})

const member: MemberContextValue = {
  group: { id: 'g1', name: 'G' },
  viewer: { id: 'viewer-1', initial: 'V', displayName: 'Viewer', avatarUrl: null, defaultSplitType: 'half', who: 'M' },
  partner: { id: 'partner-1', initial: 'P', displayName: 'Partner', avatarUrl: null, defaultSplitType: 'half', who: 'T' },
  viewerIsA: true,
  isSolo: false,
  isPast: false,
  canAccessGuardian: false,
  epochStartedAt: '2026-01-01',
  epochEndedAt: null,
}

function renderSettlement(description: string, paidBy: string) {
  return render(
    <I18nWrapper>
      <MemberProvider value={member}>
        <CompactRow
          tx={{
            id: 's-1',
            amount: 1500,
            splitType: null,
            splitRatioA: null,
            description,
            category: 'settle',
            paidBy,
            transactedAt: '2026-05-01',
            kind: 'settlement',
          }}
          isLast
          onClick={() => {}}
        />
      </MemberProvider>
    </I18nWrapper>,
  )
}

describe('CompactRow settlement subtitle', () => {
  it('labels a fold-back 「出遊結算」 with no direction, whoever paid', () => {
    const { unmount } = renderSettlement('出遊『沖繩』結算', 'viewer-1')
    expect(screen.getByText(/出遊結算/)).toBeTruthy()
    expect(screen.queryByText(/我還款/)).toBeNull()
    unmount()

    renderSettlement('Outing "Okinawa" settled', 'partner-1')
    expect(screen.getByText(/出遊結算/)).toBeTruthy()
    expect(screen.queryByText(/還款/)).toBeNull()
  })

  it('keeps 「我還款」 for an ordinary settlement', () => {
    renderSettlement('還款', 'viewer-1')
    expect(screen.getByText(/我還款/)).toBeTruthy()
  })
})
