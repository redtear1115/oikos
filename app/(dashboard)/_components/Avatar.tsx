'use client'

import Image from 'next/image'
import { useState, useEffect } from 'react'

interface Props {
  /** Absolute group role — drives ring/bg color. 'a' = deep brown (--ink), 'b' = orange (--accent).
   *  Echoes the FutariMark heart's two lobes (#238). Convert from viewer-relative `who` via
   *  `whoToMemberRole(who, viewerIsA)` from MemberContext. */
  memberRole: 'a' | 'b'
  initial: string          // display_name[0] (uppercase recommended)
  /** Optional photo URL. If provided and loads successfully, it sits inside a small ring
   *  of the role-color. On 404 / load error, falls back to the letter version. */
  src?: string | null
  size?: number
  ring?: boolean
}

export function Avatar({ memberRole, initial, src, size = 28, ring = false }: Props) {
  const bg = memberRole === 'b' ? 'var(--accent)' : 'var(--ink)'
  const [imgFailed, setImgFailed] = useState(false)

  // Reset failure state when src changes (e.g. after profile pic refresh).
  useEffect(() => { setImgFailed(false) }, [src])

  const showImage = !!src && !imgFailed
  // Ring thickness scales with size — ~6%, min 1.5px so it's visible on small avatars.
  const ringPx = Math.max(1.5, size * 0.06)
  // next/image needs integer width/height to build a clean srcset; round once here.
  const innerPx = Math.round(size - ringPx * 2)

  return (
    <div
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: bg,
        color: 'var(--on-fill)',
        boxShadow: ring ? '0 0 0 2px var(--bg)' : 'none',
        padding: showImage ? ringPx : 0,
      }}
      className="rounded-full flex items-center justify-center font-medium tracking-tight shrink-0 overflow-hidden"
    >
      {showImage ? (
        // next/image proxies through Supabase remotePatterns (next.config.ts) and
        // emits AVIF/WebP + responsive srcset. `sizes` is locked to the rendered
        // pixel width so next/image picks the smallest matching imageSizes bucket
        // (16/32/48/64/96/128) instead of defaulting to 100vw. No `priority` —
        // avatars are never the LCP element; lazy by default.
        <Image
          src={src!}
          alt=""
          width={innerPx}
          height={innerPx}
          sizes={`${innerPx}px`}
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
