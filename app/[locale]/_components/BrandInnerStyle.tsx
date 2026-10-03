import { BRAND_INNER_CSS } from './brand-inner'

/** Inlines the inner-brand-page vocabulary (see brand-inner.ts for why it is not a stylesheet). */
export function BrandInnerStyle() {
  return <style dangerouslySetInnerHTML={{ __html: BRAND_INNER_CSS }} />
}
