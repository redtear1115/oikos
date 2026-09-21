import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

/**
 * Field-level encryption at rest for a handful of sensitive columns
 * (#826 / #837 / #1287). Server-held key, AES-256-GCM. This is NOT end-to-end
 * encryption — see the #1191 retraction note in CLAUDE.md before describing
 * it anywhere user-facing.
 *
 * ── Formats ─────────────────────────────────────────────────────────────────
 *   legacy : `<iv24hex>:<tag32hex>:<cthex>`          no AAD, always key `k1`
 *   v1     : `v1:<kid>:<iv24hex>:<tag32hex>:<cthex>` AAD mandatory (see aadFor)
 *
 * ── Keyring (env contract, #1287 D2) ────────────────────────────────────────
 *   ENCRYPTION_KEY        64 hex; implicitly keyring entry `k1` (optional once
 *                         other kids exist, but legacy values need it)
 *   ENCRYPTION_KEYS       optional `k2:<64hex>[,k3:<64hex>]`; `k1` is reserved
 *                         for ENCRYPTION_KEY and may not appear here
 *   ENCRYPTION_WRITE_KID  optional; unset → writes stay legacy (S1/S2),
 *                         set → writes v1 under that kid
 *
 * Rules: a kid is never reused and its bytes are never edited in place. A
 * rotation always adds a new kid. Editing ENCRYPTION_KEY in place does not
 * throw at startup — it fails closed later, on every reveal of every row.
 *
 * ── Failure behaviour ───────────────────────────────────────────────────────
 * Parsing is strict and fails closed: a value is decrypted with exactly the
 * key its format names (legacy → k1, v1 → its kid), never "try the next key".
 * Every failure throws CryptoError. Messages never contain ciphertext,
 * plaintext, key material or AAD values; to the client they surface as the
 * generic unexpected-error digest (lib/action-errors.ts).
 */

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16
const LEGACY_KID = 'k1'
const V1_PREFIX = 'v1'

const KEY_HEX_RE = /^[0-9a-fA-F]{64}$/
const KID_RE = /^k[0-9]{1,6}$/
const IV_RE = /^[0-9a-f]{24}$/
const TAG_RE = /^[0-9a-f]{32}$/
const CT_RE = /^(?:[0-9a-f]{2})*$/

export class CryptoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CryptoError'
  }
}

// ── AAD ─────────────────────────────────────────────────────────────────────

/**
 * Every encrypted column, keyed by its Postgres table name. The AAD binds a v1
 * ciphertext to exactly one (table, column, primary key). groupId is
 * deliberately NOT part of it: rows legitimately move between groups
 * (actions/membership.ts — Assets.group_id and InvoiceCredentials on leave).
 *
 * Primary keys: Assets.id, CarDetails/HouseDetails/ChildDetails.asset_id,
 * InvoiceCredentials.id.
 */
export const ENCRYPTED_COLUMNS = {
  Assets: ['name_encrypted'],
  CarDetails: ['plate_encrypted'],
  HouseDetails: ['address_encrypted'],
  ChildDetails: ['id_number_encrypted', 'insurance_id_encrypted'],
  InvoiceCredentials: ['verification_code_encrypted'],
} as const

export type EncryptedTable = keyof typeof ENCRYPTED_COLUMNS
export type EncryptedColumn<T extends EncryptedTable> = (typeof ENCRYPTED_COLUMNS)[T][number]

declare const aadBrand: unique symbol
/** Opaque context built only by `aadFor`. */
export type AadContext = { readonly aad: string; readonly [aadBrand]: true }

const AAD_RE = /^v1\|[A-Za-z]+\.[a-z_]+\|[^|]+$/

/**
 * Build the AAD context for one encrypted cell: `v1|<Table>.<column>|<pk>`.
 * Shared by the app's write sites, its reveal actions and (later, #1287 S3)
 * the re-encrypt script, so all of them bind the same bytes.
 *
 * The pk must be the value stored in the row (write sites pass the id they
 * write; reveal actions pass the id they looked the row up by).
 */
export function aadFor<T extends EncryptedTable>(
  table: T,
  column: EncryptedColumn<T>,
  pk: string,
): AadContext {
  const columns = ENCRYPTED_COLUMNS[table] as readonly string[] | undefined
  if (!columns || !columns.includes(column)) {
    throw new CryptoError('aadFor: unknown encrypted column')
  }
  if (typeof pk !== 'string' || pk.length === 0 || pk.includes('|')) {
    throw new CryptoError('aadFor: invalid primary key')
  }
  return Object.freeze({ aad: `v1|${table}.${column}|${pk}` }) as AadContext
}

function aadBytes(ctx: AadContext): Buffer {
  // Runtime check too: a call site that forgot the context (or hand-built one)
  // must fail even on the legacy path, where the AAD is not used.
  if (!ctx || typeof ctx.aad !== 'string' || !AAD_RE.test(ctx.aad)) {
    throw new CryptoError('Missing or invalid encryption context')
  }
  return Buffer.from(ctx.aad, 'utf8')
}

// ── Keyring ─────────────────────────────────────────────────────────────────

interface Keyring {
  keys: Map<string, Buffer>
  /** null → write the legacy format under k1. */
  writeKid: string | null
}

function envValue(name: string): string | undefined {
  const v = process.env[name]
  return v === undefined || v === '' ? undefined : v
}

/**
 * Parsed on every call (like the old getKey) so an env change is picked up
 * without a module reload. The parse is a few regexes on short strings.
 */
function loadKeyring(): Keyring {
  const keys = new Map<string, Buffer>()

  const legacy = envValue('ENCRYPTION_KEY')
  if (legacy !== undefined) {
    if (!KEY_HEX_RE.test(legacy)) throw new CryptoError('ENCRYPTION_KEY must be 64 hex chars (32 bytes)')
    keys.set(LEGACY_KID, Buffer.from(legacy, 'hex'))
  }

  const extra = envValue('ENCRYPTION_KEYS')
  if (extra !== undefined) {
    const entries = extra.split(',')
    entries.forEach((raw, i) => {
      const entry = raw.trim()
      const sep = entry.indexOf(':')
      const kid = sep === -1 ? '' : entry.slice(0, sep)
      const hex = sep === -1 ? '' : entry.slice(sep + 1)
      if (!KID_RE.test(kid) || !KEY_HEX_RE.test(hex)) {
        throw new CryptoError(`ENCRYPTION_KEYS entry ${i + 1} is malformed (expected kN:<64 hex>)`)
      }
      if (kid === LEGACY_KID) {
        throw new CryptoError('ENCRYPTION_KEYS must not contain k1 (k1 is ENCRYPTION_KEY)')
      }
      if (keys.has(kid)) {
        throw new CryptoError(`ENCRYPTION_KEYS entry ${i + 1} repeats a key id`)
      }
      keys.set(kid, Buffer.from(hex, 'hex'))
    })
  }

  if (keys.size === 0) throw new CryptoError('No encryption key configured')

  const writeKid = envValue('ENCRYPTION_WRITE_KID') ?? null
  if (writeKid !== null) {
    if (!KID_RE.test(writeKid)) throw new CryptoError('ENCRYPTION_WRITE_KID is malformed')
    if (!keys.has(writeKid)) throw new CryptoError('ENCRYPTION_WRITE_KID is not in the keyring')
  }

  return { keys, writeKid }
}

// ── encrypt / decrypt ───────────────────────────────────────────────────────

function seal(key: Buffer, plaintext: string, aad: Buffer | null): [string, string, string] {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES })
  if (aad) cipher.setAAD(aad)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), ct.toString('hex')]
}

function open(key: Buffer, ivHex: string, tagHex: string, ctHex: string, aad: Buffer | null): string {
  if (!IV_RE.test(ivHex) || !TAG_RE.test(tagHex) || !CT_RE.test(ctHex)) {
    throw new CryptoError('Invalid ciphertext format')
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'), { authTagLength: TAG_BYTES })
    if (aad) decipher.setAAD(aad)
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    return decipher.update(Buffer.from(ctHex, 'hex')).toString('utf8') + decipher.final('utf8')
  } catch {
    // Node's message carries nothing sensitive, but normalise it so callers
    // see one error type; wrong key, wrong AAD and tampering all land here.
    throw new CryptoError('Unable to decrypt value')
  }
}

/**
 * Encrypt one cell. `ctx` is required at every call site; with
 * ENCRYPTION_WRITE_KID unset the output is still the legacy format (the
 * context is validated but not bound), so deploying the keyring changes no
 * stored bytes until the write kid is set (#1287 S2).
 */
export function encrypt(plaintext: string, ctx: AadContext): string {
  const aad = aadBytes(ctx)
  const { keys, writeKid } = loadKeyring()

  if (writeKid === null) {
    const key = keys.get(LEGACY_KID)
    if (!key) throw new CryptoError('Legacy writes need ENCRYPTION_KEY (set ENCRYPTION_WRITE_KID instead)')
    return seal(key, plaintext, null).join(':')
  }

  const key = keys.get(writeKid)!
  return [V1_PREFIX, writeKid, ...seal(key, plaintext, aad)].join(':')
}

/**
 * Decrypt one cell. Accepts legacy (k1, no AAD) and v1 (named kid, AAD from
 * `ctx`). Throws CryptoError on anything else, on an unknown kid, and on any
 * authentication failure — including a v1 value moved to another row, column
 * or table.
 */
export function decrypt(ciphertext: string, ctx: AadContext): string {
  const aad = aadBytes(ctx)
  if (typeof ciphertext !== 'string') throw new CryptoError('Invalid ciphertext format')
  const parts = ciphertext.split(':')
  const { keys } = loadKeyring()

  if (parts.length === 3) {
    const key = keys.get(LEGACY_KID)
    if (!key) throw new CryptoError('Unknown key id')
    const [ivHex, tagHex, ctHex] = parts
    return open(key, ivHex, tagHex, ctHex, null)
  }

  if (parts.length === 5 && parts[0] === V1_PREFIX) {
    const [, kid, ivHex, tagHex, ctHex] = parts
    if (!KID_RE.test(kid)) throw new CryptoError('Invalid ciphertext format')
    const key = keys.get(kid)
    if (!key) throw new CryptoError('Unknown key id')
    return open(key, ivHex, tagHex, ctHex, aad)
  }

  throw new CryptoError('Invalid ciphertext format')
}
