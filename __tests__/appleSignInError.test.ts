import { describe, it, expect } from 'vitest'
import { isUserCancelled } from '@/lib/auth/appleSignInError'

describe('isUserCancelled', () => {
  it('treats ASAuthorizationError 1001 as a user cancellation', () => {
    // Verbatim shape of what the plugin forwards from localizedDescription.
    expect(isUserCancelled(new Error(
      'The operation couldn’t be completed. (com.apple.AuthenticationServices.AuthorizationError error 1001.)',
    ))).toBe(true)
  })

  it('still recognises 1001 when the leading sentence is localized', () => {
    // Only the parenthesised domain/code stays ASCII on a non-English device.
    expect(isUserCancelled(new Error(
      '操作を完了できませんでした。(com.apple.AuthenticationServices.AuthorizationError error 1001.)',
    ))).toBe(true)
  })

  it('recognises a spelled-out cancellation, either spelling', () => {
    expect(isUserCancelled(new Error('The user canceled the request.'))).toBe(true)
    expect(isUserCancelled(new Error('Request cancelled by user'))).toBe(true)
  })

  it('reports a failure-to-present as NOT cancelled, so the caller falls back', () => {
    // This is the entitlement bug: without com.apple.developer.applesignin the
    // controller refuses, and the button must not silently do nothing.
    expect(isUserCancelled(new Error(
      'The operation couldn’t be completed. (com.apple.AuthenticationServices.AuthorizationError error 1000.)',
    ))).toBe(false)
  })

  it('reports unknown and empty errors as NOT cancelled', () => {
    // Safe direction: an unwanted browser hand-off beats swallowing a real fault.
    expect(isUserCancelled(new Error('plugin is not implemented on ios'))).toBe(false)
    expect(isUserCancelled(undefined)).toBe(false)
    expect(isUserCancelled(null)).toBe(false)
    expect(isUserCancelled('')).toBe(false)
  })

  it('does not mistake an unrelated number containing 1001 for a cancellation', () => {
    // \b guards prevent 21001 / 10010 from matching.
    expect(isUserCancelled(new Error('error 21001'))).toBe(false)
    expect(isUserCancelled(new Error('error 10010'))).toBe(false)
  })
})
