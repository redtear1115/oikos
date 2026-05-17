import { XMLParser } from 'fast-xml-parser'

export type BlogPost = {
  title: string
  link: string
  /** Original RSS pubDate as an ISO timestamp; `''` when source omits it. */
  pubDate: string
}

export type ParseOptions = {
  /** Tag/category to filter by. Matches `<category>` element value
   *  case-insensitively, or as a substring of slug or title — the latter
   *  is the working filter today because `southern-light.dev/rss.xml`
   *  does not (yet) emit `<category>` elements. */
  tag: string
  /** Max items to return after filter + sort. */
  limit: number
}

const RSS_URL = 'https://southern-light.dev/rss.xml'
/** Cache for 1 hour — blog publishes are rare, no need for instant freshness. */
const REVALIDATE_SECONDS = 3600

type RawItem = {
  title?: unknown
  link?: unknown
  pubDate?: unknown
  category?: unknown
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

function normalizeCategories(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(asString).filter(Boolean)
  const s = asString(v)
  return s ? [s] : []
}

function toIsoOrEmpty(v: unknown): string {
  const s = asString(v)
  if (!s) return ''
  const t = Date.parse(s)
  return Number.isNaN(t) ? '' : new Date(t).toISOString()
}

function matches(item: { title: string; link: string; categories: string[] }, tag: string): boolean {
  const needle = tag.toLowerCase()
  if (item.categories.some(c => c.toLowerCase() === needle)) return true
  return item.link.toLowerCase().includes(needle) || item.title.toLowerCase().includes(needle)
}

export function parseBlogFeed(xml: string, { tag, limit }: ParseOptions): BlogPost[] {
  const parser = new XMLParser({
    ignoreAttributes: true,
    trimValues: true,
    parseTagValue: false,
  })
  const parsed = parser.parse(xml) as { rss?: { channel?: { item?: RawItem | RawItem[] } } }
  const rawItems = parsed?.rss?.channel?.item
  const items: RawItem[] = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : []

  return items
    .map(raw => ({
      title: asString(raw.title).trim(),
      link: asString(raw.link).trim(),
      pubDate: toIsoOrEmpty(raw.pubDate),
      categories: normalizeCategories(raw.category),
    }))
    .filter(item => item.title && item.link && matches(item, tag))
    .sort((a, b) => (b.pubDate > a.pubDate ? 1 : b.pubDate < a.pubDate ? -1 : 0))
    .slice(0, limit)
    .map(({ title, link, pubDate }) => ({ title, link, pubDate }))
}

/** Build-time fetch (ISR via `next.revalidate`). Returns `[]` on any
 *  network/parse error so the landing page never breaks because the
 *  upstream blog is down.
 *
 *  Explicit `User-Agent` + 8s timeout: defaults make Cloudflare-fronted
 *  hosts more likely to bot-challenge or hang on cold start, which then
 *  pollutes the `s-maxage=3600` CDN cache (vercel.json) with an empty
 *  section for an hour. Errors are logged to stderr so Vercel runtime
 *  logs surface why the section is empty when it happens. */
export async function fetchBlogPosts(): Promise<BlogPost[]> {
  try {
    const res = await fetch(RSS_URL, {
      next: { revalidate: REVALIDATE_SECONDS },
      headers: { 'User-Agent': 'Futari/1.0 (+https://futari.app; landing dev-log section)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      console.error(`[blog-feed] RSS fetch returned ${res.status} ${res.statusText}`)
      return []
    }
    const xml = await res.text()
    const posts = parseBlogFeed(xml, { tag: 'futari', limit: 12 })
    if (posts.length === 0) {
      console.warn(`[blog-feed] RSS fetched ok (${xml.length} bytes) but 0 posts matched`)
    }
    return posts
  } catch (err) {
    console.error('[blog-feed] RSS fetch failed:', err)
    return []
  }
}
