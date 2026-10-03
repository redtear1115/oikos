import Image, { getImageProps } from 'next/image'
import { preload } from 'react-dom'

type Props = {
  /** true = mobile band (full-width, fixed height, top crop).
   *  false/undefined = desktop column (fills parent, center crop). */
  mobile?: boolean
}

// IllustrationSlot — decorative hero image. Isolated so swapping the
// illustration later requires only replacing public/illustration-hero.png
// (or updating the src here) with no JSX changes elsewhere.
// alt="" intentionally: the illustration is decorative; the copy carries meaning.
//
// Loading (#1520): the landing renders both slots and hides one per breakpoint,
// so `preload` on both (the old `priority`) queued two sizes of the same image
// ahead of everything on every phone. Instead the mobile band (the mobile LCP
// element) is eager + high priority AND preloaded behind a media query, and the
// desktop column is lazy, which keeps a `display: none` image from being
// fetched at all on phones.
//
// The reverse needs care too: an eager <img> inside a `display: none` parent is
// still fetched, so a plain eager mobile <Image> made every desktop visit
// download the mobile size as well. The mobile band is therefore a <picture>
// whose only <source> is `(max-width: 767px)`; the <img> fallback is an inline
// 1x1 GIF, so below that width the browser picks the source (eager, high
// priority, discovered immediately) and above it nothing is requested.
//
// The preload, the <source> and Next's own srcSet all come from one
// `getImageProps` call, so they request the identical URL. `767px` is the
// complement of Tailwind's default `md` (48rem = 768px, no override in this
// project) that Landing.tsx hides the band with. Failure looks like nothing:
// if the preload and <source> drift the hero is downloaded twice; if the media
// query is wider than `md:hidden`, desktop downloads the mobile size again.
// Check the network panel at 390 and 1440.
//
// `sizes`: the band is as wide as the hero section's content box, not the
// viewport: `max-w-md` (448px) minus `px-6` (24px each side) minus the wrapper's
// `px-1` (4px each side) = 392px, and below 448px it is 100vw - 56px. Declaring
// `100vw` over-asked: a 412px phone at DPR 1.75 needs 623px but was served the
// 750 file, and Lighthouse's simulated LCP (bound by total bytes ahead of
// hydration on this page) paid for the extra bytes. If the section's padding or
// max width changes, update this: too small renders a soft image (no error),
// too large silently costs LCP again.
const MOBILE_MEDIA = '(max-width: 767px)'
const MOBILE_HERO_SIZES = '(min-width: 448px) 392px, calc(100vw - 56px)'
const BLANK_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

export function IllustrationSlot({ mobile }: Props) {
  if (mobile) {
    const { props } = getImageProps({
      src: '/illustration-hero.png',
      alt: '',
      fill: true,
      sizes: MOBILE_HERO_SIZES,
    })
    const { srcSet, sizes, src: _src, ...imgProps } = props
    void _src
    preload(props.src, {
      as: 'image',
      imageSrcSet: srcSet,
      imageSizes: sizes,
      fetchPriority: 'high',
      media: MOBILE_MEDIA,
    })
    return (
      <div className="relative w-full h-[252px] rounded-3xl overflow-hidden">
        <picture>
          <source media={MOBILE_MEDIA} srcSet={srcSet} sizes={sizes} />
          <img
            {...imgProps}
            src={BLANK_GIF}
            alt=""
            aria-hidden="true"
            className="object-cover object-top"
            loading="eager"
            fetchPriority="high"
          />
        </picture>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full min-h-[320px] rounded-3xl overflow-hidden">
      <Image
        src="/illustration-hero.png"
        alt=""
        aria-hidden="true"
        fill
        className="object-cover object-center"
        loading="lazy"
        sizes="50vw"
      />
    </div>
  )
}
