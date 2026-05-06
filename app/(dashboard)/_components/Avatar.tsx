'use client'

import { useState, useEffect } from 'react'

interface Props {
  who: 'M' | 'T'           // viewer-relative: M = me, T = them (the partner)
  initial: string          // display_name[0] (uppercase recommended)
  /** Optional photo URL. If provided and loads successfully, it sits inside a small ring
   *  of the who-color. On 404 / load error, falls back to the letter version. */
  src?: string | null
  size?: number
  ring?: boolean
}

export function Avatar({ who, initial, src, size = 28, ring = false }: Props) {
  const bg = 'var(--ink)'
  const [imgFailed, setImgFailed] = useState(false)

  // Reset failure state when src changes (e.g. after profile pic refresh).
  useEffect(() => { setImgFailed(false) }, [src])

  const showImage = !!src && !imgFailed
  // Ring thickness scales with size — ~6%, min 1.5px so it's visible on small avatars.
  const ringPx = Math.max(1.5, size * 0.06)

  return (
    <div
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: bg,
        boxShadow: ring ? '0 0 0 2px var(--bg)' : 'none',
        padding: showImage ? ringPx : 0,
      }}
      className="rounded-full text-white flex items-center justify-center font-semibold tracking-tight shrink-0 overflow-hidden"
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- next/image rejects external URLs without configured domains; this stays a plain img.
        <img
          src={src!}
          alt=""
          width={size - ringPx * 2}
          height={size - ringPx * 2}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="w-full h-full rounded-full object-cover"
        />
      ) : (
        initial
      )}
    </div>
  )
}
