'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { INCOME_CATEGORIES } from '@/lib/incomeCategories'
import { createRule, updateRule, softDeleteRule } from '@/actions/recurringIncome'

export interface RuleFormValues {
  id?: string
  amount: number
  category: string
  recipientId: string
  intervalMonths: 1 | 3 | 6 | 12
  dayOfMonth: number
  startsOn: string
  endsOn: string | null
  source: string | null
  assetId: string | null
}

export interface RuleFormProps {
  initial?: RuleFormValues
  recipients: { id: string; displayName: string }[]
  insuranceAssets: { id: string; name: string }[]
}

const INTERVALS: { v: 1 | 3 | 6 | 12; label: string }[] = [
  { v: 1, label: '每月' }, { v: 3, label: '每季' },
  { v: 6, label: '每半年' }, { v: 12, label: '每年' },
]

export function RuleForm({ initial, recipients, insuranceAssets }: RuleFormProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [amount, setAmount] = useState(initial?.amount ?? 0)
  const [category, setCategory] = useState(initial?.category ?? 'salary')
  const [recipientId, setRecipientId] = useState(initial?.recipientId ?? recipients[0]?.id ?? '')
  const [intervalMonths, setIntervalMonths] = useState<1 | 3 | 6 | 12>(initial?.intervalMonths ?? 1)
  const [dayOfMonth, setDayOfMonth] = useState(initial?.dayOfMonth ?? new Date().getDate())
  const [startsOn, setStartsOn] = useState(initial?.startsOn ?? new Date().toISOString().slice(0, 10))
  const [endsOn, setEndsOn] = useState(initial?.endsOn ?? '')
  const [source, setSource] = useState(initial?.source ?? '')
  const [assetId, setAssetId] = useState(initial?.assetId ?? '')

  const submit = () => {
    setError(null)
    const payload = {
      amount, category, recipientId, intervalMonths, dayOfMonth, startsOn,
      endsOn: endsOn || null,
      source: source || null,
      assetId: assetId || null,
    }
    startTransition(async () => {
      try {
        if (initial?.id) await updateRule({ id: initial.id, ...payload })
        else await createRule(payload)
        router.push('/settings/recurring-income')
      } catch (e) {
        setError(e instanceof Error ? e.message : '儲存失敗')
      }
    })
  }

  const remove = () => {
    if (!initial?.id) return
    if (!confirm('刪除這個定期規則？已存在的待確認卡片也會一起清掉。')) return
    startTransition(async () => {
      try {
        await softDeleteRule(initial.id!)
        router.push('/settings/recurring-income')
      } catch (e) {
        setError(e instanceof Error ? e.message : '刪除失敗')
      }
    })
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <h1 className="mb-6 text-[var(--fs-xl)] font-semibold" style={{ color: 'var(--ink)' }}>
        {initial?.id ? '編輯定期進帳' : '新增定期進帳'}
      </h1>

      <label className="mb-4 block">
        <div className="text-[var(--fs-sm)]" style={{ color: 'var(--ink-3)' }}>金額（NT$）</div>
        <input
          type="number" min={1} value={amount || ''}
          onChange={(e) => setAmount(parseInt(e.target.value || '0', 10))}
          className="mt-1 w-full rounded-xl bg-transparent px-3 py-2 text-[var(--fs-2xl)]"
          style={{ border: '1px solid var(--hairline)', color: 'var(--ink)' }}
        />
      </label>

      <div className="mb-4">
        <div className="text-[var(--fs-sm)]" style={{ color: 'var(--ink-3)' }}>類別</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {INCOME_CATEGORIES.map((c) => (
            <button
              key={c.id} type="button" onClick={() => setCategory(c.id)}
              className="grid h-10 w-10 place-items-center rounded-full"
              style={{
                background: category === c.id ? c.tint : 'transparent',
                color: category === c.id ? c.ink : 'var(--ink-2)',
                border: `1px solid ${category === c.id ? c.ink : 'var(--hairline)'}`,
              }}
            >{c.mono}</button>
          ))}
        </div>
      </div>

      {recipients.length > 1 && (
        <label className="mb-4 block">
          <div className="text-[var(--fs-sm)]" style={{ color: 'var(--ink-3)' }}>歸誰</div>
          <select value={recipientId} onChange={(e) => setRecipientId(e.target.value)}
            className="mt-1 w-full rounded-xl bg-transparent px-3 py-2"
            style={{ border: '1px solid var(--hairline)', color: 'var(--ink)' }}>
            {recipients.map((r) => <option key={r.id} value={r.id}>{r.displayName}</option>)}
          </select>
        </label>
      )}

      <div className="mb-4">
        <div className="text-[var(--fs-sm)]" style={{ color: 'var(--ink-3)' }}>週期</div>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {INTERVALS.map((i) => (
            <button key={i.v} type="button" onClick={() => setIntervalMonths(i.v)}
              className="rounded-full py-2 text-[var(--fs-sm)]"
              style={{
                border: `1px solid ${intervalMonths === i.v ? 'var(--ink)' : 'var(--hairline)'}`,
                background: intervalMonths === i.v ? 'var(--ink)' : 'transparent',
                color: intervalMonths === i.v ? 'white' : 'var(--ink)',
              }}
            >{i.label}</button>
          ))}
        </div>
      </div>

      <label className="mb-4 block">
        <div className="text-[var(--fs-sm)]" style={{ color: 'var(--ink-3)' }}>每月幾號</div>
        <input type="number" min={1} max={31} value={dayOfMonth}
          onChange={(e) => setDayOfMonth(parseInt(e.target.value || '1', 10))}
          className="mt-1 w-full rounded-xl bg-transparent px-3 py-2"
          style={{ border: '1px solid var(--hairline)', color: 'var(--ink)' }}
        />
        <div className="mt-1 text-[var(--fs-xs)]" style={{ color: 'var(--ink-3)' }}>
          2 月遇 30/31 號會自動 fallback 到月底
        </div>
      </label>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <label>
          <div className="text-[var(--fs-sm)]" style={{ color: 'var(--ink-3)' }}>起始</div>
          <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)}
            className="mt-1 w-full rounded-xl bg-transparent px-3 py-2"
            style={{ border: '1px solid var(--hairline)', color: 'var(--ink)' }}/>
        </label>
        <label>
          <div className="text-[var(--fs-sm)]" style={{ color: 'var(--ink-3)' }}>結束（選填）</div>
          <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)}
            className="mt-1 w-full rounded-xl bg-transparent px-3 py-2"
            style={{ border: '1px solid var(--hairline)', color: 'var(--ink)' }}/>
        </label>
      </div>

      {insuranceAssets.length > 0 && (
        <label className="mb-4 block">
          <div className="text-[var(--fs-sm)]" style={{ color: 'var(--ink-3)' }}>關聯保單（選填）</div>
          <select value={assetId} onChange={(e) => setAssetId(e.target.value)}
            className="mt-1 w-full rounded-xl bg-transparent px-3 py-2"
            style={{ border: '1px solid var(--hairline)', color: 'var(--ink)' }}>
            <option value="">無</option>
            {insuranceAssets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      )}

      <label className="mb-6 block">
        <div className="text-[var(--fs-sm)]" style={{ color: 'var(--ink-3)' }}>備註（選填）</div>
        <input value={source} onChange={(e) => setSource(e.target.value)}
          placeholder="公司 A 月薪"
          className="mt-1 w-full rounded-xl bg-transparent px-3 py-2"
          style={{ border: '1px solid var(--hairline)', color: 'var(--ink)' }}/>
      </label>

      {error && <div className="mb-3 text-[var(--fs-sm)]" style={{ color: '#dc2626' }}>{error}</div>}

      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={pending}
          className="flex-1 rounded-full py-3 text-white disabled:opacity-50"
          style={{ background: 'var(--ink)' }}>
          {pending ? '儲存中…' : '儲存'}
        </button>
        {initial?.id && (
          <button type="button" onClick={remove} disabled={pending}
            className="rounded-full px-5 py-3 disabled:opacity-50"
            style={{ border: '1px solid #fca5a5', color: '#dc2626' }}>
            刪除
          </button>
        )}
      </div>
    </div>
  )
}
