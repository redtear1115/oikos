'use client'

import Link from 'next/link'
import { AssetIcon } from '@/app/(dashboard)/_components/AssetIcon'
import { formatAmount } from '@/lib/currency'
import { useTranslations } from '@/lib/i18n/client'
import { computeAge, daysSince } from '@/lib/age'
import { parseLocalDate } from '@/lib/local-date'
import { useToday } from '@/app/(dashboard)/_components/TodayProvider'

// ─── Shared chassis helpers ───────────────────────────────────────────────────

function TintIconBox({ type, tintVar }: { type: string; tintVar: string }) {
  return (
    <div
      className="rounded-chip w-9 h-9 flex items-center justify-center shrink-0"
      style={{
        background: tintVar,
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
      className="rounded-xs inline-block bg-ink-3 shrink-0 w-0.75 h-0.75"
    />
  )
}

// ─── Age computation helpers ──────────────────────────────────────────────────

function isBirthdayThisMonth(birthday: string | null | undefined, todayYMD: string): boolean {
  if (!birthday) return false
  const today = parseLocalDate(todayYMD)
  if (!today) return false
  // Not born yet (a due date) has no birthday to mark, even in its own month.
  if (computeAge(birthday, todayYMD) === null) return false
  const [, m] = birthday.split('-').map(Number)
  return m === today.getMonth() + 1
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
  const today = useToday()
  const age = computeAge(childBirthday, today)
  const birthdayThisMonth = isBirthdayThisMonth(childBirthday, today)
  const displayName = nickname || name
  const secondaryName = nickname ? name : null
  const heightKg = childHeightCm != null ? `${childHeightCm} cm` : null
  const weightKg = childWeightG != null ? `${(childWeightG / 1000).toFixed(1)} kg` : null
  const bodyStr = [heightKg, weightKg].filter(Boolean).join(' · ')

  return (
    <Link
      href={`/assets/${id}`}
      className="block no-underline text-ink"
    >
      <div
        className="rounded-2xl bg-surface overflow-hidden"
        style={{
          border: '1px solid color-mix(in srgb, var(--asset-color-child) 25%, transparent)',
        }}
      >
        <div
          className="px-4 py-3 flex items-center gap-3"
        >
          <TintIconBox type="child" tintVar="var(--asset-tint-child)" />
          <div className="flex-1 min-w-0">
            {/* Name line */}
            <div className="flex items-baseline gap-1.5 min-w-0">
              <div
                className="text-sm font-medium text-ink overflow-hidden text-ellipsis whitespace-nowrap"
              >
                {displayName}
              </div>
              {secondaryName && (
                <span
                  className="font-mono shrink-0 text-mini text-ink-3"
                >
                  {secondaryName}
                </span>
              )}
            </div>
            {/* Info line */}
            <div
              className="text-xs mt-1 flex items-center gap-1.5 text-ink-3 flex-wrap"
            >
              {age && (
                <span className="text-ink-2 font-medium">
                  {t.assetListItem.childAge
                    .replace('{years}', String(age.years))
                    .replace('{months}', String(age.months))}
                </span>
              )}
              {age && bodyStr && <Dot />}
              {bodyStr && <span>{bodyStr}</span>}
              {birthdayThisMonth && (
                <span
                  className="text-mini px-1.5 py-px rounded-sm bg-accent-soft text-ink-2 font-medium"
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
  const today = useToday()
  const age = computeAge(petBirthDate, today)
  const speciesBreed = [petSpecies, petBreed].filter(Boolean).join('·')
  const weightKg = petWeightG != null ? `${(petWeightG / 1000).toFixed(1)} kg` : null

  return (
    <Link
      href={`/assets/${id}`}
      className="block no-underline text-ink"
    >
      <div
        className="rounded-2xl bg-surface overflow-hidden"
        style={{
          border: '1px solid color-mix(in srgb, var(--asset-color-pet) 25%, transparent)',
        }}
      >
        <div
          className="px-4 py-3 flex items-center gap-3"
        >
          <TintIconBox type="pet" tintVar="var(--asset-tint-pet)" />
          <div className="flex-1 min-w-0">
            <div
              className="text-sm font-medium text-ink overflow-hidden text-ellipsis whitespace-nowrap"
            >
              {name}
            </div>
            <div
              className="text-xs mt-1 flex items-center gap-1.5 text-ink-3 flex-wrap"
            >
              {speciesBreed && (
                <span className="text-ink-2">{speciesBreed}</span>
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
  const today = useToday()
  const days = daysSince(plantSproutedAt, today)
  // `{days}` is rendered emphasised — split the template around it.
  const [daysBefore, daysAfter = ''] = t.assetListItem.plantCompanionDays.split('{days}')

  return (
    <Link
      href={`/assets/${id}`}
      className="block no-underline text-ink"
    >
      <div
        className="rounded-2xl bg-surface overflow-hidden"
        style={{
          border: '1px solid color-mix(in srgb, var(--asset-color-plant) 25%, transparent)',
        }}
      >
        <div
          className="px-4 py-3 flex items-center gap-3"
        >
          <TintIconBox type="plant" tintVar="var(--asset-tint-plant)" />
          <div className="flex-1 min-w-0">
            <div
              className="text-sm font-medium text-ink overflow-hidden text-ellipsis whitespace-nowrap"
            >
              {name}
            </div>
            <div
              className="text-xs mt-1 flex items-center gap-1.5 text-ink-3"
            >
              {days != null && (
                <span>
                  {daysBefore}
                  <span className="text-ink-2 font-medium">{days}</span>
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
      className="block no-underline text-ink"
    >
      <div
        className="rounded-2xl bg-surface overflow-hidden"
        style={{
          border: '1px solid color-mix(in srgb, var(--asset-color-item) 25%, transparent)',
        }}
      >
        <div
          className="px-4 py-3 flex items-center gap-3"
        >
          <TintIconBox type="item" tintVar="var(--asset-tint-item)" />
          <div className="flex-1 min-w-0">
            <div
              className="flex items-center gap-1.5"
            >
              <div
                className="text-sm font-medium text-ink overflow-hidden text-ellipsis whitespace-nowrap"
              >
                {name}
              </div>
            </div>
            {notes && (
              <div
                className="text-xs mt-1 text-ink-3 overflow-hidden text-ellipsis whitespace-nowrap"
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
      className="block no-underline text-ink"
    >
      <div
        className="rounded-2xl bg-surface overflow-hidden"
        style={{
          border: '1px solid color-mix(in srgb, var(--asset-color-house) 25%, transparent)',
        }}
      >
        <div
          className="px-4 py-3 flex items-center gap-3"
        >
          <TintIconBox type="house" tintVar="var(--asset-tint-house)" />
          <div className="flex-1 min-w-0">
            <div
              className="text-sm font-medium text-ink overflow-hidden text-ellipsis whitespace-nowrap"
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
