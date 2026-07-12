/**
 * 跨產品外連 UTM 標記（issue #954）。
 *
 * 分工：UTM 管「跨站流量歸因」（連去 southern-light.dev / wildcard 等
 * 自家 GA 屬性的 outbound link）；站內互動歸因走 GA event
 * （如 KofiWidget 的 `kofi_widget_click`——Ko-fi overlay URL 由其 script
 * 內部組裝，掛不了 UTM）。完整 convention 見 docs/utm-convention.md。
 */

/** 本 repo 會發出的 utm_source；wildcard / blog 由各自 repo 發出。 */
export const UTM_SOURCES = ['futari_app', 'futari_landing'] as const
export type UtmSource = (typeof UTM_SOURCES)[number]

export const UTM_MEDIUMS = [
  'kofi_widget',
  'footer_link',
  'setting_link',
  'blog_section',
] as const
export type UtmMedium = (typeof UTM_MEDIUMS)[number]

export interface UtmParams {
  source: UtmSource
  medium: UtmMedium
  /** 平常留空；只在特定活動（campaign）才帶。 */
  campaign?: string
}

/**
 * 把 UTM 參數蓋章到 outbound URL 上。既有 query / hash 保留；
 * 已存在的 utm_* 會被本站的值覆寫。無法解析的 URL（動態來源如 RSS
 * 可能給出壞連結）原樣返回，不讓歸因標記弄壞頁面渲染。
 */
export function withUtm(url: string, { source, medium, campaign }: UtmParams): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }
  parsed.searchParams.set('utm_source', source)
  parsed.searchParams.set('utm_medium', medium)
  if (campaign) parsed.searchParams.set('utm_campaign', campaign)
  return parsed.toString()
}
