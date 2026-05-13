import { describe, it, expect } from 'vitest'
import {
  ASSET_TEMPLATE_KEYS,
  TEMPLATES,
  getTemplate,
  isAssetTemplateKey,
  validateTemplateFields,
} from '@/lib/assetTemplates'

describe('assetTemplates registry', () => {
  it('v1 ships exactly one template (general)', () => {
    expect(ASSET_TEMPLATE_KEYS).toEqual(['general'])
  })

  it('general template declares no fields', () => {
    expect(TEMPLATES.general.fields).toEqual([])
  })

  it('isAssetTemplateKey rejects unknown values', () => {
    expect(isAssetTemplateKey('general')).toBe(true)
    expect(isAssetTemplateKey('vehicle')).toBe(false)
    expect(isAssetTemplateKey(undefined)).toBe(false)
    expect(isAssetTemplateKey(123)).toBe(false)
  })

  it('getTemplate returns the registered template', () => {
    expect(getTemplate('general').key).toBe('general')
  })
})

describe('validateTemplateFields', () => {
  it('general template drops any input keys (no declared fields)', () => {
    const out = validateTemplateFields('general', { brand: 'should be dropped', anything: 1 })
    expect(out).toEqual({})
  })

  it('null / undefined raw input returns an empty object for general', () => {
    expect(validateTemplateFields('general', null)).toEqual({})
    expect(validateTemplateFields('general', undefined)).toEqual({})
  })

  // Note: the validator implements text / number / date type branches that
  // future templates will use. Those branches are intentionally not exercised
  // here because v1's only template (`general`) declares no fields. Add
  // branch coverage when the next template lands. The validator itself lives
  // in lib/assetTemplates.ts and is structurally simple.
})
