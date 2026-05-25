import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'
import { EditTextSheet } from '@/app/(dashboard)/_components/EditTextSheet'

describe('EditTextSheet — a11y', () => {
  it('exposes a labelled modal dialog', () => {
    render(
      <I18nWrapper>
        <EditTextSheet
          open
          title="帳本名稱"
          initialValue="我們家"
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />
      </I18nWrapper>,
    )
    const dialog = screen.getByRole('dialog', { name: '帳本名稱' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })
})
