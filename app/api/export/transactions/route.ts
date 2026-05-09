import { NextResponse } from 'next/server'
import { eq, or } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups } from '@/lib/db/schema'
import { listAllActiveCashTransactionsForExport } from '@/lib/db/queries/transactions'
import { getTranslations } from '@/lib/i18n/t'
import { buildExportFilename, buildTransactionsCsv } from '@/lib/csv/transactions'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Group lookup is the trust boundary: a user can only export the group they
  // belong to. The query layer doesn't enforce membership on its own.
  const [group] = await db
    .select({ id: oikosGroups.id })
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) {
    return NextResponse.json({ error: 'no_group' }, { status: 404 })
  }

  const [rows, t] = await Promise.all([
    listAllActiveCashTransactionsForExport(group.id),
    getTranslations(),
  ])

  const csv = buildTransactionsCsv(rows, {
    columns: t.csvExport.columns,
    category: t.category,
    splitType: t.splitType,
  })
  const filename = buildExportFilename(t.csvExport.filenamePrefix)

  return new NextResponse(csv, {
    status: 200,
    headers: {
      // text/csv with explicit utf-8 charset; the leading BOM still helps Excel.
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
