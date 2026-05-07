import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups, assets } from '@/lib/db/schema'
import { or, eq, and } from 'drizzle-orm'
import { listActiveRules } from '@/lib/db/queries/recurringIncome'
import { RulesList } from './_components/RulesList'
import { DEFAULT_INCOME_PALETTE } from '@/lib/incomePalettes'
import { revalidatePath } from 'next/cache'

async function handleMutated() {
  'use server'
  revalidatePath('/settings/recurring-income')
}

export default async function RecurringIncomeSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) redirect('/setup')

  const rules = await listActiveRules(group.id)
  const insuranceAssetRows = await db
    .select({ id: assets.id, name: assets.name })
    .from(assets)
    .where(and(eq(assets.groupId, group.id), eq(assets.type, 'insurance')))

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-[var(--fs-xl)] font-semibold">定期進帳</h1>
        <Link
          href="/settings/recurring-income/new"
          className="rounded-full bg-[var(--ink)] px-4 py-2 text-[var(--fs-sm)] text-white"
        >
          + 新增
        </Link>
      </header>

      {rules.length === 0 ? (
        <EmptyState />
      ) : (
        <RulesList rules={rules} insuranceAssets={insuranceAssetRows} onMutated={handleMutated} />
      )}
    </div>
  )
}

function EmptyState() {
  const P = DEFAULT_INCOME_PALETTE

  const dots = [
    { x: 22, y: 18, r: 1.6, o: 0.30 },
    { x: 78, y: 14, r: 2.2, o: 0.22 },
    { x: 12, y: 38, r: 1.2, o: 0.18 },
    { x: 90, y: 30, r: 1.8, o: 0.28 },
    { x: 32, y: 60, r: 2.4, o: 0.32 },
    { x: 70, y: 64, r: 1.5, o: 0.20 },
    { x: 18, y: 78, r: 1.8, o: 0.24 },
    { x: 82, y: 82, r: 1.2, o: 0.18 },
    { x: 50, y: 25, r: 1.4, o: 0.22 },
    { x: 60, y: 88, r: 2.0, o: 0.26 },
  ]

  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div style={{ position: 'relative', width: '100%', height: 220, marginBottom: 24 }}>
        <svg
          width="100%"
          height="220"
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0 }}
        >
          {dots.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={P.ink} opacity={d.o} />
          ))}
          <circle cx="50" cy="50" r="12" fill={P.glow} opacity="0.6" />
          <circle cx="50" cy="50" r="8" fill={P.glow} opacity="0.4" />
          <circle cx="50" cy="50" r="5" fill={P.ink} opacity="0.25" />
          <circle cx="50" cy="50" r="2" fill={P.ink} opacity="0.7" />
        </svg>
      </div>

      <p className="mb-5 text-sm" style={{ color: 'var(--ink-2)', lineHeight: 1.6 }}>
        還沒設定定期進帳
      </p>

      <Link
        href="/settings/recurring-income/new"
        className="h-10 px-6 rounded-full text-sm font-semibold inline-flex items-center"
        style={{
          background: P.tint,
          color: P.ink,
          border: `1px solid ${P.ink}30`,
        }}
      >
        新增第一個
      </Link>
    </div>
  )
}
