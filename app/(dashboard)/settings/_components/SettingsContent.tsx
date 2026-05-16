'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { InstallGuide } from '@/app/(dashboard)/_components/InstallGuide'
import { EditableNameRow } from './sections/EditableNameRow'
import { MemberListSection } from './sections/MemberListSection'
import { SplitTypeSection } from './sections/SplitTypeSection'
import { DangerZone, type PendingSwap } from './DangerZone'
import { LogoutButton } from './LogoutButton'
import { OfflineBrowsingToggle } from './OfflineBrowsingToggle'
import { GuardianBetaToggle } from './GuardianBetaToggle'
import { updateGroupName, updateGroupSplitRatio } from '@/actions/group'
import { updateDisplayName } from '@/actions/profile'
import type { SplitType } from '@/lib/balance'
import { useTranslations } from '@/lib/i18n/client'
import { LanguageSwitcher } from '@/lib/i18n/LanguageSwitcher'
import { describeError } from '@/lib/errors'

export interface ViewerInfo {
  id: string
  displayName: string
  email: string
  avatarUrl: string | null
  defaultSplitType: SplitType
}
export interface PartnerInfo { id: string; displayName: string; email: string | null; avatarUrl: string | null }

interface Props {
  viewer: ViewerInfo
  partner: PartnerInfo | null
  groupId: string
  groupName: string
  appVersion: string
  currentLocale: string
  groupDefaultRatioA: number | null
  /** True iff viewer is member_a on the group. Drives the leave flow's branching. */
  viewerIsMemberA: boolean
  /** Signed balance from member_a's POV (positive = A owes B). */
  groupBalance: number
  /** A pending swap proposal on this group, or null if none. */
  pendingSwap: PendingSwap | null
  /** #220 — Guardian beta opt-in state for this group. */
  guardianBetaEnabled: boolean
  /** #367 — trip counts in current epoch for the 旅行 row secondary text. */
  tripSummary: { active: number; past: number }
}

export function SettingsContent({
  viewer, partner, groupId, groupName, appVersion, currentLocale, groupDefaultRatioA,
  viewerIsMemberA, groupBalance, pendingSwap, guardianBetaEnabled, tripSummary,
}: Props) {
  const router = useRouter()
  const t = useTranslations()
  const isSolo = partner === null

  const refresh = () => router.refresh()

  const [splitRatioA, setSplitRatioA] = useState<number>(groupDefaultRatioA ?? 50)
  const [savingRatio, startRatioTransition] = useTransition()
  const [ratioError, setRatioError] = useState<string | null>(null)

  const [installGuideOpen, setInstallGuideOpen] = useState(false)

  const handleRatioSave = () => {
    setRatioError(null)
    startRatioTransition(async () => {
      try {
        await updateGroupSplitRatio(splitRatioA)
        refresh()
      } catch (e) {
        setRatioError(describeError(e, t.incomeSheet.errors.saveFailed, t.common.offlineError))
      }
    })
  }

  return (
    <>
      <div className="px-5 pt-[max(env(safe-area-inset-top),24px)] pb-4">
        <div
          className="text-2xl font-medium tracking-tight"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
        >
          {t.settings.title}
        </div>
      </div>

      {/* 帳本 — group-level identity (just the name). */}
      <Section title={t.settings.sectionGroup}>
        <EditableNameRow
          label={t.settings.groupName}
          value={groupName}
          onSave={updateGroupName}
        />
      </Section>

      {/* 預設分攤方式 & 比例 — default split type + (paired) ratio slider. */}
      <Section title={t.settings.sectionGroupSplit}>
        <SplitTypeSection current={viewer.defaultSplitType} isSolo={isSolo} />
        {!isSolo && (
          <div className="mt-3">
            <section className="flex flex-col gap-3 px-4 py-5 rounded-[20px]" style={{ background: 'var(--surface)' }}>
              <div className="flex justify-between text-sm" style={{ color: 'var(--ink-3)' }}>
                <span>{viewer.displayName}（我）{splitRatioA}%</span>
                <span>{partner?.displayName}（對方）{100 - splitRatioA}%</span>
              </div>
              <input
                type="range"
                min={10}
                max={90}
                step={10}
                list="split-ratio-ticks"
                value={splitRatioA}
                onChange={e => setSplitRatioA(Number(e.target.value))}
                className="w-full accent-[var(--ink)]"
              />
              <datalist id="split-ratio-ticks">
                {[10, 20, 30, 40, 50, 60, 70, 80, 90].map(v => (
                  <option key={v} value={v} label={`${v}`} />
                ))}
              </datalist>
              <button
                onClick={handleRatioSave}
                disabled={savingRatio}
                className="mt-1 px-4 py-2 rounded-xl text-sm font-medium"
                style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
              >
                {savingRatio ? t.common.saving : t.settings.saveDefaultRatio}
              </button>
              {ratioError && <p className="text-xs" style={{ color: 'var(--debit)' }}>{ratioError}</p>}
            </section>
          </div>
        )}
      </Section>

      {/* 成員 */}
      <Section title={t.settings.sectionMember}>
        <MemberListSection
          viewer={{
            memberRole: viewerIsMemberA ? 'a' : 'b',
            initial: viewer.displayName[0]?.toUpperCase() ?? '?',
            avatarUrl: viewer.avatarUrl,
            displayName: viewer.displayName,
            email: viewer.email,
          }}
          partner={partner ? {
            memberRole: viewerIsMemberA ? 'b' : 'a',
            initial: partner.displayName[0]?.toUpperCase() ?? '?',
            avatarUrl: partner.avatarUrl,
            displayName: partner.displayName,
            email: partner.email ?? '',
          } : null}
          groupId={groupId}
        />
      </Section>

      {/* 個人 — viewer-only profile + preferences */}
      <Section title={t.settings.sectionPersonal}>
        <EditableNameRow
          label={t.settings.displayName}
          value={viewer.displayName}
          onSave={updateDisplayName}
        />
      </Section>

      {/* 語言 & 幣別 — "who I am / which viewpoint" identity prefs (issue #365) */}
      <Section title={t.settings.sectionDisplay}>
        <LanguageSwitcher current={currentLocale} />
        <div className="mt-3">
          <Row
            label={t.settings.currency}
            onClick={() => router.push('/settings/currency')}
          />
        </div>
      </Section>

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
      </Section>

      {/* 守護（Beta）— per-group opt-in for the Guardian module (#220) */}
      <Section title={t.settings.sectionGuardian}>
        <GuardianBetaToggle enabled={guardianBetaEnabled} />
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

      <div className="px-4 pb-2 mt-4">
        <LogoutButton />
      </div>
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

