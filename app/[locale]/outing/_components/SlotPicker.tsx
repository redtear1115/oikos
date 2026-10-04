'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/client'
import { unwrapAction } from '@/lib/action-errors'
import { describeError } from '@/lib/errors'
import { track } from '@/lib/analytics/track'
import { joinOuting } from '@/actions/outing'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/TextInput'
import { OUTING_PARTICIPANT_NAME_MAX } from '@/lib/outing/validate'
import type { OutingSlot } from '@/lib/db/queries/outingPublic'
import { Field, ChipRow, Chip } from '@/app/(dashboard)/outings/[id]/_components/sheetBits'
import { Card, SectionTitle } from './OutingPublicChrome'

interface Props {
  shareToken: string
  outingId: string
  locale: string
  active: boolean
  slots: OutingSlot[]
}

const SELF = 'self'

/**
 * 「你是哪一位？」 on /outing/<shareToken> (#1558): pick an unclaimed name, or
 * add yourself. joinOuting sets the claim cookie (or binds a signed-in
 * account), then we move to the resume route so the share token leaves the
 * address bar.
 */
export function SlotPicker({ shareToken, outingId, locale, active, slots }: Props) {
  const t = useTranslations()
  const c = t.outingPublic
  const router = useRouter()
  const [picked, setPicked] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    // No outing id or token in properties: the page URL already carries the
    // token, and S0's scrubbers mask it there.
    track('outing_link_opened', { state: active ? 'picker' : 'ended' })
  }, [active])

  if (!active) {
    return <p className="px-4 pt-4 text-sm text-ink-3">{c.endedLanding}</p>
  }

  const open = slots.filter((s) => s.claim === 'unclaimed')
  const taken = slots.filter((s) => s.claim !== 'unclaimed')
  const pickedSlot = open.find((s) => s.id === picked)
  const canJoin = picked === SELF ? name.trim() !== '' : !!pickedSlot

  const join = () => {
    setError('')
    startTransition(async () => {
      try {
        unwrapAction(await joinOuting(
          picked === SELF ? { shareToken, displayName: name } : { shareToken, participantId: picked! },
        ))
        track('outing_joined', { method: picked === SELF ? 'added_self' : 'claimed' })
        router.replace(`/${locale}/outing/r/${outingId}`)
      } catch (e) {
        setError(describeError(e, t.common.error, t.common.offlineError, t.errors.actions))
        router.refresh()
      }
    })
  }

  return (
    <div className="px-4 pt-4 flex flex-col gap-5">
      <Card>
        <SectionTitle>{c.whoAreYou}</SectionTitle>
        <p className="text-sm text-ink-3 mb-3">{c.whoAreYouHint}</p>
        <ChipRow>
          {open.map((s) => (
            <Chip key={s.id} selected={picked === s.id} onClick={() => setPicked(s.id)}>{s.displayName}</Chip>
          ))}
          <Chip selected={picked === SELF} onClick={() => setPicked(SELF)}>{c.notListed}</Chip>
        </ChipRow>
        {taken.length > 0 && (
          <div className="mt-4 flex flex-col gap-1">
            {taken.map((s) => (
              <div key={s.id} className="text-sm text-ink-3">{s.displayName}</div>
            ))}
            <p className="text-xs text-ink-3">{c.slotTakenHint}</p>
          </div>
        )}
      </Card>

      {picked === SELF && (
        <Field label={c.addSelfLabel}>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={OUTING_PARTICIPANT_NAME_MAX}
            placeholder={c.addSelfPlaceholder}
          />
        </Field>
      )}

      {error && <p role="alert" className="text-sm text-[var(--debit-text)]">{error}</p>}

      <Button variant="primary" disabled={!canJoin || pending} onClick={join}>
        {picked === SELF ? c.addSelfSave : c.joinAs.replace('{name}', pickedSlot?.displayName ?? '…')}
      </Button>
    </div>
  )
}
