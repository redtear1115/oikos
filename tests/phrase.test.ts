import { describe, it, expect } from 'vitest'
import { splitPhrases, phraseHtml } from '@/lib/i18n/phrase'

// #1522 follow-up: Safari / WKWebView break CJK per character, so headings need
// <wbr> at phrase boundaries. The failures this guards are silent and Apple-only:
// 「資／料」 / 「ありませ／ん。」 splits that Chrome never shows.

/** True when no phrase boundary falls inside any of `words`. */
function keepsTogether(text: string, words: string[]) {
  const parts = splitPhrases(text) ?? [text]
  return words.every((w) => parts.some((p) => p.includes(w)))
}

describe('splitPhrases', () => {
  it('round-trips: joining the phrases gives the text back', () => {
    for (const t of [
      '你的 Honeydue 資料，可以帶走',
      '把記過的帳，一起搬到 Futari',
      'ふたりで、ひとつの家計簿。',
      '移さなくても、今日から始められます',
      '兩個人，一本帳。',
    ]) {
      expect((splitPhrases(t) ?? [t]).join('')).toBe(t)
    }
  })

  it('does not split the words from the issue', () => {
    expect(keepsTogether('你的 Honeydue 資料，可以帶走', ['資料'])).toBe(true)
    expect(keepsTogether('這是什麼。', ['什麼'])).toBe(true)
    expect(keepsTogether('今のところ問題はありません。', ['ありません。'])).toBe(true)
    expect(keepsTogether('把記過的帳，一起搬到 Futari', ['一起'])).toBe(true)
    expect(keepsTogether('新婚夫妻的生活費怎麼分攤才不傷感情？', ['生活費', '怎麼', '分攤', '感情'])).toBe(true)
    expect(keepsTogether('ひとつの家計簿、ふたりの暮らし', ['ふたりの', '家計簿'])).toBe(true)
  })

  it('breaks at clause marks and between ja phrases', () => {
    expect(splitPhrases('ふたりで、ひとつの家計簿。')).toEqual(['ふたりで、', 'ひとつの', '家計簿。'])
    expect(splitPhrases('移さなくても、今日から始められます')).toEqual(['移さなくても、', '今日から', '始められます'])
  })

  it('leaves Latin-only text alone', () => {
    expect(splitPhrases('Two of you, one ledger.')).toBeNull()
    expect(phraseHtml('Two of you,<br />one ledger.')).toBe('Two of you,<br />one ledger.')
  })

  it('phraseHtml keeps tags and only inserts <wbr> in text', () => {
    const out = phraseHtml('ふたりで、<br />ひとつの家計簿。')
    expect(out).toBe('ふたりで、<br />ひとつの<wbr>家計簿。')
    expect(out.replace(/<wbr>/g, '')).toBe('ふたりで、<br />ひとつの家計簿。')
  })
})
