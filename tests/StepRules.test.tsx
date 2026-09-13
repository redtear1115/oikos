import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'
import { StepRules } from '@/app/(dashboard)/settings/import/_components/StepRules'

const VIEWER = { id: 'u-a', displayName: '阿明' }
const PARTNER = { id: 'u-b', displayName: '小華' }

function wrap(partner: typeof PARTNER | null) {
  return render(
    <I18nWrapper>
      <StepRules
        viewer={VIEWER}
        partner={partner}
        viewerIsMemberA
        rules={{ payer: 'a', splitType: 'all_mine' }}
        onChange={vi.fn()}
        onBack={vi.fn()}
        onNext={vi.fn()}
      />
    </I18nWrapper>,
  )
}

describe('StepRules — duo', () => {
  it('offers both payers and all three split options', () => {
    wrap(PARTNER)
    expect(screen.getByText('阿明')).toBeTruthy()
    expect(screen.getByText('小華')).toBeTruthy()
    expect(screen.getByText('全部對方的')).toBeTruthy()
  })
})

// #1122 — the payer grid used to keep a disabled button labelled "—" in solo,
// ten lines above a split section that already collapsed to a hint.
describe('StepRules — solo', () => {
  it('collapses the payer grid to a hint instead of a disabled "—" button', () => {
    const { container } = wrap(null)
    expect(screen.queryByText('—')).toBeNull()
    expect(container.querySelectorAll('button:disabled')).toHaveLength(0)
    expect(screen.getByText('單人狀態下，付款人都是你')).toBeTruthy()
  })

  it('collapses the split grid too — neither section offers a partner option', () => {
    wrap(null)
    expect(screen.queryByText('全部對方的')).toBeNull()
    expect(screen.getByText('單人狀態下固定為「全部我的」')).toBeTruthy()
  })

  it('drops the per-row-edit hint that only made sense next to the grid', () => {
    wrap(null)
    expect(screen.queryByText('可在匯入完成後逐筆修改')).toBeNull()
  })
})
