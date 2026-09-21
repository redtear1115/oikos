import { describe, it, expect, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { mockBuilder, resetDbMocks } from './_mocks/db'
import { listAssetsForGroup, getAssetById } from '@/lib/db/queries/asset'
import { listRulesForAsset } from '@/lib/db/queries/recurringIncome'

// The /assets read queries take an optional `createdBefore` cut-off (see
// lib/pinnedChapterScope.ts). With it they must add `created_at < cutoff`;
// without it the WHERE clause is exactly what it was, so current members'
// reads do not change.
//
// Failure looks like: the page passes the cut-off, the page tests (which mock
// these queries) stay green, and the SQL still returns every row.

const dialect = new PgDialect()
const CUTOFF = new Date('2026-06-15T00:00:00Z')

function lastWhere(): { sql: string; params: unknown[] } {
  const calls = mockBuilder.where.mock.calls
  const q = dialect.sqlToQuery(calls[calls.length - 1][0] as SQL)
  return { sql: q.sql, params: q.params }
}

beforeEach(() => resetDbMocks())

describe('with a cut-off', () => {
  it('listAssetsForGroup keeps only assets created before it', async () => {
    await listAssetsForGroup('g1', CUTOFF)
    const { sql, params } = lastWhere()
    expect(sql).toContain('"Assets"."created_at" < $')
    expect(params).toContain(CUTOFF.toISOString())
  })

  it('getAssetById resolves nothing created at or after it', async () => {
    await getAssetById('a1', 'g1', CUTOFF)
    const { sql, params } = lastWhere()
    expect(sql).toContain('"Assets"."created_at" < $')
    expect(params).toContain(CUTOFF.toISOString())
  })

  it('listRulesForAsset keeps only rules created before it', async () => {
    await listRulesForAsset('g1', 'a1', CUTOFF)
    const { sql, params } = lastWhere()
    expect(sql).toContain('"RecurringIncomeRules"."created_at" < $')
    expect(params).toContain(CUTOFF.toISOString())
  })
})

describe('without a cut-off (current members)', () => {
  it.each([
    ['listAssetsForGroup', () => listAssetsForGroup('g1')],
    ['listAssetsForGroup(null)', () => listAssetsForGroup('g1', null)],
    ['getAssetById', () => getAssetById('a1', 'g1')],
    ['listRulesForAsset', () => listRulesForAsset('g1', 'a1')],
  ])('%s adds no created_at predicate', async (_name, run) => {
    await run()
    expect(lastWhere().sql).not.toContain('created_at')
  })
})
