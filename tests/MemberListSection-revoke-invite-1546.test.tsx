import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'
import { MemberListSection } from '@/app/(dashboard)/settings/_components/sections/MemberListSection'
import { zhTW } from '@/lib/i18n/locales/zh-TW'

// #1546 — the solo member section offers to make the open invite link
// unusable. The button only appears when a link exists (server prop, or one
// just minted here), and the three outcomes read differently: a revoke that
// lost to an accept must never say "revoked".

const { refreshSpy, createInvite, revokeOpenInvites } = vi.hoisted(() => ({
  refreshSpy: vi.fn(),
  createInvite: vi.fn(),
  revokeOpenInvites: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshSpy, push: vi.fn() }),
}))
vi.mock('@/actions/invite', () => ({ createInvite, revokeOpenInvites }))
vi.mock('@/lib/share', () => ({ shareInviteLink: vi.fn().mockResolvedValue('copied') }))

const r = zhTW.settings.revokeInvite

const viewer = { memberRole: 'a' as const, initial: '我', avatarUrl: null, displayName: '小明', email: 'me@example.com' }
const partner = { memberRole: 'b' as const, initial: '對', avatarUrl: null, displayName: '小華', email: '' }

function wrap(props: { solo?: boolean; hasOpenInvite?: boolean }) {
  return render(
    <I18nWrapper>
      <MemberListSection
        viewer={viewer}
        partner={props.solo === false ? partner : null}
        hasOpenInvite={props.hasOpenInvite}
      />
    </I18nWrapper>,
  )
}

const revokeButton = () => screen.queryByRole('button', { name: r.cta })

async function confirmRevoke() {
  fireEvent.click(screen.getByRole('button', { name: r.cta }))
  const dialog = await screen.findByRole('dialog', { name: r.confirmTitle })
  expect(within(dialog).getByText(r.confirmBody)).toBeTruthy()
  fireEvent.click(within(dialog).getByRole('button', { name: r.confirmLabel }))
}

beforeEach(() => { vi.clearAllMocks() })

describe('MemberListSection — revoke invite button (#1546)', () => {
  it('is hidden in solo when no link is open', () => {
    wrap({ solo: true, hasOpenInvite: false })
    expect(screen.getByRole('button', { name: zhTW.settings.inviteCta })).toBeTruthy()
    expect(revokeButton()).toBeNull()
  })

  it('is hidden in a duo, even if the prop says a link is open', () => {
    wrap({ solo: false, hasOpenInvite: true })
    expect(revokeButton()).toBeNull()
  })

  it('shows when the server says a link is open', () => {
    wrap({ solo: true, hasOpenInvite: true })
    expect(revokeButton()).toBeTruthy()
  })

  it('appears after a link is minted here', async () => {
    createInvite.mockResolvedValue({ ok: true, data: 'https://futari.example/invite/abc' })
    wrap({ solo: true, hasOpenInvite: false })
    fireEvent.click(screen.getByRole('button', { name: zhTW.settings.inviteCta }))
    await waitFor(() => expect(revokeButton()).toBeTruthy())
  })
})

describe('MemberListSection — revoke outcomes (#1546)', () => {
  it('revoked: confirms, then says the link is dead and hides the button', async () => {
    revokeOpenInvites.mockResolvedValue({ ok: true, data: { revoked: 1, partnerJoined: false } })
    wrap({ solo: true, hasOpenInvite: true })
    await confirmRevoke()
    expect(await screen.findByText(r.done)).toBeTruthy()
    expect(revokeOpenInvites).toHaveBeenCalledWith()
    expect(revokeButton()).toBeNull()
    expect(refreshSpy).not.toHaveBeenCalled()
  })

  it('partner joined first: says so (not "revoked") and refreshes', async () => {
    revokeOpenInvites.mockResolvedValue({ ok: true, data: { revoked: 0, partnerJoined: true } })
    wrap({ solo: true, hasOpenInvite: true })
    await confirmRevoke()
    expect(await screen.findByText(r.partnerJoined)).toBeTruthy()
    expect(screen.queryByText(r.done)).toBeNull()
    expect(refreshSpy).toHaveBeenCalledTimes(1)
  })

  it('nothing was open: says there is no live link', async () => {
    revokeOpenInvites.mockResolvedValue({ ok: true, data: { revoked: 0, partnerJoined: false } })
    wrap({ solo: true, hasOpenInvite: true })
    await confirmRevoke()
    expect(await screen.findByText(r.noneOpen)).toBeTruthy()
    expect(screen.queryByText(r.done)).toBeNull()
  })

  it('an error closes the dialog and shows on the section error line', async () => {
    revokeOpenInvites.mockResolvedValue({ ok: false, code: 'inviter_not_member' })
    wrap({ solo: true, hasOpenInvite: true })
    await confirmRevoke()
    expect(await screen.findByText(zhTW.errors.actions.inviter_not_member)).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: r.confirmTitle })).toBeNull())
    expect(screen.queryByText(r.done)).toBeNull()
  })

  it('cancel does not call the action', async () => {
    wrap({ solo: true, hasOpenInvite: true })
    fireEvent.click(screen.getByRole('button', { name: r.cta }))
    const dialog = await screen.findByRole('dialog', { name: r.confirmTitle })
    fireEvent.click(within(dialog).getByRole('button', { name: zhTW.common.cancel }))
    expect(revokeOpenInvites).not.toHaveBeenCalled()
  })
})
