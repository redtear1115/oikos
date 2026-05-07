import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups } from '@/lib/db/schema'
import { or, eq } from 'drizzle-orm'
import { listActiveRules } from '@/lib/db/queries/recurringIncome'
import { RuleListItem } from './_components/RuleListItem'

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
        <ul className="space-y-3">
          {rules.map((r) => (
            <RuleListItem key={r.id} rule={r} />
          ))}
        </ul>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <div className="text-[var(--fs-base)]" style={{ color: 'var(--ink-2)' }}>還沒設定定期進帳</div>
      <Link
        href="/settings/recurring-income/new"
        className="rounded-full bg-[var(--ink)] px-5 py-2 text-[var(--fs-sm)] text-white"
      >
        新增第一個
      </Link>
    </div>
  )
}
