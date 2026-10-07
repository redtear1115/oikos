import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PICKABLE_CATEGORIES, isWritableExpenseCategory } from '@/lib/categories'
import { INCOME_CATEGORIES } from '@/lib/incomeCategories'

// #1541: the category CHECK constraints in 0084 must list exactly the ids in code.
// Adding a category id without widening the CHECK would make every insert with it
// fail in prod with 23514, so this fails CI instead.
const sql = readFileSync(join(process.cwd(), 'drizzle/0084_category_check.sql'), 'utf8')

function checkList(table: string): string[] {
  const m = sql.match(
    new RegExp(`ADD CONSTRAINT "${table}_category_valid"\\s+CHECK \\("category" IN \\(([^)]*)\\)\\) NOT VALID`),
  )
  if (!m) throw new Error(`no CHECK for ${table} in 0084`)
  return [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!).sort()
}

const expenseIds = PICKABLE_CATEGORIES.map((c) => c.id).sort()
const incomeIds = INCOME_CATEGORIES.map((c) => c.id).sort()

describe('0084 category CHECK lists match code', () => {
  it.each(['CashTransactions', 'RecurringExpenseRules', 'TripExpenses'])('%s = expense ids', (t) => {
    expect(checkList(t)).toEqual(expenseIds)
  })
  it.each(['IncomeTransactions', 'RecurringIncomeRules'])('%s = income ids', (t) => {
    expect(checkList(t)).toEqual(incomeIds)
  })
  it('UPDATE backfill lists match the CHECK lists', () => {
    for (const t of ['CashTransactions', 'RecurringExpenseRules', 'TripExpenses', 'IncomeTransactions', 'RecurringIncomeRules']) {
      const m = sql.match(new RegExp(`UPDATE "${t}" SET "category" = 'other' WHERE "category" NOT IN \\(([^)]*)\\)`))
      expect([...m![1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!).sort()).toEqual(checkList(t))
    }
  })
})

describe('isWritableExpenseCategory', () => {
  it('accepts pickable ids only', () => {
    for (const id of expenseIds) expect(isWritableExpenseCategory(id)).toBe(true)
    for (const id of ['settle', 'food', 'constructor', '__proto__', '', ' dining']) {
      expect(isWritableExpenseCategory(id)).toBe(false)
    }
  })
})
