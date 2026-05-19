'use client'

import { useTranslations } from '@/lib/i18n/client'
import type { ImportPayerMember } from '@/actions/import'
import type { RuleState } from './ImportContent'

interface Member {
  id: string
  displayName: string
}

interface Props {
  viewer: Member
  partner: Member | null
  viewerIsMemberA: boolean
  rules: RuleState
  onChange: (next: RuleState) => void
  onBack: () => void
  onNext: () => void
}

const SPLIT_OPTIONS: RuleState['splitType'][] = ['all_mine', 'all_theirs', 'half']

export function StepRules({ viewer, partner, viewerIsMemberA, rules, onChange, onBack, onNext }: Props) {
  const t = useTranslations()
  const tImport = t.settings.import.step3
  const hasPartner = partner !== null

  const memberA: Member = viewerIsMemberA ? viewer : (partner ?? viewer)
  const memberB: Member | null = viewerIsMemberA ? partner : viewer

  function setPayer(payer: ImportPayerMember) {
    onChange({ ...rules, payer })
  }
  function setSplit(splitType: RuleState['splitType']) {
    onChange({ ...rules, splitType })
  }

  return (
    <div className="space-y-4">
      <div
        className="rounded-2xl px-5 py-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <div className="text-sm font-medium mb-1" style={{ color: 'var(--ink)' }}>
          {tImport.title}
        </div>
        <div className="text-xs mb-4" style={{ color: 'var(--ink-3)' }}>
          {tImport.subtitle}
        </div>

        <div className="text-xs font-medium px-1 mb-2" style={{ color: 'var(--ink-3)' }}>
          {tImport.payerLabel}
        </div>
        <div className="grid grid-cols-2 gap-2 mb-1">
          <PayerButton
            label={memberA.displayName}
            active={rules.payer === 'a'}
            onClick={() => setPayer('a')}
          />
          <PayerButton
            label={memberB?.displayName ?? '—'}
            active={rules.payer === 'b'}
            onClick={() => setPayer('b')}
            disabled={!hasPartner}
          />
        </div>
        <div className="text-xs px-1 mt-2" style={{ color: 'var(--ink-3)' }}>
          {tImport.payerHint}
        </div>
      </div>

      <div
        className="rounded-2xl px-5 py-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <div className="text-xs font-medium px-1 mb-2" style={{ color: 'var(--ink-3)' }}>
          {tImport.splitLabel}
        </div>
        {hasPartner ? (
          <div className="grid grid-cols-3 gap-2">
            {SPLIT_OPTIONS.map((opt) => (
              <SplitButton
                key={opt}
                label={tImport.splitOptions[opt]}
                active={rules.splitType === opt}
                onClick={() => setSplit(opt)}
              />
            ))}
          </div>
        ) : (
          <div className="text-xs px-1" style={{ color: 'var(--ink-3)' }}>
            {tImport.soloHint}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 h-11 rounded-xl text-sm cursor-pointer"
          style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ink-2)' }}
        >
          {tImport.backCta}
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex-[1.4] h-11 rounded-xl text-sm text-white cursor-pointer"
          style={{ background: 'var(--btn-primary-bg)' }}
        >
          {tImport.nextCta}
        </button>
      </div>
    </div>
  )
}

function PayerButton({
  label,
  active,
  onClick,
  disabled,
}: {
  label: string
  active: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-3 rounded-xl text-sm cursor-pointer disabled:cursor-default disabled:opacity-50"
      style={{
        background: active ? 'var(--surface-alt)' : 'var(--surface)',
        border: `1px solid ${active ? 'var(--ink-2)' : 'var(--hairline)'}`,
        color: 'var(--ink)',
      }}
    >
      {label}
    </button>
  )
}

function SplitButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-3 rounded-xl text-sm cursor-pointer"
      style={{
        background: active ? 'var(--surface-alt)' : 'var(--surface)',
        border: `1px solid ${active ? 'var(--ink-2)' : 'var(--hairline)'}`,
        color: 'var(--ink)',
      }}
    >
      {label}
    </button>
  )
}
