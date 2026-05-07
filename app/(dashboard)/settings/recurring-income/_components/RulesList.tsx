'use client'

import { useState } from 'react'
import { RuleListItem } from './RuleListItem'
import { RecurringRuleSheet } from './RecurringRuleSheet'
import type { RecurringRuleRow } from '@/lib/db/queries/recurringIncome'

interface Props {
  rules: RecurringRuleRow[]
  insuranceAssets: { id: string; name: string }[]
  onMutated: () => void
}

export function RulesList({ rules, insuranceAssets, onMutated }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedRule, setSelectedRule] = useState<RecurringRuleRow | undefined>()

  const handleEdit = (rule: RecurringRuleRow) => {
    setSelectedRule(rule)
    setSheetOpen(true)
  }

  const handleClose = () => {
    setSheetOpen(false)
    setSelectedRule(undefined)
  }

  const handleMutated = () => {
    onMutated()
    handleClose()
  }

  return (
    <>
      <ul className="space-y-3">
        {rules.map((r) => (
          <RuleListItem key={r.id} rule={r} onEdit={handleEdit} />
        ))}
      </ul>
      <RecurringRuleSheet
        open={sheetOpen}
        onClose={handleClose}
        onMutated={handleMutated}
        initial={selectedRule}
        insuranceAssets={insuranceAssets}
      />
    </>
  )
}
