'use client'

import { useRouter } from 'next/navigation'
import { useMember } from './MemberContext'
import { Avatar } from './Avatar'
import { SheetFrame } from './SheetFrame'
import type { AvatarMenuData } from './AvatarMenuProvider'
import { useTranslations } from '@/lib/i18n/client'
import { EditableNameRow } from '@/app/(dashboard)/settings/_components/sections/EditableNameRow'
import { MemberListSection } from '@/app/(dashboard)/settings/_components/sections/MemberListSection'
import { SplitTypeSection } from '@/app/(dashboard)/settings/_components/sections/SplitTypeSection'
import { SplitRatioSection } from '@/app/(dashboard)/settings/_components/sections/SplitRatioSection'
import { LanguageSwitcher } from '@/lib/i18n/LanguageSwitcher'
import { GuardianBetaToggle } from '@/app/(dashboard)/settings/_components/GuardianBetaToggle'
import { LogoutButton } from '@/app/(dashboard)/settings/_components/LogoutButton'
import { updateGroupName } from '@/actions/group'
import { updateDisplayName } from '@/actions/profile'
import { runAfterSheetCloseBack } from '@/lib/sheetNavigation'

interface Props {
  open: boolean
  onClose: () => void
  data: AvatarMenuData
}

export function AvatarMenuSheet({ open, onClose, data }: Props) {
  const router = useRouter()
  const t = useTranslations()
  const { group, viewer, partner, viewerIsA, isSolo } = useMember()
  const viewerRole = viewerIsA ? 'a' : 'b'
  const partnerRole = viewerIsA ? 'b' : 'a'

  return (
    <SheetFrame open={open} onClose={onClose} ariaLabel={t.settings.title}>
      {/* Header: group name + avatar mini-cluster */}
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 shrink-0">
          <div className="text-body font-medium truncate" style={{ color: 'var(--ink)' }}>
            {group.name}
          </div>
          <div className="flex shrink-0">
            <Avatar memberRole={viewerRole} initial={viewer.initial} src={viewer.avatarUrl} size={22} />
            {partner && (
              <div className="-ml-[6px]">
                <Avatar memberRole={partnerRole} initial={partner.initial} src={partner.avatarUrl} size={22} ring />
              </div>
            )}
          </div>
        </div>

        {/* Scrollable body — content sections */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
          {/* 成員 */}
          <Section title={t.settings.sectionMember}>
            <MemberListSection
              viewer={{
                memberRole: viewerRole,
                initial: viewer.initial,
                avatarUrl: viewer.avatarUrl,
                displayName: viewer.displayName,
                email: data.viewerEmail,
              }}
              partner={partner ? {
                memberRole: partnerRole,
                initial: partner.initial,
                avatarUrl: partner.avatarUrl,
                displayName: partner.displayName,
                email: '',
              } : null}
              groupId={group.id}
            />
          </Section>

          {/* 個人 */}
          <Section title={t.settings.sectionPersonal}>
            <EditableNameRow
              label={t.settings.displayName}
              value={viewer.displayName}
              onSave={updateDisplayName}
            />
            <div className="mt-3">
              <SplitTypeSection current={viewer.defaultSplitType} isSolo={isSolo} />
            </div>
            <div className="mt-3">
              <LanguageSwitcher current={data.currentLocale} />
            </div>
          </Section>

          {/* 帳本 */}
          <Section title={t.settings.sectionGroup}>
            <EditableNameRow
              label={t.settings.groupName}
              value={group.name}
              onSave={updateGroupName}
            />
            {!isSolo && partner && (
              <div className="mt-3">
                <SplitRatioSection
                  viewerName={viewer.displayName}
                  partnerName={partner.displayName}
                  initialRatioA={data.groupDefaultRatioA}
                />
              </div>
            )}
            <div className="mt-3">
              <Row
                label={t.settings.currency}
                // Defer the navigation until after the sheet-close synthetic
                // history.back() has unwound — pushing in the same tick as
                // onClose lets that back() revert it (the #745/#752 race).
                onClick={() => {
                  runAfterSheetCloseBack(() => router.push('/settings/currency'))
                  onClose()
                }}
              />
            </div>
            <div className="mt-3">
              <GuardianBetaToggle enabled={data.guardianBetaEnabled} />
            </div>
          </Section>

          {/* Logout */}
          <div className="px-1 pb-4 mt-4">
            <LogoutButton />
          </div>
        </div>
    </SheetFrame>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-2 mb-5">
      <div className="text-xs font-medium px-1 mb-2" style={{ color: 'var(--ink-3)' }}>{title}</div>
      {children}
    </div>
  )
}

function Row({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between px-5 py-4 rounded-card text-left cursor-pointer"
      style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
    >
      <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{label}</div>
      <span className="text-sm shrink-0" style={{ color: 'var(--ink-3)' }} aria-hidden="true">›</span>
    </button>
  )
}
