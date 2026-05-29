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
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
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

function MonthAmount({ amount }: { amount: number }) {
  const t = useTranslations()
  return (
    <div style={{ textAlign: 'right', flexShrink: 0 }}>
      <div
        className="font-mono"
        style={{ fontSize: 10, letterSpacing: 1, color: 'var(--ink-3)' }}
      >
        {t.assetListItem.thisMonth}
      </div>
      <div
        className="tnum"
        style={{ marginTop: 2, fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}
      >
        {formatAmount(amount, 'twd')}
      </div>
    </div>
  )
}

function Dot() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 3, height: 3,
        borderRadius: 2,
        background: 'var(--ink-3)',
        flexShrink: 0,
      }}
    />
  )
}

// ─── Age computation helpers ──────────────────────────────────────────────────

/**
 * Compute age in years + remaining months from a 'YYYY-MM-DD' string to today.
 * Returns null if birthday is null/invalid.
 */
function computeAge(birthday: string | null | undefined): { years: number; months: number } | null {
  if (!birthday) return null
  const today = todayLocalDate()
  const [y, m, d] = birthday.split('-').map(Number)
  if (!y || !m || !d) return null
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
  return { years: Math.max(0, years), months: Math.max(0, months) }
}

function isBirthdayThisMonth(birthday: string | null | undefined): boolean {
  if (!birthday) return false
  const today = todayLocalDate()
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
  childBirthday?: string | null
  childHeightCm?: number | null
  childWeightG?: number | null
}

export function ChildCard({
  id,
  name,
  nickname,
  monthAmount,
  childBirthday,
  childHeightCm,
  childWeightG,
}: ChildCardProps) {
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
        style={{
          background: 'var(--surface)',
          borderRadius: 16,
          border: '1px solid color-mix(in srgb, var(--asset-color-child) 25%, transparent)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
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
                style={{
                  fontSize: 14, fontWeight: 500, color: 'var(--ink)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {displayName}
              </div>
              {secondaryName && (
                <span
                  className="font-mono shrink-0"
                  style={{ fontSize: 10, color: 'var(--ink-3)' }}
                >
                  {secondaryName}
                </span>
              )}
            </div>
            {/* Info line */}
            <div
              style={{
                marginTop: 3,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                color: 'var(--ink-3)',
                flexWrap: 'wrap',
              }}
            >
              {age && (
                <span style={{ color: 'var(--ink-2)', fontWeight: 500 }}>
                  {age.years} 歲 {age.months} 個月
                </span>
              )}
              {age && bodyStr && <Dot />}
              {bodyStr && <span>{bodyStr}</span>}
              {birthdayThisMonth && (
                <span
                  style={{
                    fontSize: 10,
                    padding: '1px 6px',
                    borderRadius: 4,
                    background: 'var(--accent-soft)',
                    color: 'var(--ink-2)',
                    fontWeight: 500,
                  }}
                >
                  🎂 本月生日
                </span>
              )}
            </div>
          </div>
          <MonthAmount amount={monthAmount} />
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
  petSpecies?: string | null
  petBreed?: string | null
  petBirthDate?: string | null
  petWeightG?: number | null
}

export function PetCard({
  id,
  name,
  monthAmount,
  petSpecies,
  petBreed,
  petBirthDate,
  petWeightG,
}: PetCardProps) {
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
        style={{
          background: 'var(--surface)',
          borderRadius: 16,
          border: '1px solid color-mix(in srgb, var(--asset-color-pet) 25%, transparent)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <TintIconBox type="pet" tintVar="var(--asset-tint-pet)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 14, fontWeight: 500, color: 'var(--ink)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {name}
            </div>
            <div
              style={{
                marginTop: 3,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                color: 'var(--ink-3)',
                flexWrap: 'wrap',
              }}
            >
              {speciesBreed && (
                <span style={{ color: 'var(--ink-2)' }}>{speciesBreed}</span>
              )}
              {(age || weightKg) && speciesBreed && <Dot />}
              {age && <span>{age.years} 歲</span>}
              {age && weightKg && <span>{weightKg}</span>}
              {!age && weightKg && <span>{weightKg}</span>}
            </div>
          </div>
          <MonthAmount amount={monthAmount} />
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
  plantLocation?: string | null
  plantSproutedAt?: string | null
  plantWaterEvery?: number | null
}

export function PlantCard({
  id,
  name,
  monthAmount,
  plantLocation,
  plantSproutedAt,
}: PlantCardProps) {
  const days = companionDays(plantSproutedAt)

  return (
    <Link
      href={`/assets/${id}`}
      className="block no-underline"
      style={{ color: 'var(--ink)' }}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 16,
          border: '1px solid color-mix(in srgb, var(--asset-color-plant) 25%, transparent)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <TintIconBox type="plant" tintVar="var(--asset-tint-plant)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 14, fontWeight: 500, color: 'var(--ink)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {name}
            </div>
            <div
              style={{
                marginTop: 3,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                color: 'var(--ink-3)',
              }}
            >
              {days != null && (
                <span>
                  陪伴{' '}
                  <span style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{days}</span>
                  {' '}天
                </span>
              )}
              {days != null && plantLocation && <Dot />}
              {plantLocation && <span>{plantLocation}</span>}
            </div>
          </div>
          <MonthAmount amount={monthAmount} />
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
  templateKey?: string | null
  notes?: string | null
}

export function ItemCard({ id, name, monthAmount, templateKey, notes }: ItemCardProps) {
  return (
    <Link
      href={`/assets/${id}`}
      className="block no-underline"
      style={{ color: 'var(--ink)' }}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 16,
          border: '1px solid color-mix(in srgb, var(--asset-color-item) 25%, transparent)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
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
                style={{
                  fontSize: 14, fontWeight: 500, color: 'var(--ink)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {name}
              </div>
              {templateKey && (
                <span
                  className="font-mono shrink-0"
                  style={{
                    fontSize: 10,
                    color: 'var(--ink-2)',
                    background: 'rgba(58,36,25,0.06)',
                    padding: '2px 6px',
                    borderRadius: 4,
                  }}
                >
                  {templateKey}
                </span>
              )}
            </div>
            {notes && (
              <div
                style={{
                  marginTop: 3,
                  fontSize: 11,
                  color: 'var(--ink-3)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {notes}
              </div>
            )}
          </div>
          <MonthAmount amount={monthAmount} />
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
  houseAddress?: string | null
}

export function HouseCard({ id, name, monthAmount, houseAddress }: HouseCardProps) {
  return (
    <Link
      href={`/assets/${id}`}
      className="block no-underline"
      style={{ color: 'var(--ink)' }}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 16,
          border: '1px solid color-mix(in srgb, var(--asset-color-house) 25%, transparent)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <TintIconBox type="house" tintVar="var(--asset-tint-house)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 14, fontWeight: 500, color: 'var(--ink)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {name}
            </div>
            {houseAddress && (
              <div
                style={{
                  marginTop: 3,
                  fontSize: 11,
                  color: 'var(--ink-3)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {houseAddress}
              </div>
            )}
          </div>
          <MonthAmount amount={monthAmount} />
        </div>
      </div>
    </Link>
  )
}
