import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { zhTW } from '@/lib/i18n/locales/zh-TW'

// Regression coverage for #1015: named invite-funnel events replacing the
// autocapture $el_text reverse-engineering (which breaks on copy changes and
// only ever covered zh-TW). See app/setup/SetupForm.tsx + InviteQr.tsx.

vi.mock('@/lib/analytics/track', () => ({ track: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/actions/group', () => ({ createGroup: vi.fn() }))
vi.mock('@/actions/invite', () => ({ createInvite: vi.fn() }))
vi.mock('@/lib/share', () => ({ shareInviteLink: vi.fn() }))
vi.mock('@/lib/install-guide', () => ({ isStandalone: () => true }))

import SetupForm from '@/app/setup/SetupForm'
import { track as trackMock } from '@/lib/analytics/track'
import { createGroup } from '@/actions/group'
import { createInvite } from '@/actions/invite'
import { shareInviteLink } from '@/lib/share'

/** Drives the form from the name step all the way to the invite step. */
async function renderAtInviteStep() {
  vi.mocked(createGroup).mockResolvedValue({ ok: true, data: { id: 'g1', name: '我們倆' } } as never)
  vi.mocked(createInvite).mockResolvedValue({ ok: true, data: 'https://futari.example/invite/tok123' } as never)

  render(<SetupForm t={zhTW} />)

  fireEvent.change(screen.getByRole('textbox'), { target: { value: '我們倆' } })
  fireEvent.click(screen.getByText('下一步'))
  fireEvent.click(await screen.findByText(zhTW.trust.bilateral.inviter.cta))

  await screen.findByText(zhTW.setup.invite.heading)
}

// clipboard is undefined in jsdom by default; stub per-test.
function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.assign(navigator, { clipboard: { writeText } })
}

describe('SetupForm invite telemetry (#1015)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fires invite_qr_revealed with group_id once the QR successfully renders', async () => {
    await renderAtInviteStep()

    fireEvent.click(screen.getByText(zhTW.setup.invite.qrReveal))

    await waitFor(() => {
      expect(trackMock).toHaveBeenCalledWith('invite_qr_revealed', { group_id: 'g1' })
    })
  })

  it('fires invite_link_copied with via: copy_button and group_id on successful copy', async () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined))
    await renderAtInviteStep()

    fireEvent.click(screen.getByText(zhTW.setup.invite.copy))

    await waitFor(() => {
      expect(trackMock).toHaveBeenCalledWith('invite_link_copied', { via: 'copy_button', group_id: 'g1' })
    })
    expect(await screen.findByText(zhTW.setup.invite.copied)).toBeTruthy()
  })

  it('fires invite_copy_failed (not an unhandled rejection) with group_id when clipboard rejects, and still toasts', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')))
    await renderAtInviteStep()

    fireEvent.click(screen.getByText(zhTW.setup.invite.copy))

    await waitFor(() => {
      expect(trackMock).toHaveBeenCalledWith('invite_copy_failed', { via: 'copy_button', group_id: 'g1' })
    })
    expect(await screen.findByText(zhTW.setup.invite.shareFailed)).toBeTruthy()
  })

  it('fires invite_link_copied with via: share_button and group_id when shareInviteLink resolves "copied"', async () => {
    vi.mocked(shareInviteLink).mockResolvedValue('copied')
    await renderAtInviteStep()

    fireEvent.click(screen.getByText(zhTW.setup.invite.share))

    await waitFor(() => {
      expect(trackMock).toHaveBeenCalledWith('invite_link_copied', { via: 'share_button', group_id: 'g1' })
    })
    expect(trackMock).not.toHaveBeenCalledWith('invite_link_shared', expect.anything())
  })

  it('fires invite_link_shared (no via) with group_id when shareInviteLink resolves "shared"', async () => {
    vi.mocked(shareInviteLink).mockResolvedValue('shared')
    await renderAtInviteStep()

    fireEvent.click(screen.getByText(zhTW.setup.invite.share))

    await waitFor(() => {
      expect(trackMock).toHaveBeenCalledWith('invite_link_shared', { group_id: 'g1' })
    })
  })

  it('fires invite_copy_failed with via: share_button and group_id when shareInviteLink throws', async () => {
    vi.mocked(shareInviteLink).mockRejectedValue(new Error('nope'))
    await renderAtInviteStep()

    fireEvent.click(screen.getByText(zhTW.setup.invite.share))

    await waitFor(() => {
      expect(trackMock).toHaveBeenCalledWith('invite_copy_failed', { via: 'share_button', group_id: 'g1' })
    })
    expect(await screen.findByText(zhTW.setup.invite.shareFailed)).toBeTruthy()
  })

  it("invite_skipped fires with attempted: 'none' and group_id on a direct skip", async () => {
    await renderAtInviteStep()

    fireEvent.click(screen.getByText(zhTW.setup.invite.skip))

    expect(trackMock).toHaveBeenCalledWith('invite_skipped', { attempted: 'none', group_id: 'g1' })
  })

  it("invite_skipped fires with attempted: 'sent' and group_id after a successful copy", async () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined))
    await renderAtInviteStep()

    fireEvent.click(screen.getByText(zhTW.setup.invite.copy))
    await waitFor(() => {
      expect(trackMock).toHaveBeenCalledWith('invite_link_copied', { via: 'copy_button', group_id: 'g1' })
    })

    fireEvent.click(screen.getByText(zhTW.setup.invite.skip))

    expect(trackMock).toHaveBeenCalledWith('invite_skipped', { attempted: 'sent', group_id: 'g1' })
  })

  it("invite_skipped fires with attempted: 'sent' and group_id after only revealing the QR", async () => {
    await renderAtInviteStep()

    fireEvent.click(screen.getByText(zhTW.setup.invite.qrReveal))
    await waitFor(() => {
      expect(trackMock).toHaveBeenCalledWith('invite_qr_revealed', { group_id: 'g1' })
    })

    fireEvent.click(screen.getByText(zhTW.setup.invite.skip))

    expect(trackMock).toHaveBeenCalledWith('invite_skipped', { attempted: 'sent', group_id: 'g1' })
  })

  it("invite_skipped fires with attempted: 'failed' and group_id when a copy attempt failed — distinct from never trying", async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')))
    await renderAtInviteStep()

    fireEvent.click(screen.getByText(zhTW.setup.invite.copy))
    await waitFor(() => {
      expect(trackMock).toHaveBeenCalledWith('invite_copy_failed', { via: 'copy_button', group_id: 'g1' })
    })

    fireEvent.click(screen.getByText(zhTW.setup.invite.skip))

    expect(trackMock).toHaveBeenCalledWith('invite_skipped', { attempted: 'failed', group_id: 'g1' })
  })
})
