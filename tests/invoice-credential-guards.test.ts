import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fetchInvoicesByCarrier } from '@/lib/invoice/api'

/**
 * #1289 F6 — guards for the invoice credential before Phase B wires the real
 * MoF client. Today the plaintext verification code exists only in memory
 * while a credential is bound or refreshed; nothing decrypts the stored value.
 * Phase B will, and these fail when it does so somewhere unexpected.
 *
 * Failure looks like: nothing at runtime. A decrypt in a second module, or a
 * log / capture call that takes a credential field, works fine and leaks
 * quietly. These tests are the only thing that turns red.
 */

const ROOT = join(__dirname, '..')

function sourceFiles(dir: string): string[] {
  if (!existsSync(join(ROOT, dir))) return []
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = join(dir, e.name)
    if (e.isDirectory()) return sourceFiles(rel)
    return /\.tsx?$/.test(e.name) ? [rel] : []
  })
}

/** The one module allowed to decrypt the stored verification code (Phase B). */
const DECRYPT_OWNER = join('lib', 'invoice', 'credentials.ts')

describe('invoice credential guards', () => {
  it('only lib/invoice/credentials.ts may decrypt the verification code', () => {
    const offenders = ['actions', 'app', 'lib', 'components']
      .flatMap(sourceFiles)
      .filter((f) => f !== join('lib', 'crypto.ts')) // the primitive itself
      .filter((f) => f !== DECRYPT_OWNER)
      .filter((f) => {
        const src = readFileSync(join(ROOT, f), 'utf8')
        return /\bdecrypt\s*\(/.test(src) && /verificationCodeEncrypted|verification_code_encrypted/.test(src)
      })
    expect(offenders).toEqual([])
  })

  it('no log / Sentry / analytics call in the invoice code takes a credential field', () => {
    const files = [join('actions', 'invoice.ts'), ...sourceFiles(join('lib', 'invoice'))]
    expect(files.length).toBeGreaterThanOrEqual(3) // actions/invoice.ts, lib/invoice/api.ts, lib/invoice/diff.ts
    const CALL_RE = /\b(?:console\.\w+|Sentry\.\w+|captureServer|captureException|captureMessage|capture|track|posthog\.\w+)\s*\(/g
    const FIELD_RE = /barcode|verificationCode|verification_code|cardNo|Encrypted/i
    const bad: string[] = []
    for (const f of files) {
      const src = readFileSync(join(ROOT, f), 'utf8')
      for (const m of src.matchAll(CALL_RE)) {
        // Arguments up to the matching close paren.
        let depth = 0
        let end = m.index! + m[0].length - 1
        for (; end < src.length; end++) {
          if (src[end] === '(') depth++
          else if (src[end] === ')' && --depth === 0) break
        }
        const call = src.slice(m.index, end + 1)
        if (FIELD_RE.test(call)) bad.push(`${f}: ${call.slice(0, 80)}`)
      }
    }
    expect(bad).toEqual([])
  })

  describe('fetchInvoicesByCarrier', () => {
    const saved = { app: process.env.MOF_INVOICE_APP_ID, mock: process.env.INVOICE_MOCK_MODE }
    afterEach(() => {
      if (saved.app === undefined) delete process.env.MOF_INVOICE_APP_ID
      else process.env.MOF_INVOICE_APP_ID = saved.app
      if (saved.mock === undefined) delete process.env.INVOICE_MOCK_MODE
      else process.env.INVOICE_MOCK_MODE = saved.mock
    })

    it('the real-API branch still throws until Phase B', async () => {
      process.env.MOF_INVOICE_APP_ID = 'placeholder-app-id'
      delete process.env.INVOICE_MOCK_MODE
      await expect(fetchInvoicesByCarrier({
        barcode: '/AB12CD3',
        verificationCode: 'A1B2C3D4',
        startDate: '2026-01-01',
        endDate: '2026-01-07',
      })).rejects.toThrow(/not implemented/)
    })
  })
})
