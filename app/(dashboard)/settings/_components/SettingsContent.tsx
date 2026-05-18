'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { InstallGuide } from '@/app/(dashboard)/_components/InstallGuide'
import { DangerZone, type PendingSwap } from './DangerZone'
import { OfflineBrowsingToggle } from './OfflineBrowsingToggle'
import { useAvatarMenu } from '@/app/(dashboard)/_components/AvatarMenuProvider'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { useTranslations } from '@/lib/i18n/client'

export interface ViewerInfo {
  id: string
  displayName: string
  email: string
  avatarUrl: string | null
}
export interface PartnerInfo { id: string; displayName: string; email: string | null; avatarUrl: string | null }

interface Props {
  viewer: ViewerInfo
  partner: PartnerInfo | null
  appVersion: string
  currentLocale: string
  /** True iff viewer is member_a on the group. Drives the leave flow's branching. */
  viewerIsMemberA: boolean
  /** Signed balance from member_a's POV (positive = A owes B). */
  groupBalance: number
  /** A pending swap proposal on this group, or null if none. */
  pendingSwap: PendingSwap | null
  /** #367 — trip counts in current epoch for the 旅行 row secondary text. */
  tripSummary: { active: number; past: number }
}

export function SettingsContent({
  viewer, partner, appVersion, currentLocale,
  viewerIsMemberA, groupBalance, pendingSwap, tripSummary,
}: Props) {
  const router = useRouter()
  const t = useTranslations()
  const { open: openAvatarMenu } = useAvatarMenu()

  const [installGuideOpen, setInstallGuideOpen] = useState(false)

  return (
    <>
      <div className="px-5 pt-[max(env(safe-area-inset-top),24px)] pb-4">
        <div
          className="text-2xl font-medium tracking-tight"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
        >
          {t.settings.title}
        </div>
        <div className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>
          {t.settings.subtitle}
        </div>
      </div>

      {/* Entry row to the avatar quick-settings sheet — Settings page has no
          avatar to tap, so this row is its inline equivalent. */}
      <div className="px-4 mt-2 mb-5">
        <button
          type="button"
          onClick={openAvatarMenu}
          className="w-full flex items-center justify-between px-5 py-4 rounded-[20px] text-left bg-transparent cursor-pointer"
          style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
        >
          <div className="flex items-center gap-3">
            {/* mini avatar pair as visual hint — matches the dashboard avatar cluster */}
            <div className="flex">
              <Avatar memberRole={viewerIsMemberA ? 'a' : 'b'} initial={viewer.displayName[0]?.toUpperCase() ?? '?'} src={viewer.avatarUrl} size={22} />
              {partner && (
                <div className="-ml-[6px]">
                  <Avatar memberRole={viewerIsMemberA ? 'b' : 'a'} initial={partner.displayName[0]?.toUpperCase() ?? '?'} src={partner.avatarUrl} size={22} ring />
                </div>
              )}
            </div>
            <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
              {t.settings.quickAccessRow}
            </div>
          </div>
          <span className="text-sm shrink-0" style={{ color: 'var(--ink-3)' }}>›</span>
        </button>
      </div>

      {/* 應用 — install + offline (device/app-level prefs) */}
      <Section title={t.settings.sectionApp}>
        <Row
          label={t.settings.addToHomeScreen}
          onClick={() => setInstallGuideOpen(true)}
        />
        <div className="mt-3">
          <OfflineBrowsingToggle />
        </div>
      </Section>

      {/* 資料 — recurring rules → past chapters → trips → export → trust info */}
      <Section title={t.settings.sectionData}>
        <Row
          label={t.settings.recurringSettings}
          onClick={() => router.push('/settings/recurring')}
        />
        <div className="mt-3" />
        <Row
          label={t.settings.pastTimes}
          onClick={() => router.push('/settings/past-times')}
        />
        <div className="mt-3" />
        <Row
          label={t.settings.trips}
          secondary={formatTripSummary(tripSummary, t.settings.tripsRow)}
          onClick={() => router.push('/trips')}
        />
        <div className="mt-3" />
        <Row
          label={t.settings.trust}
          onClick={() => router.push('/settings/trust')}
        />
        <div className="mt-3" />
        <Row
          label={t.settings.importData}
          onClick={() => router.push('/settings/import')}
        />
      </Section>

      {partner && (
        <DangerZone
          viewerIsMemberA={viewerIsMemberA}
          viewerName={viewer.displayName}
          partnerName={partner.displayName}
          groupBalance={groupBalance}
          pendingSwap={pendingSwap}
          locale={currentLocale}
        />
      )}

      <div
        className="text-micro text-center mt-2 leading-relaxed tracking-[0.3px] pb-8"
        style={{ color: 'var(--ink-3)' }}
      >
        Futari · v{appVersion}
        <br />
        <a href="/terms" className="underline" style={{ color: 'var(--ink-3)' }}>{t.signIn.termsLink}</a>
        {' · '}
        <a href="/privacy" className="underline" style={{ color: 'var(--ink-3)' }}>{t.signIn.privacyLink}</a>
      </div>

      <InstallGuide
        open={installGuideOpen}
        onClose={() => setInstallGuideOpen(false)}
        t={t}
      />

    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 mt-2 mb-5">
      <div className="text-xs font-medium px-1 mb-2" style={{ color: 'var(--ink-3)' }}>{title}</div>
      {children}
    </div>
  )
}

function Row({
  label, value, secondary, onClick, disabled,
}: {
  label: string
  value?: string
  /** Optional second line under the label, e.g. "1 段進行中 · 過去 3 段". */
  secondary?: string | null
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-between px-5 py-4 rounded-[20px] text-left bg-transparent cursor-pointer disabled:cursor-default disabled:opacity-60"
      style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
    >
      <div className="flex flex-col min-w-0">
        <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{label}</div>
        {secondary && (
          <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>{secondary}</div>
        )}
      </div>
      <div className="text-sm flex items-center gap-2 shrink-0" style={{ color: 'var(--ink-3)' }}>
        {value && <span style={{ color: 'var(--ink-2)' }}>「{value}」</span>}
        <span>›</span>
      </div>
    </button>
  )
}

function formatTripSummary(
  summary: { active: number; past: number },
  tr: { active: string; past: string; both: string },
): string | null {
  if (summary.active === 0 && summary.past === 0) return null
  if (summary.active > 0 && summary.past > 0) {
    return tr.both
      .replace('{active}', String(summary.active))
      .replace('{past}', String(summary.past))
  }
  if (summary.active > 0) return tr.active.replace('{active}', String(summary.active))
  return tr.past.replace('{past}', String(summary.past))
}
