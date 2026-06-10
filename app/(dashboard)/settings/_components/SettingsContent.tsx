import Link from 'next/link'
import { getTranslations } from '@/lib/i18n/t'
import { DangerZone, type PendingSwap } from './DangerZone'
import { OfflineBrowsingToggle } from './OfflineBrowsingToggle'
import { QuickAccessRow } from './QuickAccessRow'
import { InstallGuideRow } from './InstallGuideRow'
import { LogoutButton } from './LogoutButton'
import { DeleteAccountButton } from './DeleteAccountButton'

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

export async function SettingsContent({
  viewer, partner, appVersion, currentLocale,
  viewerIsMemberA, groupBalance, pendingSwap, tripSummary,
}: Props) {
  const t = await getTranslations()

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

      <QuickAccessRow
        viewerIsMemberA={viewerIsMemberA}
        viewerDisplayName={viewer.displayName}
        viewerAvatarUrl={viewer.avatarUrl}
        partner={partner ? { displayName: partner.displayName, avatarUrl: partner.avatarUrl } : null}
      />

      {/* 應用 — install + offline (device/app-level prefs) */}
      <Section title={t.settings.sectionApp}>
        <InstallGuideRow />
        <div className="mt-3">
          <OfflineBrowsingToggle />
        </div>
      </Section>

      {/* 資料 — recurring rules → past chapters → trips → import → trust info */}
      <Section title={t.settings.sectionData}>
        <LinkRow href="/settings/recurring" label={t.settings.recurringSettings} />
        <div className="mt-3" />
        <LinkRow href="/settings/past-times" label={t.settings.pastTimes} />
        <div className="mt-3" />
        <LinkRow
          href="/trips"
          label={t.settings.trips}
          secondary={formatTripSummary(tripSummary, t.settings.tripsRow)}
        />
        <div className="mt-3" />
        <LinkRow
          href="/settings/import"
          label={t.settings.import.navLabel}
          secondary={t.settings.import.navSecondary}
        />
        <div className="mt-3" />
        <LinkRow href="/settings/trust" label={t.settings.trust} />
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

      {/* Direct logout entry — sheet-buried before #768, but登出 is a clear
        * intent that deserves a top-level row on the settings page itself.
        * LogoutButton owns its own ConfirmModal + clearDynamicCache flow. */}
      <div className="px-4 mt-4 mb-5">
        <LogoutButton />
        <DeleteAccountButton />
      </div>

      <div
        className="text-xs text-center mt-2 leading-relaxed tracking-[0.3px] pb-8"
        style={{ color: 'var(--ink-3)' }}
      >
        Futari · v{appVersion}
        <br />
        <a href="/terms" className="underline" style={{ color: 'var(--ink-3)' }}>{t.signIn.termsLink}</a>
        {' · '}
        <a href="/privacy" className="underline" style={{ color: 'var(--ink-3)' }}>{t.signIn.privacyLink}</a>
      </div>
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

function LinkRow({
  href, label, secondary,
}: {
  href: string
  label: string
  /** Optional second line under the label, e.g. "1 段進行中 · 過去 3 段". */
  secondary?: string | null
}) {
  return (
    <Link
      href={href}
      className="w-full flex items-center justify-between px-5 py-4 rounded-card text-left bg-transparent cursor-pointer no-underline"
      style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
    >
      <div className="flex flex-col min-w-0">
        <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{label}</div>
        {secondary && (
          <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>{secondary}</div>
        )}
      </div>
      <span className="text-sm shrink-0" style={{ color: 'var(--ink-3)' }} aria-hidden="true">›</span>
    </Link>
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
