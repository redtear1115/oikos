import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
import { installDbErrorSanitizer } from './sanitizingQuery'

// #1453 — every query / transaction error is cleaned of bound values and row
// detail before any caller sees it. Must run before `db` is used; explicit
// because drizzle-orm is `sideEffects: false`.
installDbErrorSanitizer()

// Transaction mode pooler for serverless (pgbouncer=true disables prepared statements)
// Pool 上限與閒置釋放必須顯式設定：postgres.js 預設 max: 10 / idle_timeout: 0，
// 在 Vercel lambda（凍結不銷毀）上閒置連線永不歸還，會累積撞上 Supavisor
// 200 client connections 上限（2026-07-05 EMAXCONN 事件）
const client = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  max: 5,
  idle_timeout: 20,
  max_lifetime: 60 * 30,
  connect_timeout: 10,
  // #1453 — postgres.js' default prints the whole notice object with
  // console.log; a notice's message / detail / where can quote row values
  // (a RAISE NOTICE in a function, say). Keep only what names it.
  onnotice: (notice) => {
    console.log('[postgres notice]', {
      severity: notice.severity,
      code: notice.code,
      routine: notice.routine,
    })
  },
})

export const db = drizzle(client, { schema })
