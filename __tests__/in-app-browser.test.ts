import { describe, it, expect } from 'vitest'
import { isInAppBrowser, isIos } from '@/lib/in-app-browser'

describe('isInAppBrowser', () => {
  describe('detects chat / social in-app WebViews', () => {
    it('LINE iOS', () => {
      const ua =
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/14.5.0'
      expect(isInAppBrowser(ua)).toBe(true)
    })

    it('LINE Android', () => {
      const ua =
        'Mozilla/5.0 (Linux; Android 13; SM-S918N Build/TP1A.220624.014) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0.6045.193 Mobile Safari/537.36 Line/14.5.0/IAB'
      expect(isInAppBrowser(ua)).toBe(true)
    })

    it('Facebook iOS (FBAN/FBAV)', () => {
      const ua =
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0.0;FBBV/...]'
      expect(isInAppBrowser(ua)).toBe(true)
    })

    it('Facebook Messenger', () => {
      const ua =
        'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Mobile Safari/537.36 [FB_IAB/MESSENGER;FBAV/450.0.0]'
      expect(isInAppBrowser(ua)).toBe(true)
    })

    it('Instagram', () => {
      const ua =
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.0.0 (iPhone15,3; iOS 17_4; en_US)'
      expect(isInAppBrowser(ua)).toBe(true)
    })

    it('Threads (Android ThreadsWebView)', () => {
      const ua =
        'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Mobile Safari/537.36 ThreadsWebView/300.0'
      expect(isInAppBrowser(ua)).toBe(true)
    })

    it('Threads (Barcelona internal name)', () => {
      const ua =
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Barcelona 300.0.0.0.0'
      expect(isInAppBrowser(ua)).toBe(true)
    })

    it('WeChat (MicroMessenger)', () => {
      const ua =
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.45(0x18002d2e) NetType/WIFI Language/zh_TW'
      expect(isInAppBrowser(ua)).toBe(true)
    })

    it('Telegram (TelegramWebView)', () => {
      const ua =
        'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Mobile Safari/537.36 TelegramWebView/10.5.0'
      expect(isInAppBrowser(ua)).toBe(true)
    })
  })

  describe('does not flag normal browsers', () => {
    it('Safari iOS', () => {
      const ua =
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
      expect(isInAppBrowser(ua)).toBe(false)
    })

    it('Chrome iOS (CriOS)', () => {
      const ua =
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.111 Mobile/15E148 Safari/604.1'
      expect(isInAppBrowser(ua)).toBe(false)
    })

    it('Chrome Android', () => {
      const ua =
        'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.111 Mobile Safari/537.36'
      expect(isInAppBrowser(ua)).toBe(false)
    })

    it('Firefox Desktop', () => {
      const ua =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:124.0) Gecko/20100101 Firefox/124.0'
      expect(isInAppBrowser(ua)).toBe(false)
    })

    it('Edge Desktop', () => {
      const ua =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 Edg/124.0'
      expect(isInAppBrowser(ua)).toBe(false)
    })
  })

  describe('handles missing input', () => {
    it('returns false for undefined', () => {
      expect(isInAppBrowser(undefined)).toBe(false)
    })

    it('returns false for null', () => {
      expect(isInAppBrowser(null)).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(isInAppBrowser('')).toBe(false)
    })
  })
})

describe('isIos', () => {
  it('matches iPhone', () => {
    expect(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)')).toBe(true)
  })

  it('matches iPad', () => {
    expect(isIos('Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X)')).toBe(true)
  })

  it('does not match Android', () => {
    expect(isIos('Mozilla/5.0 (Linux; Android 13; Pixel 7)')).toBe(false)
  })

  it('does not match macOS Safari', () => {
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4)')).toBe(false)
  })

  it('handles missing input', () => {
    expect(isIos(undefined)).toBe(false)
    expect(isIos(null)).toBe(false)
    expect(isIos('')).toBe(false)
  })
})
