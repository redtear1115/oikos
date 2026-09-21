import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

export function loadEnvLocal() {
  const envPath = resolve(__dirname, '../../.env.local')
  if (!existsSync(envPath)) return
  for (const raw of readFileSync(envPath, 'utf-8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

/**
 * Seed a fresh group with one open epoch. Returns the viewer (member_a) id,
 * the partner (member_b) id unless solo, the group id, and the open epoch id.
 * Call AFTER loadEnvLocal() and after importing db.
 */
export async function seedGroup(opts: { solo?: boolean } = {}) {
  const { db } = await import('@/lib/db/client')
  const { profiles, oikosGroups, groupEpochs, groupBalance } = await import('@/lib/db/schema')

  const userId = randomUUID()
  const partnerId = opts.solo ? null : randomUUID()
  await db.insert(profiles).values({ id: userId, displayName: '我' })
  if (partnerId) await db.insert(profiles).values({ id: partnerId, displayName: '伴' })

  const now = new Date()
  const [group] = await db.insert(oikosGroups).values({
    name: 'test', memberA: userId, memberB: partnerId,
    currentEpochStartedAt: now, baseCurrency: 'twd',
  }).returning()
  const [epoch] = await db.insert(groupEpochs).values({
    groupId: group.id, startedAt: now, memberAId: userId, memberBId: partnerId,
  }).returning()
  await db.insert(groupBalance).values({ groupId: group.id, balance: 0 })

  return { userId, partnerId, groupId: group.id, epochId: epoch.id }
}
