import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

const track = vi.fn()
vi.mock('@/lib/analytics/track', () => ({ track: (...a: unknown[]) => track(...a) }))

import { AndroidBetaSteps } from '@/app/[locale]/android-beta/_components/AndroidBetaSteps'
import { generateMetadata } from '@/app/[locale]/android-beta/page'
import { zhTW } from '@/lib/i18n/locales/zh-TW'
import { en } from '@/lib/i18n/locales/en'
import { ja } from '@/lib/i18n/locales/ja'
import { zhCN } from '@/lib/i18n/locales/zh-CN'
import { isPublicLocalizedPath } from '@/lib/i18n/path'
import { ANDROID_TEST_GROUP_URL, ANDROID_TEST_OPTIN_URL } from '@/lib/visitorPlatform'

const GROUP = 'https://groups.google.com/g/example'
const OPTIN = 'https://play.google.com/apps/testing/example'

afterEach(() => {
  cleanup()
  track.mockClear()
})

describe('AndroidBetaSteps', () => {
  it('renders both step buttons, and tracks which step was clicked', () => {
    render(<AndroidBetaSteps t={zhTW.androidBeta} groupUrl={GROUP} optinUrl={OPTIN} webHref="/sign-in" />)
    const join = screen.getByText(zhTW.androidBeta.step1Cta).closest('a')!
    const open = screen.getByText(zhTW.androidBeta.step2Cta).closest('a')!
    expect(join.getAttribute('href')).toBe(GROUP)
    expect(open.getAttribute('href')).toBe(OPTIN)
    fireEvent.click(join)
    fireEvent.click(open)
    expect(track.mock.calls).toEqual([
      ['android_beta_step_clicked', { step: 'join_group' }],
      ['android_beta_step_clicked', { step: 'open_testing' }],
    ])
    expect(screen.getByText(zhTW.androidBeta.useWebVersion).closest('a')!.getAttribute('href')).toBe('/sign-in')
  })

  it('with an empty group URL renders no group anchor and no Play testing anchor, only the web link', () => {
    const { container } = render(
      <AndroidBetaSteps t={zhTW.androidBeta} groupUrl="" optinUrl={ANDROID_TEST_OPTIN_URL} webHref="/sign-in" />,
    )
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['/sign-in'])
    expect(container.innerHTML).not.toContain('play.google.com/apps/testing')
    expect(container.innerHTML).not.toContain('groups.google.com')
    expect(screen.getByText(zhTW.androidBeta.closed)).toBeTruthy()
  })
})

describe('/android-beta page wiring', () => {
  it('ships non-empty constants', () => {
    expect(ANDROID_TEST_GROUP_URL).toBe('https://groups.google.com/g/futari-android-testers')
    expect(ANDROID_TEST_OPTIN_URL).toBe('https://play.google.com/apps/testing/dev.southernlight.futari')
  })

  it('is noindex in every locale', async () => {
    for (const locale of ['zh-TW', 'zh-CN', 'en', 'ja']) {
      const meta = await generateMetadata({ params: Promise.resolve({ locale }) })
      expect(meta.robots).toEqual({ index: false })
    }
  })

  it('is a public localized path, with and without a locale prefix', () => {
    expect(isPublicLocalizedPath('/android-beta')).toBe(true)
    expect(isPublicLocalizedPath('/en/android-beta')).toBe(true)
  })
})

describe('retired signup copy (#1648)', () => {
  it('no locale still promises to delete sign-up data after adding, or mentions the form', () => {
    const all = JSON.stringify([zhTW, zhCN, en, ja])
    for (const gone of ['加入名單後', '加入名单后', 'deleted once', 'リストに追加したあと']) {
      expect(all).not.toContain(gone)
    }
  })
})
