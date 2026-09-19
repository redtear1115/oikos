'use client'

import Link from 'next/link'
import { AssetIcon } from '@/app/(dashboard)/_components/AssetIcon'
import { formatAmount } from '@/lib/currency'
import { useTranslations } from '@/lib/i18n/client'
import { todayLocalDate } from '@/lib/local-date'

// ─── Shared chassis helpers ───────────────────────────────────────────────────

function TintIconBox({ type, tintVar }: { type: string; tintVar: string }) {
  return (
    <div
      className="rounded-chip"
      style={{
        width: 36,
        height: 36,
        background: tintVar,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <AssetIcon type={type as import('@/lib/assets').AssetType} size={18} />
    </div>
  )
}

// #1323 — the money column used to sit right-aligned as its own visual
// block (see git history for the old `MonthAmount`). It now folds into a
// single quiet line under the relational meta line, so the card's anchor
// stays age / companionship / species — not the amount spent on them.
// Hidden entirely at 0 (no line, no placeholder): a quiet 0 still asks the
// reader to notice its absence, which isn't the point here.
function MoneyLine({
  monthAmount,
  totalAmount,
  isPast,
}: {
  monthAmount: number
  totalAmount: number
  isPast: boolean
}) {
  const t = useTranslations()
  const amount = isPast ? totalAmount : monthAmount
  if (amount === 0) return null
  const label = isPast ? t.assetListItem.thisChapter : t.assetListItem.thisMonth
  return (
    <div className="tnum text-xs mt-1 text-ink-3">
      {label} {formatAmount(amount, 'twd')}
    </div>
  )
}

function Dot() {
  return (
    <span
      aria-hidden="true"
      className="rounded-xs"
      style={{
        display: 'inline-block',
        width: 3, height: 3,
        background: 'var(--ink-3)',
        flexShrink: 0,
      }}
    />
  )
}

// ─── Age computation helpers ──────────────────────────────────────────────────

/**
 * Compute age in years + remaining months from a 'YYYY-MM-DD' string to today.
 * Returns null if birthday is null, invalid, or after today.
 */
function computeAge(birthday: string | null | undefined): { years: number; months: number } | null {
  if (!birthday) return null
  const today = todayLocalDate()
  const [y, m, d] = birthday.split('-').map(Number)
  if (!y || !m || !d || m > 12 || d > 31) return null
  let years = today.getFullYear() - y
  let months = today.getMonth() + 1 - m
  if (months < 0) {
    years -= 1
    months += 12
  }
  if (today.getDate() < d && months > 0) {
    months -= 1
  } else if (today.getDate() < d && months === 0) {
    years -= 1
    months = 11
  }
  // A birthday after today (typo, or a due date) has no age yet. Clamping it
  // to 0 used to keep the leftover month count, so 2027-01-01 read as 8 個月.
  if (years < 0) return null
  return { years, months }
}

function isBirthdayThisMonth(birthday: string | null | undefined): boolean {
  if (!birthday) return false
  const today = todayLocalDate()
  // Not born yet (a due date) has no birthday to mark, even in its own month.
  if (computeAge(birthday) === null) return false
  const [, m] = birthday.split('-').map(Number)
  return m === today.getMonth() + 1
}

function companionDays(sproutedAt: string | null | undefined): number | null {
  if (!sproutedAt) return null
  const today = todayLocalDate()
  const [y, m, d] = sproutedAt.split('-').map(Number)
  if (!y || !m || !d) return null
  const start = new Date(y, m - 1, d)
  const diff = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(0, diff)
}

// ─── ChildCard ────────────────────────────────────────────────────────────────

interface ChildCardProps {
  id: string
  name: string
  nickname?: string | null
  monthAmount: number
  totalAmount: number
  isPast: boolean
  childBirthday?: string | null
  childHeightCm?: number | null
  childWeightG?: number | null
}

export function ChildCard({
  id,
  name,
  nickname,
  monthAmount,
  totalAmount,
  isPast,
  childBirthday,
  childHeightCm,
  childWeightG,
}: ChildCardProps) {
  const t = useTranslations()
  const age = computeAge(childBirthday)
  const birthdayThisMonth = isBirthdayThisMonth(childBirthday)
  const displayName = nickname || name
  const secondaryName = nickname ? name : null
  const heightKg = childHeightCm != null ? `${childHeightCm} cm` : null
  const weightKg = childWeightG != null ? `${(childWeightG / 1000).toFixed(1)} kg` : null
  const bodyStr = [heightKg, weightKg].filter(Boolean).join(' · ')

  return (
    <Link
      href={`/assets/${id}`}
      className="block no-underline"
      style={{ color: 'var(--ink)' }}
    >
      <div
        className="rounded-2xl"
        style={{
          background: 'var(--surface)',
          border: '1px solid color-mix(in srgb, var(--asset-color-child) 25%, transparent)',
          overflow: 'hidden',
        }}
      >
        <div
          className="px-4 py-3"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <TintIconBox type="child" tintVar="var(--asset-tint-child)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Name line */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
              <div
                className="text-sm"
                style={{
                  fontWeight: 500, color: 'var(--ink)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {displayName}
              </div>
              {secondaryName && (
                <span
                  className="font-mono shrink-0 text-mini"
                  style={{ color: 'var(--ink-3)' }}
                >
                  {secondaryName}
                </span>
              )}
            </div>
            {/* Info line */}
            <div
              className="text-xs mt-1"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: 'var(--ink-3)',
                flexWrap: 'wrap',
              }}
            >
              {age && (
                <span style={{ color: 'var(--ink-2)', fontWeight: 500 }}>
                  {t.assetListItem.childAge
                    .replace('{years}', String(age.years))
                    .replace('{months}', String(age.months))}
                </span>
              )}
              {age && bodyStr && <Dot />}
              {bodyStr && <span>{bodyStr}</span>}
              {birthdayThisMonth && (
                <span
                  className="text-mini px-1.5 py-px rounded-sm"
                  style={{
                    background: 'var(--accent-soft)',
                    color: 'var(--ink-2)',
                    fontWeight: 500,
                  }}
                >
                  {t.assetListItem.birthdayThisMonth}
                </span>
              )}
            </div>
            <MoneyLine monthAmount={monthAmount} totalAmount={totalAmount} isPast={isPast} />
          </div>
        </div>
      </div>
    </Link>
  )
}

// ─── PetCard ──────────────────────────────────────────────────────────────────

interface PetCardProps {
  id: string
  name: string
  monthAmount: number
  totalAmount: number
  isPast: boolean
  petSpecies?: string | null
  petBreed?: string | null
  petBirthDate?: string | null
  petWeightG?: number | null
}

export function PetCard({
  id,
  name,
  monthAmount,
  totalAmount,
  isPast,
  petSpecies,
  petBreed,
  petBirthDate,
  petWeightG,
}: PetCardProps) {
  const t = useTranslations()
  const age = computeAge(petBirthDate)
  const speciesBreed = [petSpecies, petBreed].filter(Boolean).join('·')
  const weightKg = petWeightG != null ? `${(petWeightG / 1000).toFixed(1)} kg` : null

  return (
    <Link
      href={`/assets/${id}`}
      className="block no-underline"
      style={{ color: 'var(--ink)' }}
    >
      <div
        className="rounded-2xl"
        style={{
          background: 'var(--surface)',
          border: '1px solid color-mix(in srgb, var(--asset-color-pet) 25%, transparent)',
          overflow: 'hidden',
        }}
      >
        <div
          className="px-4 py-3"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <TintIconBox type="pet" tintVar="var(--asset-tint-pet)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="text-sm"
              style={{
                fontWeight: 500, color: 'var(--ink)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {name}
            </div>
            <div
              className="text-xs mt-1"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: 'var(--ink-3)',
                flexWrap: 'wrap',
              }}
            >
              {speciesBreed && (
                <span style={{ color: 'var(--ink-2)' }}>{speciesBreed}</span>
              )}
              {(age || weightKg) && speciesBreed && <Dot />}
              {age && (
                <span>
                  {age.years > 0
                    ? t.assetListItem.petAge.replace('{years}', String(age.years))
                    : (age.months === 0
                      ? t.assetListItem.petAgeUnderOneMonth
                      : t.assetListItem.petAgeMonths.replace('{months}', String(age.months)))}
                </span>
              )}
              {age && weightKg && <span>{weightKg}</span>}
              {!age && weightKg && <span>{weightKg}</span>}
            </div>
            <MoneyLine monthAmount={monthAmount} totalAmount={totalAmount} isPast={isPast} />
          </div>
        </div>
      </div>
    </Link>
  )
}

// ─── PlantCard ────────────────────────────────────────────────────────────────

interface PlantCardProps {
  id: string
  name: string
  monthAmount: number
  totalAmount: number
  isPast: boolean
  plantLocation?: string | null
  plantSproutedAt?: string | null
  plantWaterEvery?: number | null
}

export function PlantCard({
  id,
  name,
  monthAmount,
  totalAmount,
  isPast,
  plantLocation,
  plantSproutedAt,
}: PlantCardProps) {
  const t = useTranslations()
  const days = companionDays(plantSproutedAt)
  // `{days}` is rendered emphasised — split the template around it.
  const [daysBefore, daysAfter = ''] = t.assetListItem.plantCompanionDays.split('{days}')

  return (
    <Link
      href={`/assets/${id}`}
      className="block no-underline"
      style={{ color: 'var(--ink)' }}
    >
      <div
        className="rounded-2xl"
        style={{
          background: 'var(--surface)',
          border: '1px solid color-mix(in srgb, var(--asset-color-plant) 25%, transparent)',
          overflow: 'hidden',
        }}
      >
        <div
          className="px-4 py-3"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <TintIconBox type="plant" tintVar="var(--asset-tint-plant)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="text-sm"
              style={{
                fontWeight: 500, color: 'var(--ink)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {name}
            </div>
            <div
              className="text-xs mt-1"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: 'var(--ink-3)',
              }}
            >
              {days != null && (
                <span>
                  {daysBefore}
                  <span style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{days}</span>
                  {daysAfter}
                </span>
              )}
              {days != null && plantLocation && <Dot />}
              {plantLocation && <span>{plantLocation}</span>}
            </div>
            <MoneyLine monthAmount={monthAmount} totalAmount={totalAmount} isPast={isPast} />
          </div>
        </div>
      </div>
    </Link>
  )
}

// ─── ItemCard ─────────────────────────────────────────────────────────────────

interface ItemCardProps {
  id: string
  name: string
  monthAmount: number
  totalAmount: number
  isPast: boolean
  notes?: string | null
}

export function ItemCard({ id, name, monthAmount, totalAmount, isPast, notes }: ItemCardProps) {
  return (
    <Link
      href={`/assets/${id}`}
      className="block no-underline"
      style={{ color: 'var(--ink)' }}
    >
      <div
        className="rounded-2xl"
        style={{
          background: 'var(--surface)',
          border: '1px solid color-mix(in srgb, var(--asset-color-item) 25%, transparent)',
          overflow: 'hidden',
        }}
      >
        <div
          className="px-4 py-3"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <TintIconBox type="item" tintVar="var(--asset-tint-item)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <div
                className="text-sm"
                style={{
                  fontWeight: 500, color: 'var(--ink)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {name}
              </div>
            </div>
            {notes && (
              <div
                className="text-xs mt-1"
                style={{
                  color: 'var(--ink-3)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {notes}
              </div>
            )}
            <MoneyLine monthAmount={monthAmount} totalAmount={totalAmount} isPast={isPast} />
          </div>
        </div>
      </div>
    </Link>
  )
}

// ─── HouseCard ────────────────────────────────────────────────────────────────

interface HouseCardProps {
  id: string
  name: string
  monthAmount: number
  totalAmount: number
  isPast: boolean
}

export function HouseCard({ id, name, monthAmount, totalAmount, isPast }: HouseCardProps) {
  return (
    <Link
      href={`/assets/${id}`}
      className="block no-underline"
      style={{ color: 'var(--ink)' }}
    >
      <div
        className="rounded-2xl"
        style={{
          background: 'var(--surface)',
          border: '1px solid color-mix(in srgb, var(--asset-color-house) 25%, transparent)',
          overflow: 'hidden',
        }}
      >
        <div
          className="px-4 py-3"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <TintIconBox type="house" tintVar="var(--asset-tint-house)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="text-sm"
              style={{
                fontWeight: 500, color: 'var(--ink)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {name}
            </div>
            <MoneyLine monthAmount={monthAmount} totalAmount={totalAmount} isPast={isPast} />
          </div>
        </div>
      </div>
    </Link>
  )
}
