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
          priority
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
        priority
        sizes="50vw"
      />
    </div>
  )
}
