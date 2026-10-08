import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { dictionaries } from '@/lib/i18n/t'
import { SUPPORTED_LOCALES } from '@/lib/i18n/locales-meta'

// #1558 S3 — the public outing pages on mocked reads. What each visitor gets:
// invalid link / no access → a message and nothing about the outing; a member
// → their dashboard; a friend → the full view, with 「這是你嗎」 only when
// signed in with an unbound claim cookie, and a sign-in link whose `next` is
// the resume route (never the share token).

const m = vi.hoisted(() => ({
  getOutingLanding: vi.fn(),
  getOutingFullView: vi.fn(),
  resolveReader: vi.fn(),
}))
vi.mock('@/lib/db/queries/outingPublic', () => ({
  getOutingLanding: m.getOutingLanding,
  getOutingFullView: m.getOutingFullView,
}))
vi.mock('@/lib/outing/access', () => ({ resolveReader: m.resolveReader }))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`) },
  useRouter: () => ({ refresh: () => {}, replace: () => {} }),
}))
vi.mock('@/actions/outing', () => ({}))

const { default: SharePage } = await import('@/app/[locale]/outing/[shareToken]/page')
const { default: ResumePage } = await import('@/app/[locale]/outing/r/[outingId]/page')
const { generateMetadata } = await import('@/app/[locale]/outing/layout')
const { SlotPicker } = await import('@/app/[locale]/outing/_components/SlotPicker')
const { OutingParticipantView } = await import('@/app/[locale]/outing/_components/OutingParticipantView')

const TOKEN = 'A'.repeat(43)
const ID = '0b0e7d3c-6b7e-4c8e-9a51-2f7d3c6b7e4c'
const OUTING = { id: ID, groupId: 'g-secret', epochId: 'e-secret', status: 'active', name: '綠島', currency: 'twd' }

const share = (locale = 'zh-TW', shareToken = TOKEN) =>
  SharePage({ params: Promise.resolve({ locale, shareToken }) })
const resume = (locale = 'zh-TW', outingId = ID) =>
  ResumePage({ params: Promise.resolve({ locale, outingId }) })

/** Depth-first: the first element of `type` in a tree of elements / fragments. */
function find(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>> | null {
  if (!isValidElement(node)) return null
  if (node.type === type) return node as ReactElement<Record<string, unknown>>
  const children = (node.props as { children?: ReactNode }).children
  for (const child of ([] as ReactNode[]).concat(children ?? [])) {
    const hit = find(child, type)
    if (hit) return hit
  }
  return null
}

/** Render a page's output, skipping client components that need providers. */
const html = (node: ReactNode) => renderToStaticMarkup(<>{node}</>)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('metadata', () => {
  it.each([...SUPPORTED_LOCALES])('%s: generic, noindex, no-referrer', async (locale) => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale }) })
    expect(meta.referrer).toBe('no-referrer')
    expect(meta.robots).toEqual({ index: false, follow: false })
    expect(meta.title).toBe(dictionaries[locale].outingPublic.metaTitle)
  })
})

describe('/outing/<shareToken>', () => {
  it('invalid / reset link → invalid copy, no reader lookup, no outing content', async () => {
    m.getOutingLanding.mockResolvedValue(null)
    const out = html(await share())
    expect(out).toContain(dictionaries['zh-TW'].outingPublic.invalidTitle)
    expect(m.resolveReader).not.toHaveBeenCalled()
  })

  it('a friend this device already identifies → resume route', async () => {
    m.getOutingLanding.mockResolvedValue({ outingId: ID, name: '綠島', status: 'active', slots: [] })
    m.resolveReader.mockResolvedValue({ outing: OUTING, actor: { kind: 'participant', via: 'cookie', userId: null, participantId: 'p1' } })
    await expect(share('en')).rejects.toThrow(`NEXT_REDIRECT /en/outing/r/${ID}`)
  })

  it('a member → their dashboard', async () => {
    m.getOutingLanding.mockResolvedValue({ outingId: ID, name: '綠島', status: 'active', slots: [] })
    m.resolveReader.mockResolvedValue({ outing: OUTING, actor: { kind: 'member', userId: 'u', participantId: 'p', pinnedPast: false } })
    await expect(share()).rejects.toThrow(`NEXT_REDIRECT /outings/${ID}`)
  })

  it('a stranger → the picker with the slot list', async () => {
    const slots = [{ id: 'p1', displayName: '小美', claim: 'unclaimed' }]
    m.getOutingLanding.mockResolvedValue({ outingId: ID, name: '綠島', status: 'ended', slots })
    m.resolveReader.mockResolvedValue(null)
    const picker = find(await share('ja'), SlotPicker)!
    expect(picker.props).toEqual({ shareToken: TOKEN, outingId: ID, locale: 'ja', active: false, slots })
  })

  it('an unknown locale → notFound', async () => {
    await expect(share('xx')).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

describe('/outing/r/<outingId>', () => {
  const VIEW = {
    outing: { id: ID, name: '綠島', currency: 'twd', status: 'active' },
    youParticipantId: 'p1',
    isAdmin: false,
    participants: [], expenses: [], settlements: [], transfers: [],
  }

  it('no cookie / no session → no-access copy and no outing content', async () => {
    m.resolveReader.mockResolvedValue(null)
    const out = html(await resume())
    expect(out).toContain(dictionaries['zh-TW'].outingPublic.noAccessTitle)
    expect(out).not.toContain('綠島')
    expect(m.getOutingFullView).not.toHaveBeenCalled()
  })

  it('a member → their dashboard', async () => {
    m.resolveReader.mockResolvedValue({ outing: OUTING, actor: { kind: 'member', userId: 'u', participantId: null, pinnedPast: false } })
    await expect(resume()).rejects.toThrow(`NEXT_REDIRECT /outings/${ID}`)
  })

  it('anonymous cookie friend → full view, sign-in link to the resume route, no bind prompt', async () => {
    const actor = { kind: 'participant', via: 'cookie', userId: null, participantId: 'p1' }
    m.resolveReader.mockResolvedValue({ outing: OUTING, actor })
    m.getOutingFullView.mockResolvedValue(VIEW)
    const el = find(await resume('en'), OutingParticipantView)!
    expect(el.props.signInHref).toBe(`/en/sign-in?next=/en/outing/r/${ID}&from=outing`)
    expect(el.props.signInHref).not.toContain(TOKEN)
    expect(el.props.needsBind).toBe(false)
    expect(el.props.signedIn).toBe(false)
    expect(el.props.view).not.toHaveProperty('isAdmin')
    expect(m.getOutingFullView).toHaveBeenCalledWith(OUTING, actor)
  })

  it('signed in + unbound claim cookie → 「這是你嗎」 (render binds nothing)', async () => {
    m.resolveReader.mockResolvedValue({ outing: OUTING, actor: { kind: 'participant', via: 'cookie', userId: 'u2', participantId: 'p1' } })
    m.getOutingFullView.mockResolvedValue(VIEW)
    const el = find(await resume(), OutingParticipantView)!
    expect(el.props.needsBind).toBe(true)
    expect(el.props.signedIn).toBe(true)
  })

  it('session-bound friend → no bind prompt, no sign-in prompt', async () => {
    m.resolveReader.mockResolvedValue({ outing: OUTING, actor: { kind: 'participant', via: 'session', userId: 'u2', participantId: 'p1' } })
    m.getOutingFullView.mockResolvedValue(VIEW)
    const el = find(await resume(), OutingParticipantView)!
    expect(el.props.needsBind).toBe(false)
    expect(el.props.signedIn).toBe(true)
  })
})

describe('outingPublic copy', () => {
  const keys = Object.keys(dictionaries['zh-TW'].outingPublic).sort()
  it.each([...SUPPORTED_LOCALES])('%s has every key, non-empty, no exclamation, no banned words', (locale) => {
    const c = dictionaries[locale].outingPublic as Record<string, string>
    expect(Object.keys(c).sort()).toEqual(keys)
    for (const v of Object.values(c)) {
      expect(v.trim()).not.toBe('')
      expect(v).not.toMatch(/[!！]/)
      expect(v).not.toMatch(/管理|追蹤|监控|監控|追踪/)
    }
  })
})
