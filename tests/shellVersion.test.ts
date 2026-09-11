import { describe, it, expect } from 'vitest'
import {
  MIN_SHELL_VERSION,
  compareVersions,
  isShellOutdated,
  isShellPlatform,
} from '@/lib/shellVersion'

describe('compareVersions', () => {
  it('orders by the first differing segment', () => {
    expect(compareVersions('1.5.0', '1.5.1')).toBe(-1)
    expect(compareVersions('1.5.1', '1.5.0')).toBe(1)
    expect(compareVersions('1.4.9', '1.5.0')).toBe(-1)
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1)
  })

  it('treats identical versions as equal', () => {
    expect(compareVersions('1.5.5', '1.5.5')).toBe(0)
  })

  it('compares numerically, not lexically', () => {
    // The whole point of not using string comparison: "10" > "9".
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1)
    expect(compareVersions('1.5.10', '1.5.9')).toBe(1)
  })

  it('pads missing segments with zero', () => {
    expect(compareVersions('1.5', '1.5.0')).toBe(0)
    expect(compareVersions('1.5', '1.5.1')).toBe(-1)
    expect(compareVersions('1.5.1', '1.5')).toBe(1)
    expect(compareVersions('2', '1.9.9')).toBe(1)
  })

  it('ignores leading zeros', () => {
    expect(compareVersions('1.05.0', '1.5.0')).toBe(0)
  })

  it('strips pre-release and build metadata', () => {
    expect(compareVersions('1.5.0-beta.2', '1.5.0')).toBe(0)
    expect(compareVersions('1.5.0+42', '1.5.0')).toBe(0)
    expect(compareVersions('1.4.0-rc.1', '1.5.0')).toBe(-1)
  })

  it('tolerates surrounding whitespace', () => {
    expect(compareVersions(' 1.5.1 ', '1.5.0')).toBe(1)
  })

  it('returns null when either side is unparseable', () => {
    expect(compareVersions('', '1.5.0')).toBeNull()
    expect(compareVersions('1.5.0', '')).toBeNull()
    expect(compareVersions('unknown', '1.5.0')).toBeNull()
    expect(compareVersions('1.5.x', '1.5.0')).toBeNull()
    expect(compareVersions('v1.5.0', '1.5.0')).toBeNull()
    expect(compareVersions('1..5', '1.5.0')).toBeNull()
  })
})

describe('isShellOutdated', () => {
  it('flags a shell below its platform threshold', () => {
    expect(isShellOutdated('ios', '1.4.9')).toBe(true)
    expect(isShellOutdated('android', '1.0.0')).toBe(true)
  })

  it('does not flag a shell at or above the threshold', () => {
    expect(isShellOutdated('ios', MIN_SHELL_VERSION.ios)).toBe(false)
    expect(isShellOutdated('android', MIN_SHELL_VERSION.android)).toBe(false)
    expect(isShellOutdated('ios', '9.9.9')).toBe(false)
  })

  it('fails open on an unreadable version', () => {
    expect(isShellOutdated('ios', '')).toBe(false)
    expect(isShellOutdated('android', 'unknown')).toBe(false)
  })

  it('stays silent for the shells currently in the stores', () => {
    // Guards the "ship the mechanism, keep it quiet" intent (#991): the
    // thresholds must sit below what iOS (MARKETING_VERSION) and Android
    // (versionName) actually ship, or merging this nags every install.
    expect(isShellOutdated('ios', '1.5.5')).toBe(false)
    expect(isShellOutdated('android', '1.5.1')).toBe(false)
  })
})

describe('isShellPlatform', () => {
  it('accepts the platforms we ship a shell for', () => {
    expect(isShellPlatform('ios')).toBe(true)
    expect(isShellPlatform('android')).toBe(true)
  })

  it('rejects web, which has no shell', () => {
    expect(isShellPlatform('web')).toBe(false)
    expect(isShellPlatform('')).toBe(false)
  })
})
