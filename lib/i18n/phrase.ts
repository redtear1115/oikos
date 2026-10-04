// Phrase-level line breaking for zh / ja headings (#1522 follow-up).
//
// `word-break: auto-phrase` (globals.css, `.brand`) is Chrome 119+ only. Safari
// and the iOS shell's WKWebView keep per-character breaks, so a heading wraps as
// 「資／料」 or 「ありませ／ん。」. The symptom is only on Apple engines: Chrome,
// the dev server and Lighthouse all look fine.
//
// Fix: put `<wbr>` at phrase boundaries and render the heading with
// `word-break: keep-all` (the `.ph` class in app/[locale]/layout.tsx) so the only
// soft breaks left are the ones we put there (plus `overflow-wrap: anywhere` as
// the last resort for a phrase longer than the line). No dependency: ja uses
// script changes, zh uses `Intl.Segmenter` (ICU dictionary) and then glues
// single characters (的 / 人 / 費 …) onto their neighbour, since ICU leaves
// them as one-character "words".

const HAN = /\p{Script=Han}/u
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}ー]/u
const HIRA = /\p{Script=Hiragana}/u
const KATA = /[\p{Script=Katakana}ー]/u
const CLAUSE_END = /[、。，,；;：:？?！!…—]/
const MAX_ZH = 8

type Cat = 'H' | 'K' | 'C' | 'L' | 'P'
function cat(ch: string): Cat {
  if (HIRA.test(ch)) return 'H'
  if (KATA.test(ch)) return 'K'
  if (HAN.test(ch)) return 'C'
  if (/[A-Za-z0-9]/.test(ch)) return 'L'
  return 'P'
}

/** Japanese: a new phrase starts after a clause mark, and where hiragana
 *  (particles, okurigana) gives way to kanji / katakana / Latin, or kanji and
 *  katakana meet. Roughly a bunsetsu. */
function splitJa(text: string): string[] {
  const out: string[] = []
  let cur = ''
  let prev: Cat | null = null
  let prevCh = ''
  for (const ch of text) {
    const c = cat(ch)
    const boundary =
      cur !== '' &&
      (CLAUSE_END.test(prevCh) ||
        (prev === 'H' && (c === 'C' || c === 'K')) ||
        (prev === 'C' && c === 'K') ||
        (prev === 'K' && c === 'C'))
    if (boundary) {
      out.push(cur)
      cur = ''
    }
    cur += ch
    prev = c
    prevCh = ch
  }
  if (cur) out.push(cur)
  return out
}

/** Chinese: ICU words, with one-character words glued to a neighbour. */
function splitZh(text: string, locale: string): string[] {
  const seg = new Intl.Segmenter(locale, { granularity: 'word' })
  const out: string[] = []
  let cur = ''
  const flush = () => {
    if (cur) out.push(cur)
    cur = ''
  }
  for (const { segment, isWordLike } of seg.segment(text)) {
    if (!isWordLike) {
      // spaces and punctuation stay with the word before them
      cur += segment
      if (CLAUSE_END.test(segment) || /\s/.test(segment)) flush()
      continue
    }
    const [...chars] = segment
    const single = [...cur].length <= 1 && HAN.test(cur)
    if (cur && ([...cur].length + chars.length > MAX_ZH || (!single && chars.length > 1))) flush()
    cur += segment
  }
  flush()
  return out
}

/** Phrases of `text`, or `null` when there is nothing to split (no Han / kana,
 *  e.g. all of English). Concatenating the result gives `text` back. */
export function splitPhrases(text: string): string[] | null {
  if (!HAN.test(text) && !KANA.test(text)) return null
  const parts = KANA.test(text) ? splitJa(text) : splitZh(text, 'zh')
  return parts.length > 1 ? parts : null
}

/** HTML variant for the `*Html` strings (taglineHtml …): phrase-splits the text
 *  between tags, leaves tags and entities alone. */
export function phraseHtml(html: string): string {
  return html
    .split(/(<[^>]*>|&[#\w]+;)/)
    .map((piece, i) => {
      if (i % 2 === 1) return piece
      const parts = splitPhrases(piece)
      return parts ? parts.join('<wbr>') : piece
    })
    .join('')
}
