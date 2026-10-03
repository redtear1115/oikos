import Image from 'next/image'

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
// ahead of everything on every phone. Next's own guidance for viewport-
// dependent LCP candidates is no preload: the mobile band (the mobile LCP
// element) is eager + high priority, and the desktop column is lazy, which
// keeps a `display: none` image from being fetched at all on phones.
export function IllustrationSlot({ mobile }: Props) {
  if (mobile) {
    return (
      <div className="relative w-full h-[252px] rounded-3xl overflow-hidden">
        <Image
          src="/illustration-hero.png"
          alt=""
          aria-hidden="true"
          fill
          className="object-cover object-top"
          loading="eager"
          fetchPriority="high"
          sizes="100vw"
        />
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
