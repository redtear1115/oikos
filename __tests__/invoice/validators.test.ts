import { describe, it, expect } from 'vitest'
import {
  validateBarcodeInput,
  validateInvoiceCarrierInput,
} from '@/lib/validators'

describe('validateBarcodeInput', () => {
  it('accepts canonical /AAA1234 form', () => {
    expect(validateBarcodeInput('/AB12CD3')).toBe('/AB12CD3')
  })

  it('uppercases lowercase chars', () => {
    expect(validateBarcodeInput('/ab12cd3')).toBe('/AB12CD3')
  })

  it('trims whitespace', () => {
    expect(validateBarcodeInput('  /AB12CD3  ')).toBe('/AB12CD3')
  })

  it('accepts the +/-/. punctuation that MoF allows', () => {
    expect(validateBarcodeInput('/AB.12+3')).toBe('/AB.12+3')
    expect(validateBarcodeInput('/A1B2-CD')).toBe('/A1B2-CD')
  })

  it('rejects empty string', () => {
    expect(() => validateBarcodeInput('')).toThrow(/不能為空/)
  })

  it('rejects barcode missing leading slash', () => {
    expect(() => validateBarcodeInput('AB12CD34')).toThrow(/條碼格式/)
  })

  it('rejects too-short barcode', () => {
    expect(() => validateBarcodeInput('/SHORT')).toThrow(/條碼格式/)
  })

  it('rejects too-long barcode', () => {
    expect(() => validateBarcodeInput('/AB12CD3X')).toThrow(/條碼格式/)
  })

  it('rejects characters outside the MoF whitelist', () => {
    expect(() => validateBarcodeInput('/AB12CD@')).toThrow(/條碼格式/)
  })
})

describe('validateInvoiceCarrierInput', () => {
  it('returns normalized payload for valid input', () => {
    const out = validateInvoiceCarrierInput({
      barcode: '/ab12cd3',
      verificationCode: 'a1b2c3d4',
      nickname: '我的',
    })
    expect(out).toEqual({
      barcode: '/AB12CD3',
      verificationCode: 'A1B2C3D4',
      nickname: '我的',
    })
  })

  it('treats empty / whitespace nickname as null', () => {
    const out = validateInvoiceCarrierInput({
      barcode: '/AB12CD3',
      verificationCode: 'A1B2C3D4',
      nickname: '   ',
    })
    expect(out.nickname).toBeNull()
  })

  it('accepts undefined nickname', () => {
    const out = validateInvoiceCarrierInput({
      barcode: '/AB12CD3',
      verificationCode: 'A1B2C3D4',
    })
    expect(out.nickname).toBeNull()
  })

  it('rejects nickname over 16 chars', () => {
    expect(() => validateInvoiceCarrierInput({
      barcode: '/AB12CD3',
      verificationCode: 'A1B2C3D4',
      nickname: 'x'.repeat(17),
    })).toThrow(/暱稱最長/)
  })

  it('rejects verification code with non-alphanumeric chars', () => {
    expect(() => validateInvoiceCarrierInput({
      barcode: '/AB12CD3',
      verificationCode: 'A1B2-3D4',  // dash
    })).toThrow(/驗證碼/)
  })

  it('rejects verification code with wrong length', () => {
    expect(() => validateInvoiceCarrierInput({
      barcode: '/AB12CD3',
      verificationCode: 'A1B2C3D',  // 7 chars
    })).toThrow(/驗證碼/)
  })

  it('rejects empty verification code', () => {
    expect(() => validateInvoiceCarrierInput({
      barcode: '/AB12CD3',
      verificationCode: '',
    })).toThrow(/不能為空/)
  })
})
