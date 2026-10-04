import { Fragment } from 'react'
import { splitPhrases } from '@/lib/i18n/phrase'

/**
 * Heading text with `<wbr>` at phrase boundaries, so Safari / the iOS shell
 * break between phrases instead of inside a word (#1522 follow-up). The `.ph`
 * rule (word-break: keep-all) lives in app/[locale]/layout.tsx.
 * Latin-only text, i.e. all of English, is returned untouched: no wrapper, no
 * extra HTML.
 */
export function Phrase({ text }: { text: string }) {
  const parts = splitPhrases(text)
  if (!parts) return <>{text}</>
  return (
    <span className="ph">
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <wbr />}
          {p}
        </Fragment>
      ))}
    </span>
  )
}
