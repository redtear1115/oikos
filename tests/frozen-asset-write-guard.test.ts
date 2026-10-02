/**
 * #1442 — static guard: frozen copies stay read-only.
 *
 * leaveGroup leaves *frozen copies* of 愛物 (Assets.frozen_at IS NOT NULL) in
 * a record's own ledger. They are read-only, enforced server-side only (no DB
 * trigger, #1290): every asset statement in `actions/asset.ts` and
 * `actions/fuelLog.ts` must filter through `writableAsset(…)`
 * (lib/auth/asset.ts), which excludes frozen rows. Read-only actions that may
 * see a frozen copy are an explicit allowlist below.
 *
 * Failure looks like: nothing at runtime. A new edit/delete/link site written
 * with a hand-rolled `eq(assets.groupId, …)` lets the user rename, delete or
 * log fuel on a frozen copy, with no error anywhere. This test fails first.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..')
const GUARDED_FILES = [join('actions', 'asset.ts'), join('actions', 'fuelLog.ts')]

/** Read-only actions: they may resolve a frozen copy (name display, reveal → field_not_filled). */
const READ_ONLY_ALLOWLIST = new Set([
  'revealChildPii',
  'revealChildName',
  'revealCarPlate',
  'revealHouseAddress',
  'loadAsset',
  'getCarAssets',
  'getChildAssets',
  'loadAssetsForPicker',
  'getFuelLogById',
])

/** Link checks (not writes to the asset row) — the only places `keepFrozenId` may appear. */
const LINK_CHECKS = new Set(['assertInsuredChildInGroup', 'assertVehicleInGroup'])

const ANCHOR = /\.(?:from|update)\(assets\)|[jJ]oin\(assets\b|\bassets\.groupId\b/

interface Site { file: string; line: number; fn: string; text: string }

function enclosingFn(lines: string[], i: number): string {
  for (let j = i; j >= 0; j--) {
    const m =
      lines[j].match(/^export const (\w+) = action\(/) ??
      lines[j].match(/^(?:export )?(?:async )?function (\w+)/)
    if (m) return m[1]
  }
  return '<top-level>'
}

/**
 * The whole query chain around an anchor line: back to its `await`, forward
 * to its `.limit(` / `.returning(`. Every asset query in these files ends in
 * one of the two; a chain that doesn't is reported as unparsed (fails).
 */
function statementAt(lines: string[], i: number): string | null {
  let start = i
  while (start > 0 && !/\bawait\b/.test(lines[start]) && i - start < 25) start--
  if (!/\bawait\b/.test(lines[start])) return null
  for (let end = i; end < lines.length && end - i < 20; end++) {
    if (/\.limit\(|\.returning\(/.test(lines[end])) return lines.slice(start, end + 1).join('\n')
  }
  return null
}

function anchorSites(): { sites: Site[]; unparsed: string[] } {
  const sites: Site[] = []
  const unparsed: string[] = []
  const seen = new Set<string>()
  for (const file of GUARDED_FILES) {
    const lines = readFileSync(join(ROOT, file), 'utf8').split('\n')
    lines.forEach((l, i) => {
      if (!ANCHOR.test(l) || /^\s*(\/\/|\*)/.test(l)) return
      const fn = enclosingFn(lines, i)
      const text = statementAt(lines, i)
      if (text === null) { unparsed.push(`${file}:${i + 1} (${fn})`); return }
      const key = `${file}:${fn}:${text}`
      if (seen.has(key)) return
      seen.add(key)
      sites.push({ file, line: i + 1, fn, text })
    })
  }
  return { sites, unparsed }
}

describe('frozen-asset write guard (actions/asset.ts, actions/fuelLog.ts)', () => {
  const { sites, unparsed } = anchorSites()
  const guarded = sites.filter((s) => !READ_ONLY_ALLOWLIST.has(s.fn))
  const allowed = sites.filter((s) => READ_ONLY_ALLOWLIST.has(s.fn))

  it('every asset statement is parsed (an unrecognised shape fails rather than slipping through)', () => {
    expect(unparsed).toEqual([])
  })

  it('finds the known sites (guard against the scan silently matching nothing)', () => {
    // asset.ts: 12 edit/softDelete/renew/lapse + child link + vehicle link +
    // editInsurance stored-link read; fuelLog.ts: create, edit ×2, softDelete.
    expect(guarded.length).toBeGreaterThanOrEqual(19)
    expect(new Set(guarded.map((s) => s.file))).toEqual(new Set(GUARDED_FILES))
    // reveal ×4 + getFuelLogById
    expect(allowed.length).toBeGreaterThanOrEqual(5)
  })

  it('every non-read-only asset statement filters through writableAsset(…)', () => {
    const bad = guarded
      .filter((s) => !/\bwritableAsset\(/.test(s.text) || /eq\(assets\.groupId\b/.test(s.text))
      .map((s) => `${s.file}:${s.line} (${s.fn})`)
    expect(bad).toEqual([])
  })

  it('keepFrozenId appears only in the link checks, never on a write to the asset row', () => {
    const bad = sites
      .filter((s) => /keepFrozenId/.test(s.text) && (!LINK_CHECKS.has(s.fn) || /\.update\(assets\)/.test(s.text)))
      .map((s) => `${s.file}:${s.line} (${s.fn})`)
    expect(bad).toEqual([])
  })

  it('the allowlist only names functions that exist (a rename must not widen it silently)', () => {
    const src = GUARDED_FILES.map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n')
    for (const fn of READ_ONLY_ALLOWLIST) {
      expect(src, fn).toMatch(new RegExp(`export const ${fn} = action\\(`))
    }
  })

  it('a hand-written group filter is caught (self-test of the scan)', () => {
    const lines = [
      'export const editThing = action(async () => {',
      '  const updated = await db',
      '    .update(assets)',
      '    .set({ name })',
      '    .where(and(eq(assets.id, id), eq(assets.groupId, group.id), isNull(assets.deletedAt)))',
      '    .returning({ id: assets.id })',
      '})',
    ]
    const text = statementAt(lines, 2)
    expect(text).not.toBeNull()
    expect(/\bwritableAsset\(/.test(text!)).toBe(false)
  })
})

describe('frozen-asset link checks outside asset.ts / fuelLog.ts', () => {
  const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

  it('assertAssetInGroup rejects a frozen asset with linked_asset_not_in_group', () => {
    const src = read('lib/auth/asset.ts')
    expect(src).toMatch(/frozenAt: assets\.frozenAt/)
    expect(src).toMatch(/asset\.frozenAt[\s\S]{0,120}actionError\('linked_asset_not_in_group'\)/)
  })

  it('every assertAssetInGroup import resolves to lib/auth/asset (directly or via the recurringActionHelpers re-export)', () => {
    expect(read('lib/recurringActionHelpers.ts')).toMatch(/export \{ assertAssetInGroup \} from '@\/lib\/auth\/asset'/)
    for (const f of ['actions/transaction.ts', 'actions/income.ts', 'actions/recurringExpense.ts', 'actions/recurringIncome.ts']) {
      const src = read(f)
      expect(src, f).toMatch(/assertAssetInGroup/)
      expect(src, f).toMatch(/from '@\/lib\/(?:auth\/asset|recurringActionHelpers)'/)
      expect(src, f).not.toMatch(/function assertAssetInGroup/)
    }
  })

  it.each(['actions/recurringExpense.ts', 'actions/recurringIncome.ts'])(
    '%s: resumeRule and confirmPending check frozen explicitly',
    (f) => {
      const src = read(f)
      const body = (name: string) => {
        const start = src.indexOf(`export const ${name} = action(`)
        expect(start, name).toBeGreaterThan(-1)
        const next = src.indexOf('\nexport const ', start + 1)
        return src.slice(start, next === -1 ? undefined : next)
      }
      expect(body('resumeRule')).toMatch(/assets\.frozenAt[\s\S]*actionError\('linked_asset_not_in_group'\)/)
      expect(body('confirmPending')).toMatch(/assets\.frozenAt[\s\S]*actionError\('linked_asset_not_in_group'\)/)
      // editAndConfirmPending / createRule / updateRule go through assertAssetInGroup.
      expect(body('editAndConfirmPending')).toMatch(/assertAssetInGroup\(/)
      expect(body('createRule')).toMatch(/assertAssetInGroup\(/)
      expect(body('updateRule')).toMatch(/assertAssetInGroup\([^)]*keepFrozenId: existing\.assetId/)
    },
  )
})
