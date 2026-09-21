import { describe, it, expect, afterEach, vi } from 'vitest'
import { createCipheriv, randomBytes } from 'crypto'
import { encrypt, decrypt, aadFor, CryptoError, ENCRYPTED_COLUMNS, type AadContext } from '@/lib/crypto'

// vitest.config.ts sets ENCRYPTION_KEY to K1 for every test.
const K1 = '0000000000000000000000000000000000000000000000000000000000000001'
const K1_OTHER = '0000000000000000000000000000000000000000000000000000000000000002'
const K2 = 'aa'.repeat(32)
const K2_OTHER = 'ab'.repeat(32)
const K3 = 'bb'.repeat(32)

const PK = '6f1c2d3e-4a5b-4c6d-8e7f-001122334455'
const OTHER_PK = '6f1c2d3e-4a5b-4c6d-8e7f-001122334456'
const CTX = aadFor('ChildDetails', 'id_number_encrypted', PK)

const LEGACY_RE = /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/

afterEach(() => {
  vi.unstubAllEnvs()
})

function setKeyEnv(env: { key?: string; keys?: string; writeKid?: string }) {
  vi.stubEnv('ENCRYPTION_KEY', env.key ?? '')
  vi.stubEnv('ENCRYPTION_KEYS', env.keys ?? '')
  vi.stubEnv('ENCRYPTION_WRITE_KID', env.writeKid ?? '')
}

/** Hand-rolled legacy ciphertext under an arbitrary key (no AAD). */
function legacyUnder(keyHex: string, plaintext: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv)
  const ct = Buffer.concat([c.update(plaintext, 'utf8'), c.final()])
  return `${iv.toString('hex')}:${c.getAuthTag().toString('hex')}:${ct.toString('hex')}`
}

function v1Parts(ct: string) {
  const [prefix, kid, iv, tag, body] = ct.split(':')
  return { prefix, kid, iv, tag, body }
}

// ── pre-existing behaviour (adjusted only for the ctx argument) ────────────────

describe('crypto', () => {
  it('round-trips a string correctly', () => {
    const plaintext = 'A123456789'
    const ciphertext = encrypt(plaintext, CTX)
    expect(ciphertext).not.toBe(plaintext)
    expect(decrypt(ciphertext, CTX)).toBe(plaintext)
  })

  it('produces different ciphertext each time (random IV)', () => {
    const plaintext = 'same input'
    expect(encrypt(plaintext, CTX)).not.toBe(encrypt(plaintext, CTX))
  })

  it('throws on tampered ciphertext payload', () => {
    const ciphertext = encrypt('secret', CTX)
    const tampered = ciphertext.slice(0, -4) + 'xxxx'
    expect(() => decrypt(tampered, CTX)).toThrow()
  })

  it('throws on tampered auth tag', () => {
    const [iv, , encrypted] = encrypt('secret', CTX).split(':')
    const fakeTag = 'deadbeefdeadbeefdeadbeefdeadbeef'
    expect(() => decrypt(`${iv}:${fakeTag}:${encrypted}`, CTX)).toThrow()
  })
})

// ── S1: writes stay legacy ─────────────────────────────────────────────────────

describe('crypto — legacy format (S1 default)', () => {
  it('with only ENCRYPTION_KEY set, encrypt writes the legacy 3-part format', () => {
    setKeyEnv({ key: K1 })
    const ct = encrypt('A123456789', CTX)
    expect(ct).toMatch(LEGACY_RE)
    expect(decrypt(ct, CTX)).toBe('A123456789')
  })

  it('legacy round-trips the empty string and multibyte text', () => {
    setKeyEnv({ key: K1 })
    expect(decrypt(encrypt('', CTX), CTX)).toBe('')
    expect(decrypt(encrypt('陳小白', CTX), CTX)).toBe('陳小白')
  })

  it('a pre-existing legacy row (written by the old code, no AAD) still decrypts', () => {
    setKeyEnv({ key: K1 })
    const existing = legacyUnder(K1, '台北市大安區某路1號')
    expect(decrypt(existing, aadFor('HouseDetails', 'address_encrypted', PK))).toBe('台北市大安區某路1號')
  })

  it('legacy rows still decrypt after v1 writes are on and k2 is in the keyring', () => {
    const existing = legacyUnder(K1, 'ABC-1234')
    setKeyEnv({ key: K1, keys: `k2:${K2}`, writeKid: 'k2' })
    expect(decrypt(existing, aadFor('CarDetails', 'plate_encrypted', PK))).toBe('ABC-1234')
  })

  it('legacy never decrypts under any key other than k1', () => {
    const underK2 = legacyUnder(K2, 'secret')
    setKeyEnv({ key: K1, keys: `k2:${K2},k3:${K3}` })
    expect(() => decrypt(underK2, CTX)).toThrow(CryptoError)
  })
})

// ── v1 + AAD ───────────────────────────────────────────────────────────────────

describe('crypto — v1 format with AAD', () => {
  it('round-trips v1:k1 with the write kid set', () => {
    setKeyEnv({ key: K1, writeKid: 'k1' })
    const ct = encrypt('A123456789', CTX)
    expect(ct).toMatch(/^v1:k1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/)
    expect(decrypt(ct, CTX)).toBe('A123456789')
  })

  it('v1 under k2 decrypts once ENCRYPTION_KEYS has k2', () => {
    setKeyEnv({ key: K1, keys: `k2:${K2}`, writeKid: 'k2' })
    const ct = encrypt('NHI-001', CTX)
    expect(ct.startsWith('v1:k2:')).toBe(true)
    // Write kid moves on; k2 values stay readable while k2 is in the ring.
    setKeyEnv({ key: K1, keys: `k2:${K2},k3:${K3}`, writeKid: 'k3' })
    expect(decrypt(ct, CTX)).toBe('NHI-001')
  })

  it('v1:k1 values keep decrypting after the write kid moves to k2', () => {
    setKeyEnv({ key: K1, writeKid: 'k1' })
    const ct = encrypt('ABC-1234', CTX)
    setKeyEnv({ key: K1, keys: `k2:${K2}`, writeKid: 'k2' })
    expect(decrypt(ct, CTX)).toBe('ABC-1234')
  })

  it('ENCRYPTION_KEY unset with only k2 present: v1:k2 works, legacy throws', () => {
    const legacy = legacyUnder(K1, 'old')
    setKeyEnv({ keys: `k2:${K2}`, writeKid: 'k2' })
    const ct = encrypt('new', CTX)
    expect(ct.startsWith('v1:k2:')).toBe(true)
    expect(decrypt(ct, CTX)).toBe('new')
    expect(() => decrypt(legacy, CTX)).toThrow(CryptoError)
  })

  it('with no k1 and no write kid, encrypt throws instead of writing an unreadable format', () => {
    setKeyEnv({ keys: `k2:${K2}` })
    expect(() => encrypt('x', CTX)).toThrow(CryptoError)
  })

  it('aadFor builds v1|Table.column|pk and nothing else (no groupId)', () => {
    expect(aadFor('Assets', 'name_encrypted', PK).aad).toBe(`v1|Assets.name_encrypted|${PK}`)
    expect(aadFor('InvoiceCredentials', 'verification_code_encrypted', PK).aad)
      .toBe(`v1|InvoiceCredentials.verification_code_encrypted|${PK}`)
  })
})

// ── fail closed ────────────────────────────────────────────────────────────────

describe('crypto — fails closed', () => {
  it('wrong key (same kid k1, different bytes) throws — v1', () => {
    setKeyEnv({ key: K1, writeKid: 'k1' })
    const ct = encrypt('secret', CTX)
    setKeyEnv({ key: K1_OTHER, writeKid: 'k1' })
    expect(() => decrypt(ct, CTX)).toThrow(CryptoError)
  })

  it('wrong key (same kid k1, different bytes) throws — legacy', () => {
    setKeyEnv({ key: K1 })
    const ct = encrypt('secret', CTX)
    setKeyEnv({ key: K1_OTHER })
    expect(() => decrypt(ct, CTX)).toThrow(CryptoError)
  })

  it('wrong key (same kid k2, different bytes) throws and does not fall back to k1', () => {
    setKeyEnv({ key: K1, keys: `k2:${K2}`, writeKid: 'k2' })
    const ct = encrypt('secret', CTX)
    setKeyEnv({ key: K1, keys: `k2:${K2_OTHER}`, writeKid: 'k1' })
    expect(() => decrypt(ct, CTX)).toThrow(CryptoError)
  })

  it('unknown kid throws even when other keys are present (no trying another key)', () => {
    setKeyEnv({ key: K1, keys: `k2:${K2}`, writeKid: 'k2' })
    const ct = encrypt('secret', CTX)
    setKeyEnv({ key: K1, keys: `k3:${K3}` })
    expect(() => decrypt(ct, CTX)).toThrow(CryptoError)
  })

  it('a write kid missing from the keyring throws inside encrypt', () => {
    setKeyEnv({ key: K1, writeKid: 'k2' })
    expect(() => encrypt('secret', CTX)).toThrow(CryptoError)
  })

  it('a malformed write kid throws', () => {
    setKeyEnv({ key: K1, writeKid: 'K1' })
    expect(() => encrypt('secret', CTX)).toThrow(CryptoError)
  })

  describe('tampering with a v1 value', () => {
    function fresh() {
      setKeyEnv({ key: K1, keys: `k2:${K2}`, writeKid: 'k2' })
      return v1Parts(encrypt('secret-value', CTX))
    }
    const flip = (hex: string) => (hex[0] === '0' ? '1' : '0') + hex.slice(1)

    it('tampered iv throws', () => {
      const p = fresh()
      expect(() => decrypt(`v1:${p.kid}:${flip(p.iv)}:${p.tag}:${p.body}`, CTX)).toThrow(CryptoError)
    })
    it('tampered tag throws', () => {
      const p = fresh()
      expect(() => decrypt(`v1:${p.kid}:${p.iv}:${flip(p.tag)}:${p.body}`, CTX)).toThrow(CryptoError)
    })
    it('tampered ct throws', () => {
      const p = fresh()
      expect(() => decrypt(`v1:${p.kid}:${p.iv}:${p.tag}:${flip(p.body)}`, CTX)).toThrow(CryptoError)
    })
    it('tampered kid throws (relabelled as k1, which is present)', () => {
      const p = fresh()
      expect(() => decrypt(`v1:k1:${p.iv}:${p.tag}:${p.body}`, CTX)).toThrow(CryptoError)
    })
    it('malformed kid throws', () => {
      const p = fresh()
      expect(() => decrypt(`v1:key2:${p.iv}:${p.tag}:${p.body}`, CTX)).toThrow(CryptoError)
    })
    it('unknown version prefix throws', () => {
      const p = fresh()
      expect(() => decrypt(`v2:${p.kid}:${p.iv}:${p.tag}:${p.body}`, CTX)).toThrow(CryptoError)
    })
  })

  // Buffer.from(x, 'hex') silently stops at the first bad character, so a
  // lenient parser would decrypt a value with junk appended. Strict regexes
  // reject it before any crypto runs.
  it('invalid hex appended to the ct throws — legacy and v1', () => {
    setKeyEnv({ key: K1 })
    const legacy = encrypt('secret', CTX)
    expect(() => decrypt(`${legacy}zz`, CTX)).toThrow(CryptoError)
    expect(() => decrypt(`${legacy}0`, CTX)).toThrow(CryptoError) // odd length
    setKeyEnv({ key: K1, writeKid: 'k1' })
    const v1 = encrypt('secret', CTX)
    expect(() => decrypt(`${v1}zz`, CTX)).toThrow(CryptoError)
    expect(() => decrypt(`${v1}g0`, CTX)).toThrow(CryptoError)
  })

  it('uppercase or non-hex iv/tag are rejected', () => {
    setKeyEnv({ key: K1 })
    const [iv, tag, body] = encrypt('secret', CTX).split(':')
    expect(() => decrypt(`${iv.toUpperCase()}:${tag}:${body}`, CTX)).toThrow(CryptoError)
    expect(() => decrypt(`${iv}:${tag.slice(0, -1)}z:${body}`, CTX)).toThrow(CryptoError)
  })

  // Without authTagLength, Node accepts a 4-byte prefix of a genuine tag
  // (DEP0182) — a forgery needs ~2^32 tries instead of 2^128. A genuine,
  // truncated tag must be refused.
  it('a truncated tag throws — legacy', () => {
    setKeyEnv({ key: K1 })
    const [iv, tag, body] = encrypt('secret', CTX).split(':')
    expect(() => decrypt(`${iv}:${tag.slice(0, 8)}:${body}`, CTX)).toThrow(CryptoError)
    expect(() => decrypt(`${iv}:${tag.slice(0, 24)}:${body}`, CTX)).toThrow(CryptoError)
  })

  it('a truncated tag throws — v1', () => {
    setKeyEnv({ key: K1, writeKid: 'k1' })
    const p = v1Parts(encrypt('secret', CTX))
    expect(() => decrypt(`v1:k1:${p.iv}:${p.tag.slice(0, 8)}:${p.body}`, CTX)).toThrow(CryptoError)
  })

  it('wrong part counts throw', () => {
    setKeyEnv({ key: K1 })
    expect(() => decrypt('', CTX)).toThrow(CryptoError)
    expect(() => decrypt('abc', CTX)).toThrow(CryptoError)
    expect(() => decrypt('a:b', CTX)).toThrow(CryptoError)
    expect(() => decrypt('a:b:c:d', CTX)).toThrow(CryptoError)
    expect(() => decrypt('v1:k1:a:b:c:d', CTX)).toThrow(CryptoError)
  })
})

// ── AAD binding ────────────────────────────────────────────────────────────────

describe('crypto — AAD binds a v1 value to its row, column and table', () => {
  function sealed() {
    setKeyEnv({ key: K1, writeKid: 'k1' })
    return encrypt('A123456789', aadFor('ChildDetails', 'id_number_encrypted', PK))
  }

  it('decrypts under the exact (table, column, pk) it was written for', () => {
    expect(decrypt(sealed(), aadFor('ChildDetails', 'id_number_encrypted', PK))).toBe('A123456789')
  })

  it('moved to another row (different pk) throws', () => {
    expect(() => decrypt(sealed(), aadFor('ChildDetails', 'id_number_encrypted', OTHER_PK))).toThrow(CryptoError)
  })

  it('moved to another column of the same row throws', () => {
    expect(() => decrypt(sealed(), aadFor('ChildDetails', 'insurance_id_encrypted', PK))).toThrow(CryptoError)
  })

  it('moved to another table with the same pk throws', () => {
    expect(() => decrypt(sealed(), aadFor('Assets', 'name_encrypted', PK))).toThrow(CryptoError)
    expect(() => decrypt(sealed(), aadFor('CarDetails', 'plate_encrypted', PK))).toThrow(CryptoError)
  })

  it('pk comparison is exact (an uppercase id is a different pk)', () => {
    expect(() => decrypt(sealed(), aadFor('ChildDetails', 'id_number_encrypted', PK.toUpperCase()))).toThrow(CryptoError)
  })

  // A7: rows legitimately change group (actions/membership.ts on leave). The
  // AAD has no group component, so the same pk still decrypts afterwards.
  it('a row whose groupId changed but whose pk did not still decrypts', () => {
    const ct = sealed()
    const ctxAfterMove = aadFor('ChildDetails', 'id_number_encrypted', PK)
    expect(ctxAfterMove.aad).not.toMatch(/grp|group/i)
    expect(decrypt(ct, ctxAfterMove)).toBe('A123456789')
  })

  it('a legacy value is not bound (known S1 limitation, removed in S3b)', () => {
    setKeyEnv({ key: K1 })
    const ct = encrypt('A123456789', aadFor('ChildDetails', 'id_number_encrypted', PK))
    expect(decrypt(ct, aadFor('Assets', 'name_encrypted', OTHER_PK))).toBe('A123456789')
  })

  it('aadFor rejects unknown columns and bad pks', () => {
    // @ts-expect-error — not an encrypted column
    expect(() => aadFor('CarDetails', 'name_encrypted', PK)).toThrow(CryptoError)
    // @ts-expect-error — not an encrypted table
    expect(() => aadFor('Users', 'name_encrypted', PK)).toThrow(CryptoError)
    expect(() => aadFor('Assets', 'name_encrypted', '')).toThrow(CryptoError)
    expect(() => aadFor('Assets', 'name_encrypted', 'a|b')).toThrow(CryptoError)
  })

  it('encrypt and decrypt refuse a missing or hand-built context, even on the legacy path', () => {
    setKeyEnv({ key: K1 })
    const ct = encrypt('x', CTX)
    const forged = { aad: 'anything' } as unknown as AadContext
    expect(() => encrypt('x', undefined as unknown as AadContext)).toThrow(CryptoError)
    expect(() => encrypt('x', forged)).toThrow(CryptoError)
    expect(() => decrypt(ct, undefined as unknown as AadContext)).toThrow(CryptoError)
    expect(() => decrypt(ct, forged)).toThrow(CryptoError)
  })

  it('ENCRYPTED_COLUMNS lists exactly the six encrypted columns', () => {
    const flat = Object.entries(ENCRYPTED_COLUMNS).flatMap(([t, cols]) => cols.map((c) => `${t}.${c}`))
    expect(flat.sort()).toEqual([
      'Assets.name_encrypted',
      'CarDetails.plate_encrypted',
      'ChildDetails.id_number_encrypted',
      'ChildDetails.insurance_id_encrypted',
      'HouseDetails.address_encrypted',
      'InvoiceCredentials.verification_code_encrypted',
    ])
  })
})

// ── keyring parsing ────────────────────────────────────────────────────────────

describe('crypto — keyring env contract', () => {
  it('works with only ENCRYPTION_KEY set (today\'s deployments)', () => {
    setKeyEnv({ key: K1 })
    expect(decrypt(encrypt('x', CTX), CTX)).toBe('x')
  })

  it('a duplicate kid in ENCRYPTION_KEYS throws', () => {
    setKeyEnv({ key: K1, keys: `k2:${K2},k2:${K3}` })
    expect(() => encrypt('x', CTX)).toThrow(CryptoError)
    expect(() => decrypt(legacyUnder(K1, 'x'), CTX)).toThrow(CryptoError)
  })

  it('k1 inside ENCRYPTION_KEYS throws (k1 is ENCRYPTION_KEY)', () => {
    setKeyEnv({ key: K1, keys: `k1:${K2}` })
    expect(() => encrypt('x', CTX)).toThrow(CryptoError)
    setKeyEnv({ keys: `k1:${K2}` })
    expect(() => encrypt('x', CTX)).toThrow(CryptoError)
  })

  it('bad hex in ENCRYPTION_KEY throws', () => {
    setKeyEnv({ key: 'zz'.repeat(32) })
    expect(() => encrypt('x', CTX)).toThrow(CryptoError)
    setKeyEnv({ key: K1.slice(2) })
    expect(() => encrypt('x', CTX)).toThrow(CryptoError)
  })

  it('bad hex, a bad kid or a malformed entry in ENCRYPTION_KEYS throws', () => {
    for (const keys of [`k2:${'zz'.repeat(32)}`, `k2:${K2.slice(2)}`, `key2:${K2}`, `K2:${K2}`, K2, `k2:${K2},`, `k1234567:${K2}`]) {
      setKeyEnv({ key: K1, keys })
      expect(() => encrypt('x', CTX), keys.replace(/[0-9a-f]{16,}/g, '<hex>')).toThrow(CryptoError)
    }
  })

  it('accepts whitespace around entries', () => {
    setKeyEnv({ key: K1, keys: ` k2:${K2} , k3:${K3} `, writeKid: 'k3' })
    expect(decrypt(encrypt('x', CTX), CTX)).toBe('x')
  })

  it('no key configured at all throws', () => {
    setKeyEnv({})
    expect(() => encrypt('x', CTX)).toThrow(CryptoError)
  })
})

// ── error hygiene ──────────────────────────────────────────────────────────────

describe('crypto — error messages carry no secrets', () => {
  it('never include key material, ciphertext, plaintext or AAD', () => {
    const PLAINTEXT = 'Z987654321'
    const messages: string[] = []
    const capture = (fn: () => unknown) => {
      try { fn() } catch (e) { messages.push((e as Error).message) }
    }

    setKeyEnv({ key: K1, keys: `k2:${K2}`, writeKid: 'k2' })
    const ct = encrypt(PLAINTEXT, CTX)
    capture(() => decrypt(ct, aadFor('ChildDetails', 'id_number_encrypted', OTHER_PK)))
    capture(() => decrypt(`${ct}zz`, CTX))
    setKeyEnv({ key: K1, keys: `k2:${K2_OTHER}` })
    capture(() => decrypt(ct, CTX))
    setKeyEnv({ key: K1, keys: `k2:${K2},k2:${K3}` })
    capture(() => encrypt(PLAINTEXT, CTX))
    setKeyEnv({ key: `${K1.slice(0, 63)}z` })
    capture(() => encrypt(PLAINTEXT, CTX))

    expect(messages).toHaveLength(5)
    for (const m of messages) {
      for (const secret of [K1, K2, K2_OTHER, K3, K1.slice(0, 63), PLAINTEXT, ct, v1Parts(ct).body, v1Parts(ct).tag, PK, OTHER_PK, CTX.aad]) {
        expect(m).not.toContain(secret)
      }
    }
  })
})
