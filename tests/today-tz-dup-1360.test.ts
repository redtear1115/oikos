// #1360 follow-up — duplicate `futari_tz` cookies. southern-light.dev hosts sibling
// sites, so a `Domain=.southern-light.dev` cookie can arrive next to ours
// under the same name.
//
// The client takes the first *valid* `futari_tz` in document.cookie. #1363's server
// used `cookies().getAll('futari_tz')`, assuming it would see every entry — but
// Next's RequestCookies keys by name, a later duplicate overwrites an earlier
// one, and the server's real rule was "the last decodable value". Now the
// server parses the raw Cookie header with the client's own function.
//
// Failure looks like: no error anywhere — the server renders one zone's
// today, hydration succeeds, and the number jumps once on load.

import { describe, it, expect, vi } from 'vitest'
import { RequestCookies } from 'next/dist/compiled/@edge-runtime/cookies'

let cookieHeader: string | null = null
// Both APIs over the same request, backed by the real RequestCookies, so the
// test measures whichever one lib/today-server.ts uses.
vi.mock('next/headers', () => {
  const req = () => new Headers(cookieHeader === null ? {} : { cookie: cookieHeader })
  return {
    headers: async () => req(),
    cookies: async () => new RequestCookies(req()),
  }
})

import { getTimeZone } from '@/lib/today-server'
import { DEFAULT_TIME_ZONE, readTimeZoneCookie, timeZoneFromCookieHeader } from '@/lib/today'

/** The client's rule, exactly as TodayProvider applies it to document.cookie. */
const clientRule = (header: string) => readTimeZoneCookie(header) ?? DEFAULT_TIME_ZONE

async function serverRule(header: string | null): Promise<string> {
  cookieHeader = header
  return getTimeZone()
}

describe('duplicate futari_tz cookies: server and client agree (#1360)', () => {
  it.each([
    ['two valid zones → the first', 'futari_tz=Europe%2FParis; futari_tz=Asia%2FTokyo', 'Europe/Paris'],
    ['valid then junk → the valid one', 'futari_tz=Asia%2FTokyo; futari_tz=junk', 'Asia/Tokyo'],
    ['undecodable then valid → the valid one', 'futari_tz=%E0%A4%A; futari_tz=Asia%2FTokyo', 'Asia/Tokyo'],
    ['junk only → Asia/Taipei', 'futari_tz=junk', 'Asia/Taipei'],
    ['among other cookies', 'lang=en; futari_tz=America%2FNew_York; sb=x', 'America/New_York'],
    ['no tz → Asia/Taipei', 'lang=en', 'Asia/Taipei'],
    // A sibling site's bare `tz` (Domain=.southern-light.dev) is not ours — the
    // reason for the futari_ prefix — even when it is a valid zone sorted first.
    ['a sibling site\'s bare tz is ignored', 'tz=Europe%2FParis; futari_tz=Asia%2FTokyo', 'Asia/Tokyo'],
  ])('%s', async (_name, header, expected) => {
    expect(clientRule(header)).toBe(expected)
    expect(await serverRule(header)).toBe(expected)
    expect(timeZoneFromCookieHeader(header)).toBe(expected)
  })

  it('no Cookie header at all → Asia/Taipei', async () => {
    expect(await serverRule(null)).toBe('Asia/Taipei')
  })

  // Why the raw header: this is what #1363's server actually saw. Kept as a
  // record of the real RequestCookies behaviour, so the next person doesn't
  // "simplify" back to cookies().getAll().
  it('the real RequestCookies collapses duplicates to the last value', () => {
    const jar = new RequestCookies(new Headers({ cookie: 'futari_tz=Europe%2FParis; futari_tz=Asia%2FTokyo' }))
    expect(jar.getAll('futari_tz').map(c => c.value)).toEqual(['Asia/Tokyo'])
    // …which disagrees with the client's first-valid rule:
    expect(clientRule('futari_tz=Europe%2FParis; futari_tz=Asia%2FTokyo')).toBe('Europe/Paris')

    const junkLast = new RequestCookies(new Headers({ cookie: 'futari_tz=Asia%2FTokyo; futari_tz=junk' }))
    expect(junkLast.getAll('futari_tz').map(c => c.value)).toEqual(['junk'])
  })
})
