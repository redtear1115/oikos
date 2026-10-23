/**
 * #968 S4c — Android FCM registration behind a fail-closed shell-version gate.
 *
 * Android shells before 1.9.0 (Play 1.7.3, versionCode 105015) bundle the push
 * plugin but no `google-services.json`, and `PushNotifications.register()`
 * crashes them. `lib/pushNotifications.ts` is a native contract surface: it
 * reaches every installed shell the moment it deploys. So on Android the
 * version gate must run BEFORE `requestPermissions()`, and every way of not
 * knowing the version (import failure, getInfo rejection, '', 'abc') must
 * mean "do nothing".
 *
 * Failure looks like (if the gate regresses or moves after requestPermissions):
 * old Android shells show a notification-permission prompt and/or crash on
 * every dashboard open, with nothing in Sentry (the process dies first). If
 * the gate is too strict: new shells silently never register.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  platform: 'android' as string,
  native: true,
  getInfo: vi.fn(async (): Promise<unknown> => ({ version: '1.9.0', build: '1' })),
  appImportFails: false,
  requestPermissions: vi.fn(async () => ({ receive: 'granted' })),
  register: vi.fn(async () => {}),
  listeners: {} as Record<string, (e: unknown) => unknown>,
  upsert: vi.fn(async (_row: unknown, _opts: unknown) => ({ error: null })),
  storePushToken: vi.fn(),
  reportClientError: vi.fn(),
}))

function mockModules() {
  vi.doMock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => h.native, getPlatform: () => h.platform },
  }))
  vi.doMock('@capacitor/push-notifications', () => ({
    PushNotifications: {
      requestPermissions: h.requestPermissions,
      register: h.register,
      addListener: (name: string, cb: (e: unknown) => unknown) => { h.listeners[name] = cb },
    },
  }))
  vi.doMock('@capacitor/app', () => {
    if (h.appImportFails) throw new Error('Loading chunk failed')
    return { App: { getInfo: h.getInfo } }
  })
  vi.doMock('@/lib/supabase/client', () => ({
    createClient: () => ({ from: () => ({ upsert: h.upsert }) }),
  }))
  vi.doMock('@/lib/pushTokenStorage', () => ({ storePushToken: h.storePushToken }))
  vi.doMock('@/lib/observability/reportClientError', () => ({ reportClientError: h.reportClientError }))
}

async function load() {
  vi.resetModules()
  mockModules()
  return import('@/lib/pushNotifications')
}

beforeEach(() => {
  vi.clearAllMocks()
  h.platform = 'android'
  h.native = true
  h.appImportFails = false
  h.listeners = {}
  h.getInfo.mockReset()
  h.getInfo.mockImplementation(async () => ({ version: '1.9.0', build: '1' }))
  h.requestPermissions.mockImplementation(async () => ({ receive: 'granted' }))
})

function expectPushPluginUntouched() {
  expect(h.requestPermissions).not.toHaveBeenCalled()
  expect(h.register).not.toHaveBeenCalled()
  expect(Object.keys(h.listeners)).toEqual([])
  expect(h.upsert).not.toHaveBeenCalled()
}

describe('Android: the gate decides before requestPermissions()', () => {
  it.each([
    ['1.7.3 (Play 105015, no Firebase)', '1.7.3', 'below-min'],
    ['1.8.9', '1.8.9', 'below-min'],
    ['empty string', '', 'unparseable'],
    ['abc', 'abc', 'unparseable'],
    ['1.9.x', '1.9.x', 'unparseable'],
  ])('version %s → denied, push plugin never touched', async (_label, version, reason) => {
    h.getInfo.mockImplementation(async () => ({ version, build: '1' }))
    const { registerPushToken, checkAndroidFcmGate } = await load()

    expect(await checkAndroidFcmGate()).toMatchObject({ allowed: false, reason })
    expect(await registerPushToken('u', 'g')).toBe('gate-denied')
    expectPushPluginUntouched()
    expect(h.reportClientError).not.toHaveBeenCalled()
  })

  it.each([
    ['getInfo() resolves without a version', async () => ({})],
    ['getInfo() resolves to null', async () => null],
    ['getInfo() resolves a non-string version', async () => ({ version: 190 })],
  ])('%s → denied', async (_label, impl) => {
    h.getInfo.mockImplementation(impl as () => Promise<unknown>)
    const { registerPushToken } = await load()
    expect(await registerPushToken('u', 'g')).toBe('gate-denied')
    expectPushPluginUntouched()
  })

  it('getInfo() rejects → denied, nothing reported, never throws', async () => {
    h.getInfo.mockImplementation(async () => { throw new Error('plugin not implemented') })
    const { registerPushToken, checkAndroidFcmGate } = await load()

    expect(await checkAndroidFcmGate()).toEqual({ allowed: false, reason: 'get-info-failed' })
    await expect(registerPushToken('u', 'g')).resolves.toBe('gate-denied')
    expectPushPluginUntouched()
    expect(h.reportClientError).not.toHaveBeenCalled()
  })

  it('@capacitor/app fails to import → denied, nothing reported, never throws', async () => {
    h.appImportFails = true
    const { registerPushToken, checkAndroidFcmGate } = await load()

    expect(await checkAndroidFcmGate()).toEqual({ allowed: false, reason: 'import-failed' })
    await expect(registerPushToken('u', 'g')).resolves.toBe('gate-denied')
    expect(h.getInfo).not.toHaveBeenCalled()
    expectPushPluginUntouched()
    expect(h.reportClientError).not.toHaveBeenCalled()
  })

  it.each([
    ['1.9.0', '1.9.0'],
    ['1.10.0 (numeric, not lexical)', '1.10.0'],
    ['2.0.0', '2.0.0'],
    ['1.9.0-beta.1 (pre-release of 1.9.0)', '1.9.0-beta.1'],
  ])('version %s → allowed, registers and upserts with platform fcm', async (_label, version) => {
    h.getInfo.mockImplementation(async () => ({ version, build: '1' }))
    const order: string[] = []
    h.getInfo.mockImplementationOnce(async () => { order.push('getInfo'); return { version, build: '1' } })
    h.requestPermissions.mockImplementationOnce(async () => { order.push('requestPermissions'); return { receive: 'granted' } })
    h.register.mockImplementationOnce(async () => { order.push('register') })
    const { registerPushToken } = await load()

    expect(await registerPushToken('user-1', 'group-1')).toBe('registering')
    expect(order).toEqual(['getInfo', 'requestPermissions', 'register'])

    await h.listeners.registration({ value: 'fcm-token-abc' })
    expect(h.storePushToken).toHaveBeenCalledWith('fcm-token-abc')
    expect(h.upsert).toHaveBeenCalledWith(
      { user_id: 'user-1', group_id: 'group-1', platform: 'fcm', token: 'fcm-token-abc' },
      { onConflict: 'user_id,platform,token' },
    )
  })

  it('allowed but permission refused → no register()', async () => {
    h.requestPermissions.mockImplementation(async () => ({ receive: 'denied' }))
    const { registerPushToken } = await load()
    expect(await registerPushToken('u', 'g')).toBe('permission-denied')
    expect(h.register).not.toHaveBeenCalled()
  })
})

describe('iOS: unchanged, and never reads the shell version', () => {
  it('registers with platform apns without importing @capacitor/app', async () => {
    h.platform = 'ios'
    h.appImportFails = true // would deny if the iOS path ever reached the gate
    const { registerPushToken } = await load()

    expect(await registerPushToken('user-1', 'group-1')).toBe('registering')
    expect(h.getInfo).not.toHaveBeenCalled()
    expect(h.requestPermissions).toHaveBeenCalledOnce()
    expect(h.register).toHaveBeenCalledOnce()

    await h.listeners.registration({ value: 'apns-token' })
    expect(h.upsert).toHaveBeenCalledWith(
      { user_id: 'user-1', group_id: 'group-1', platform: 'apns', token: 'apns-token' },
      { onConflict: 'user_id,platform,token' },
    )
  })

  it('the iOS branch source contains no @capacitor/app import', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(`${process.cwd()}/lib/pushNotifications.ts`, 'utf8')
    // Only the gate function may load it, and only dynamically.
    expect(src).not.toMatch(/^import[^\n]*['"]@capacitor\/app['"]/m)
    const registerBody = src.slice(src.indexOf('export async function registerPushToken'))
    expect(registerBody).not.toContain("import('@capacitor/app')")
  })
})

describe('web and other platforms: nothing happens', () => {
  it('web (not native) → nothing called', async () => {
    h.native = false
    h.platform = 'web'
    const { registerPushToken } = await load()
    expect(await registerPushToken('u', 'g')).toBe('not-native')
    expect(h.getInfo).not.toHaveBeenCalled()
    expectPushPluginUntouched()
  })

  it('an unknown native platform → nothing called', async () => {
    h.platform = 'electron'
    const { registerPushToken } = await load()
    expect(await registerPushToken('u', 'g')).toBe('unsupported-platform')
    expect(h.getInfo).not.toHaveBeenCalled()
    expectPushPluginUntouched()
  })
})

describe('FCM_MIN_ANDROID_SHELL', () => {
  it('is 1.9.0, the versionName of the first Firebase-enabled Android shell', async () => {
    const { FCM_MIN_ANDROID_SHELL } = await import('@/lib/shellVersion')
    expect(FCM_MIN_ANDROID_SHELL).toBe('1.9.0')
  })
})
