// 匯出的範圍決定（只含 viewer 待過的章節、刻意含 pending、為什麼入口在信任宣示頁）見
// docs/superpowers/specs/csv-export-design.md。
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/supabase/server'
import { getActiveGroupForUser } from '@/lib/db/queries/group'
import { listAllActiveCashTransactionsForExport } from '@/lib/db/queries/transactions'
import { getTranslations } from '@/lib/i18n/t'
import { buildExportFilename, buildTransactionsCsv } from '@/lib/csv/transactions'
import { captureServer } from '@/lib/analytics/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Group lookup is the trust boundary: a user can only export the group they
  // belong to. The query layer doesn't enforce membership on its own.
  // Same resolver as the dashboard and the server actions, so a user who is
  // in more than one group always exports the one they are using now.
  const group = await getActiveGroupForUser(user.id)
  if (!group) {
    return NextResponse.json({ error: 'no_group' }, { status: 404 })
  }

  const [rows, t] = await Promise.all([
    listAllActiveCashTransactionsForExport(group.id, user.id),
    getTranslations(),
  ])

  const csv = buildTransactionsCsv(rows, {
    columns: t.csvExport.columns,
    category: t.category,
    splitType: t.splitType,
  })
  const filename = buildExportFilename(t.csvExport.filenamePrefix)

  // Audit trail: who exported, from which group, how many rows. Never the
  // content. captureServer never throws and only sends from the prod deploy.
  await captureServer(user.id, 'transactions_exported', {
    group_id: group.id,
    row_count: rows.length,
  })

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
