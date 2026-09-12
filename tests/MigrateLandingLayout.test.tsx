import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'

vi.mock('@/lib/analytics/track', () => ({ track: vi.fn() }))
import { track } from '@/lib/analytics/track'
import { zhTW } from '@/lib/i18n/locales/zh-TW'
import { MigratePrimaryCta } from '@/app/[locale]/migrate/_components/MigratePrimaryCta'
import { MigrateChatgptWorkflow } from '@/app/[locale]/migrate/_components/MigrateChatgptWorkflow'

// #1011: /migrate/<source> is a search landing page, not a migration tool.
// These two guard the shape that follows from that: an ungated sign-up ask
// that reports the KPI event, and a screenshot walkthrough that no longer
// stands in front of it.
describe('MigratePrimaryCta', () => {
  beforeEach(() => vi.clearAllMocks())

  const copy = zhTW.migrate.primaryCta

  function renderCta() {
    return render(
      <MigratePrimaryCta
        title={copy.title}
        body={copy.body}
        button={copy.button}
        signInHref="/zh-TW/sign-in"
        source="simple-daily-money"
      />,
    )
  }

  it('tags sign-in with the source slug, matching MigrateCta', () => {
    renderCta()
    expect(screen.getByText(copy.button).closest('a')!.getAttribute('href')).toBe(
      '/zh-TW/sign-in?from=simple-daily-money',
    )
  })

  it('fires landing_cta_clicked — the page had no ungated emitter before', () => {
    renderCta()
    fireEvent.click(screen.getByText(copy.button))
    expect(track).toHaveBeenCalledWith('landing_cta_clicked', {
      cta_location: 'migrate_primary',
      target: 'sign_in',
    })
  })
})

describe('MigrateChatgptWorkflow', () => {
  beforeEach(() => vi.clearAllMocks())

  function renderWorkflow() {
    const { container } = render(
      <MigrateChatgptWorkflow copy={zhTW.migrate.chatgptWorkflow} source="simple-daily-money" />,
    )
    return container.querySelector('details')!
  }

  it('starts collapsed so the 600px walkthrough does not lead the page', () => {
    expect(renderWorkflow().open).toBe(false)
  })

  it('still ships the full walkthrough in the markup — collapsed, not hidden', () => {
    renderWorkflow()
    for (const step of zhTW.migrate.chatgptWorkflow.substeps) {
      expect(screen.getByText(step)).toBeTruthy()
    }
    expect(screen.getByText(zhTW.migrate.chatgptWorkflow.settingsHint)).toBeTruthy()
  })
})
