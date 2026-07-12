import { describe, it, expect } from 'vitest'
import { withUtm } from '@/lib/utm'

describe('withUtm', () => {
  it('appends utm_source and utm_medium to a bare URL', () => {
    expect(
      withUtm('https://southern-light.dev/posts/hello', {
        source: 'futari_landing',
        medium: 'blog_section',
      })
    ).toBe(
      'https://southern-light.dev/posts/hello?utm_source=futari_landing&utm_medium=blog_section'
    )
  })

  it('preserves existing query params', () => {
    expect(
      withUtm('https://southern-light.dev/posts/hello?ref=rss', {
        source: 'futari_landing',
        medium: 'blog_section',
      })
    ).toBe(
      'https://southern-light.dev/posts/hello?ref=rss&utm_source=futari_landing&utm_medium=blog_section'
    )
  })

  it('preserves hash fragments', () => {
    expect(
      withUtm('https://southern-light.dev/posts/hello#faq', {
        source: 'futari_app',
        medium: 'setting_link',
      })
    ).toBe(
      'https://southern-light.dev/posts/hello?utm_source=futari_app&utm_medium=setting_link#faq'
    )
  })

  it('includes utm_campaign only when provided', () => {
    expect(
      withUtm('https://southern-light.dev/', {
        source: 'futari_app',
        medium: 'kofi_widget',
        campaign: 'launch',
      })
    ).toBe(
      'https://southern-light.dev/?utm_source=futari_app&utm_medium=kofi_widget&utm_campaign=launch'
    )
  })

  it('overwrites pre-existing utm params with ours', () => {
    expect(
      withUtm('https://southern-light.dev/?utm_source=old', {
        source: 'futari_landing',
        medium: 'footer_link',
      })
    ).toBe(
      'https://southern-light.dev/?utm_source=futari_landing&utm_medium=footer_link'
    )
  })

  it('returns unparseable URLs unchanged instead of throwing', () => {
    expect(
      withUtm('not-a-url', { source: 'futari_landing', medium: 'blog_section' })
    ).toBe('not-a-url')
  })
})
