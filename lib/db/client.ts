import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

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
})

export const db = drizzle(client, { schema })
