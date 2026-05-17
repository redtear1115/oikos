import { describe, it, expect } from 'vitest'
import { parseBlogFeed } from '@/lib/blog-feed'

const fixture = (items: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>${items}</channel></rss>`

const item = (opts: { title: string; link: string; pubDate?: string; category?: string | string[] }) => {
  const cats = opts.category == null
    ? ''
    : Array.isArray(opts.category)
      ? opts.category.map(c => `<category>${c}</category>`).join('')
      : `<category>${opts.category}</category>`
  return `<item><title>${opts.title}</title><link>${opts.link}</link>${opts.pubDate ? `<pubDate>${opts.pubDate}</pubDate>` : ''}${cats}</item>`
}

describe('parseBlogFeed', () => {
  it('extracts title/link/pubDate from items', () => {
    const xml = fixture(item({
      title: 'Hello',
      link: 'https://example.com/hello',
      pubDate: 'Sat, 16 May 2026 00:00:00 GMT',
      category: 'futari',
    }))
    const posts = parseBlogFeed(xml, { tag: 'futari', limit: 10 })
    expect(posts).toEqual([
      {
        title: 'Hello',
        link: 'https://example.com/hello',
        pubDate: '2026-05-16T00:00:00.000Z',
      },
    ])
  })

  it('filters by <category> case-insensitively', () => {
    const xml = fixture(
      item({ title: 'A', link: 'https://a.test/', category: 'FUTARI' })
      + item({ title: 'B', link: 'https://b.test/', category: 'other' }),
    )
    const posts = parseBlogFeed(xml, { tag: 'futari', limit: 10 })
    expect(posts.map(p => p.title)).toEqual(['A'])
  })

  it('keeps items whose category matches one of multiple categories', () => {
    const xml = fixture(item({
      title: 'Multi',
      link: 'https://multi.test/',
      category: ['draft', 'Futari', 'misc'],
    }))
    const posts = parseBlogFeed(xml, { tag: 'futari', limit: 10 })
    expect(posts).toHaveLength(1)
  })

  it('falls back to slug/title substring match when no <category> elements', () => {
    // southern-light.dev/rss.xml currently emits no <category> tags;
    // we identify Futari posts by URL slug or title containing "futari".
    const xml = fixture(
      item({ title: 'Futari 開發日誌 1', link: 'https://southern-light.dev/blog/futari-1/' })
      + item({ title: '版本日誌 v0.16.0', link: 'https://southern-light.dev/blog/v0160/' })
      + item({ title: 'About VanishWhisper', link: 'https://southern-light.dev/blog/vanishwhisper/' }),
    )
    const posts = parseBlogFeed(xml, { tag: 'futari', limit: 10 })
    // Matches by slug substring "futari" AND by title "Futari"; one match per item.
    expect(posts.map(p => p.title).sort()).toEqual(['Futari 開發日誌 1'])
  })

  it('sorts results by pubDate descending', () => {
    const xml = fixture(
      item({ title: 'old', link: 'https://x/old', pubDate: 'Mon, 04 May 2026 00:00:00 GMT', category: 'futari' })
      + item({ title: 'new', link: 'https://x/new', pubDate: 'Sat, 16 May 2026 00:00:00 GMT', category: 'futari' })
      + item({ title: 'mid', link: 'https://x/mid', pubDate: 'Wed, 13 May 2026 00:00:00 GMT', category: 'futari' }),
    )
    const posts = parseBlogFeed(xml, { tag: 'futari', limit: 10 })
    expect(posts.map(p => p.title)).toEqual(['new', 'mid', 'old'])
  })

  it('respects limit', () => {
    const xml = fixture(
      Array.from({ length: 20 }, (_, i) =>
        item({
          title: `t${i}`,
          link: `https://x/${i}`,
          pubDate: `Wed, ${String(i + 1).padStart(2, '0')} May 2026 00:00:00 GMT`,
          category: 'futari',
        }),
      ).join(''),
    )
    const posts = parseBlogFeed(xml, { tag: 'futari', limit: 5 })
    expect(posts).toHaveLength(5)
    // newest first → t19, t18, t17, t16, t15
    expect(posts.map(p => p.title)).toEqual(['t19', 't18', 't17', 't16', 't15'])
  })

  it('handles a feed with a single item (parser returns object, not array)', () => {
    const xml = fixture(item({ title: 'solo', link: 'https://x/solo', category: 'futari' }))
    const posts = parseBlogFeed(xml, { tag: 'futari', limit: 10 })
    expect(posts).toHaveLength(1)
  })

  it('handles an empty channel', () => {
    const posts = parseBlogFeed(fixture(''), { tag: 'futari', limit: 10 })
    expect(posts).toEqual([])
  })

  it('skips items missing title or link', () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item><link>https://x/no-title</link><category>futari</category></item>
      <item><title>no-link</title><category>futari</category></item>
      <item><title>ok</title><link>https://x/ok</link><category>futari</category></item>
    </channel></rss>`
    const posts = parseBlogFeed(xml, { tag: 'futari', limit: 10 })
    expect(posts.map(p => p.title)).toEqual(['ok'])
  })

  it('returns empty array for unparseable XML', () => {
    const posts = parseBlogFeed('not xml at all', { tag: 'futari', limit: 10 })
    expect(posts).toEqual([])
  })
})
