'use client'

import { useTranslations } from '@/lib/i18n/client'

export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 pt-[18px] pb-2">
      <div
        className="text-xs tracking-[1.5px] uppercase"
        style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}
      >{children}</div>
    </div>
  )
}

export function InfoCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mx-4 rounded-2xl overflow-hidden"
      style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
    >{children}</div>
  )
}

export function InfoRow({ label, value, mono = false, last = false }: {
  label: string; value: string; mono?: boolean; last?: boolean
}) {
  return (
    <div
      className="px-3.5 py-3 flex items-center gap-2.5"
      style={{ borderBottom: last ? 'none' : '1px solid var(--hairline)' }}
    >
      <div
        className="text-xs shrink-0 tracking-[0.4px]"
        style={{ color: 'var(--ink-3)', width: 76 }}
      >{label}</div>
      <div
        className="flex-1 text-sm font-medium truncate"
        style={{
          color: 'var(--ink)',
          fontFamily: mono ? 'var(--font-numeric)' : 'inherit',
        }}
      >{value || '—'}</div>
    </div>
  )
}

export function MoneyTwoCol({ month, total, accent }: { month: number; total: number; accent: string }) {
  const t = useTranslations()
  return (
    <div
      className="mx-4 mt-3 flex rounded-2xl px-3.5 py-3 gap-2"
      style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
    >
      {[{ label: t.assetDetail.money.thisMonth, value: month }, { label: t.assetDetail.money.cumulative, value: total }].map((s, i) => (
        <div key={s.label} className="flex-1 flex items-stretch gap-2">
          {i > 0 && <div className="w-px" style={{ background: 'var(--hairline)' }} />}
          <div className="flex-1">
            <div className="text-xs tracking-[1px]" style={{ color: accent, fontFamily: 'var(--font-numeric)' }}>{s.label}</div>
            {/* TODO(v0.17 currency): "NT$ {amount}" with space — defer to design
                 before migrating to formatAmount. */}
            <div className="text-base font-medium mt-0.5 tabular-nums" style={{ color: 'var(--ink)' }}>
              NT$ {s.value.toLocaleString()}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function AgeDisplay({ birth, accent }: { birth: string; accent: string }) {
  const t = useTranslations()
  const now = new Date()
  const b = new Date(birth)
  const months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth())
  const yrs = Math.floor(months / 12)
  const mos = months % 12
  return (
    <div className="text-center">
      <div className="text-xs tracking-[1.5px] uppercase" style={{ color: accent, fontFamily: 'var(--font-numeric)' }}>{t.assetDetail.age.label}</div>
      <div className="inline-flex items-baseline gap-1 mt-1">
        <span className="tabular-nums leading-none" style={{ fontFamily: 'var(--font-numeric)', fontSize: 'var(--fs-amount-md)', fontWeight: 500, color: 'var(--ink)', letterSpacing: -1 }}>
          {yrs}
        </span>
        <span className="text-xs font-medium" style={{ color: accent }}>{t.assetDetail.age.yearsSuffix}</span>
        {mos > 0 && (
          <>
            <span className="tabular-nums leading-none ml-1" style={{ fontFamily: 'var(--font-numeric)', fontSize: 'var(--fs-title)', fontWeight: 500, color: 'var(--ink)' }}>
              {mos}
            </span>
            <span className="text-xs font-medium" style={{ color: accent }}>{t.assetDetail.age.monthsSuffix}</span>
          </>
        )}
      </div>
    </div>
  )
}
