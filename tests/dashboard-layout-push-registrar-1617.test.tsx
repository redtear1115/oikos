/**
 * #1617 — the dashboard layout hands PushTokenRegistrar the ACTIVE ledger
 * without a redundant query.
 *
 * Not pinned to a past chapter, `resolveViewerEpochContext` already returned
 * the active group (it falls through to `getActiveGroupForUser`), so the
 * layout reuses it. Pinned to a past chapter, the layout looks the active
 * ledger up — never registering against the pinned chapter's group (#1605 F3).
 *
 * Failure looks like: either one extra `getActiveGroupForUser` query on every
 * dashboard render (silent, just slower), or — if the past-pin branch is lost —
 * this device's token bound to an old ledger, and pushes for the live ledger
 * never arrive. No error either way.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'

const h = vi.hoisted(() => ({
  context: null as unknown,
  getActiveGroupForUser: vi.fn(),
}))

const Pass = ({ children }: { children?: ReactNode }) => children ?? null

vi.mock('next/navigation', () => ({
  redirect: (to: string) => { throw new Error(`redirect ${to}`) },
  notFound: () => { throw new Error('notFound') },
}))
vi.mock('@/lib/supabase/server', () => ({
  getCurrentUser: async () => ({ id: 'viewer', email: 'v@example.test' }),
}))
vi.mock('@/lib/db/client', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => [{
          id: 'viewer', displayName: 'Viewer', deletionRequestedAt: null,
          defaultSplitType: 'equal', avatarHidden: false, avatarUrl: null,
        }],
      }),
    }),
  },
}))
vi.mock('@/lib/db/queries/epoch', () => ({
  resolveViewerEpochContext: async () => h.context,
  getEpochMembers: async () => null,
}))
vi.mock('@/lib/db/queries/group', () => ({ getActiveGroupForUser: h.getActiveGroupForUser }))
vi.mock('@/lib/db/queries/invite', () => ({ hasOpenInvite: async () => false }))
vi.mock('@/lib/i18n/t', () => ({
  getTranslations: async () => ({ common: { partner: 'Partner' } }),
  getLocale: async () => 'zh-TW',
}))
vi.mock('@/lib/i18n/client', () => ({ TranslationsProvider: Pass }))
vi.mock('@/lib/today-server', () => ({ getTodayYMD: async () => '2026-10-08' }))
vi.mock('@/lib/chapterIdentity', () => ({ buildChapterIdentity: () => null }))
vi.mock('@/lib/guardian', () => ({ canAccessGuardian: () => false }))
vi.mock('@/lib/avatar', () => ({ maskAvatarUrl: () => null }))
vi.mock('@/components/Toast', () => ({ ToastProvider: Pass }))
vi.mock('@/components/TextScale', () => ({ TextScale: () => null }))
vi.mock('@/app/(dashboard)/_components/ViewerProvider', () => ({ ViewerProvider: Pass }))
vi.mock('@/app/(dashboard)/_components/RealtimeProvider', () => ({ RealtimeProvider: Pass }))
vi.mock('@/app/(dashboard)/_components/OfflineLifecycle', () => ({ OfflineLifecycle: () => null }))
vi.mock('@/app/(dashboard)/_components/ReconnectRefresh', () => ({ ReconnectRefresh: () => null }))
vi.mock('@/app/(dashboard)/_components/PartnerActivityToast', () => ({ PartnerActivityToast: () => null }))
vi.mock('@/app/(dashboard)/_components/AvatarMenuProvider', () => ({ AvatarMenuProvider: Pass }))
vi.mock('@/app/(dashboard)/_components/PushTokenRegistrar', () => ({
  PushTokenRegistrar: function PushTokenRegistrar() { return null },
}))
vi.mock('@/app/(dashboard)/_components/AccountDeletionBanner', () => ({ AccountDeletionBanner: () => null }))
vi.mock('@/app/(dashboard)/_components/ShellUpdateNotice', () => ({ ShellUpdateNotice: () => null }))
vi.mock('@/app/(dashboard)/_components/ShellTopStack', () => ({ ShellTopStack: Pass }))
vi.mock('@/app/(dashboard)/_components/TodayProvider', () => ({ TodayProvider: Pass }))
vi.mock('@/app/(dashboard)/_components/PastChapterBar', () => ({ PastChapterBar: () => null }))
vi.mock('@/app/(dashboard)/_components/QuickAddProvider', () => ({ QuickAddProvider: Pass }))

const { default: DashboardLayout } = await import('@/app/(dashboard)/layout')
const { PushTokenRegistrar } = await import('@/app/(dashboard)/_components/PushTokenRegistrar')

function groupRow(id: string) {
  return {
    id, name: id, baseCurrency: 'twd', memberA: 'viewer', memberB: null,
    defaultSplitRatioA: null, guardianBetaEnabled: false,
  }
}

function findRegistrars(node: ReactNode): ReactElement<{ userId: string; groupId: string }>[] {
  if (Array.isArray(node)) return node.flatMap(findRegistrars)
  if (!isValidElement(node)) return []
  const el = node as ReactElement<{ children?: ReactNode; userId: string; groupId: string }>
  const here = el.type === PushTokenRegistrar ? [el] : []
  return [...here, ...findRegistrars(el.props.children)]
}

beforeEach(() => {
  h.getActiveGroupForUser.mockReset()
})

describe('dashboard layout → PushTokenRegistrar (#1617)', () => {
  it('not pinned: registers against the resolved group with no extra getActiveGroupForUser call', async () => {
    h.context = {
      group: groupRow('active-group'),
      window: { startedAt: new Date(0), endedAt: null, epochId: 'ep-now', isPast: false },
    }
    const tree = await DashboardLayout({ children: null })
    const regs = findRegistrars(tree)
    expect(regs).toHaveLength(1)
    expect(regs[0].props).toMatchObject({ userId: 'viewer', groupId: 'active-group' })
    expect(h.getActiveGroupForUser).not.toHaveBeenCalled()
  })

  it('pinned to a past chapter: registers against the ACTIVE ledger, never the pinned one (F3)', async () => {
    h.context = {
      group: groupRow('pinned-old-group'),
      window: { startedAt: new Date(0), endedAt: new Date(1), epochId: 'ep-old', isPast: true },
    }
    h.getActiveGroupForUser.mockResolvedValue(groupRow('active-group'))
    const tree = await DashboardLayout({ children: null })
    const regs = findRegistrars(tree)
    expect(regs).toHaveLength(1)
    expect(regs[0].props.groupId).toBe('active-group')
    expect(h.getActiveGroupForUser).toHaveBeenCalledExactlyOnceWith('viewer')
  })

  it('pinned to a past chapter with no active ledger: no registrar at all', async () => {
    h.context = {
      group: groupRow('pinned-old-group'),
      window: { startedAt: new Date(0), endedAt: new Date(1), epochId: 'ep-old', isPast: true },
    }
    h.getActiveGroupForUser.mockResolvedValue(null)
    expect(findRegistrars(await DashboardLayout({ children: null }))).toHaveLength(0)
  })
})
