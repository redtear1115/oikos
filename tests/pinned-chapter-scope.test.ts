import { describe, it, expect } from 'vitest'
import { nonMemberPinCutoff } from '@/lib/pinnedChapterScope'

const ENDED = new Date('2026-06-15T00:00:00Z')
const past = { startedAt: new Date('2026-03-01T00:00:00Z'), endedAt: ENDED, epochId: 'e1', isPast: true }
const open = { startedAt: ENDED, endedAt: null, epochId: 'e2', isPast: false }

describe('nonMemberPinCutoff', () => {
  it('is the chapter end for a closed chapter the viewer is no longer a member of', () => {
    expect(nonMemberPinCutoff({ group: { memberA: 'a', memberB: null }, window: past }, 'b')).toBe(ENDED)
    expect(nonMemberPinCutoff({ group: { memberA: 'a', memberB: 'c' }, window: past }, 'b')).toBe(ENDED)
  })

  it('is null for a current member, on either side, in any chapter', () => {
    expect(nonMemberPinCutoff({ group: { memberA: 'a', memberB: 'c' }, window: past }, 'a')).toBeNull()
    expect(nonMemberPinCutoff({ group: { memberA: 'a', memberB: 'c' }, window: past }, 'c')).toBeNull()
    expect(nonMemberPinCutoff({ group: { memberA: 'a', memberB: 'c' }, window: open }, 'a')).toBeNull()
  })

  it('is null for the open chapter', () => {
    expect(nonMemberPinCutoff({ group: { memberA: 'a', memberB: null }, window: open }, 'b')).toBeNull()
  })
})
