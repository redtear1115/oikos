import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Guards `ios/App/App/App.entitlements` against silently losing a capability.
 *
 * This exists because it already happened: the file was created with Sign in
 * with Apple, then a later rewrite that added push notifications dropped it
 * (`763ecf9`). The provisioning profile still granted the entitlement, so
 * signing and upload both succeeded — but the shipped binary never requested
 * it, `ASAuthorizationController` refused to present, and the native Apple
 * button did nothing on every TestFlight build for three months.
 *
 * Nothing else catches this: the build passes, the archive passes, App Store
 * validation passes. Only a device tap reveals it. Hence a test.
 */
const ENTITLEMENTS = resolve(__dirname, '../ios/App/App/App.entitlements')

function entitlements(): string {
  return readFileSync(ENTITLEMENTS, 'utf8')
}

/** Value node(s) following `<key>name</key>`, up to the next `<key>` or `</dict>`. */
function valueAfterKey(xml: string, key: string): string | null {
  const at = xml.indexOf(`<key>${key}</key>`)
  if (at === -1) return null
  const rest = xml.slice(at + `<key>${key}</key>`.length)
  const end = rest.search(/<key>|<\/dict>/)
  return end === -1 ? rest : rest.slice(0, end)
}

describe('iOS App.entitlements', () => {
  it('requests Sign in with Apple', () => {
    // Guideline 4.8 requires it alongside Google, and our App Review reply
    // tells the reviewer to sign in this way. Without the entitlement the
    // native sheet never appears.
    const value = valueAfterKey(entitlements(), 'com.apple.developer.applesignin')
    expect(value, 'com.apple.developer.applesignin key is missing').not.toBeNull()
    expect(value).toContain('<string>Default</string>')
  })

  it('requests push notifications', () => {
    // The 4.2 "native features beyond the web" argument rests on APNs.
    const value = valueAfterKey(entitlements(), 'aps-environment')
    expect(value, 'aps-environment key is missing').not.toBeNull()
    // Xcode overrides this with `production` when exporting for distribution,
    // so `development` in the checked-in file is correct and expected.
    expect(value).toMatch(/<string>(development|production)<\/string>/)
  })

  it('declares every capability the App ID enables, so none can be dropped unnoticed', () => {
    // Lock the exact key set. Adding a capability in the portal without adding
    // it here produces a binary that cannot use it; removing one here while the
    // app still calls the API produces a silent no-op. Either way this fails.
    const keys = [...entitlements().matchAll(/<key>([^<]+)<\/key>/g)].map((m) => m[1]).sort()
    expect(keys).toEqual(['aps-environment', 'com.apple.developer.applesignin'])
  })
})
