/**
 * System text size → `--text-scale` (#1490).
 *
 * iOS WKWebView ignores the system text size for ordinary CSS (px and rem both
 * stay put), but a `font: -apple-system-body` element does follow it, so that
 * element is the probe: at the default size it measures 17px, and every
 * Dynamic Type step moves it (verified in the Capacitor shell on an iOS 27
 * simulator: large 17 → xxxL 23 → AX5 53). The ratio to 17 becomes
 * `--text-scale` on <html>, which the body-text tiers in globals.css multiply
 * by. The root font-size is never touched — Tailwind spacing is rem, and
 * scaling it would zoom padding and heights too.
 *
 * Android never goes through here: `CSS.supports('font', '-apple-system-body')`
 * is false in Chrome/WebView, whose textZoom already scales rem and px alike,
 * so scaling again would double it. The variable is unset (not set to 1) at the
 * default size so a page that does not mount the scope can never inherit a stale
 * value. Failure looks like: nothing — text just stays small on iOS, or stays
 * large after leaving the dashboard.
 */

export const TEXT_SCALE_VAR = '--text-scale'
/** `-apple-system-body` at the default (Large) content size category. */
export const BODY_BASE_PX = 17
/** Matches Android's maximum font scale; AX5 alone would be ~3.1. */
export const TEXT_SCALE_CAP = 2

/**
 * Probe size in px → scale to apply, or `null` for "leave it unset".
 * Unset at or below the default (a smaller-than-default setting is not scaled
 * down: 12px labels are already the floor), and for anything unmeasurable.
 */
export function computeTextScale(probePx: number, cap: number = TEXT_SCALE_CAP): number | null {
  if (!Number.isFinite(probePx) || probePx <= 0) return null
  const ratio = probePx / BODY_BASE_PX
  if (ratio <= 1.0005) return null
  return Math.round(Math.min(ratio, cap) * 1000) / 1000
}

/** Measure the probe and set / clear `--text-scale` on `<html>`. */
export function syncTextScale(doc: Document = document): number | null {
  const root = doc.documentElement
  const view = doc.defaultView
  if (!view || typeof view.CSS?.supports !== 'function' || !view.CSS.supports('font', '-apple-system-body')) {
    root.style.removeProperty(TEXT_SCALE_VAR)
    return null
  }
  const probe = doc.createElement('span')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;font:-apple-system-body'
  probe.textContent = 'x'
  doc.body.appendChild(probe)
  const px = parseFloat(view.getComputedStyle(probe).fontSize)
  probe.remove()
  const scale = computeTextScale(px)
  if (scale === null) root.style.removeProperty(TEXT_SCALE_VAR)
  else root.style.setProperty(TEXT_SCALE_VAR, String(scale))
  return scale
}

export function clearTextScale(doc: Document = document): void {
  doc.documentElement.style.removeProperty(TEXT_SCALE_VAR)
}

/**
 * Pre-paint copy of syncTextScale for the dashboard layout's first HTML
 * (inline scripts inside a client-rendered RSC payload do not execute, so this
 * covers hard loads; TextScale covers client-side entry). Kept in step with
 * computeTextScale by tests/text-scale.test.ts, which evaluates this string.
 * Runs in <body> before any dashboard content, so `document.body` exists.
 */
export const TEXT_SCALE_INIT_SCRIPT = `(function(){try{
var d=document,r=d.documentElement;
if(!CSS.supports('font','-apple-system-body')){r.style.removeProperty('${TEXT_SCALE_VAR}');return}
var p=d.createElement('span');p.style.cssText='position:absolute;visibility:hidden;font:-apple-system-body';p.textContent='x';
d.body.appendChild(p);var px=parseFloat(getComputedStyle(p).fontSize);p.remove();
var k=px/${BODY_BASE_PX};
if(!(k>1.0005)){r.style.removeProperty('${TEXT_SCALE_VAR}')}
else{r.style.setProperty('${TEXT_SCALE_VAR}',String(Math.round(Math.min(k,${TEXT_SCALE_CAP})*1000)/1000))}
}catch(e){}})();`
