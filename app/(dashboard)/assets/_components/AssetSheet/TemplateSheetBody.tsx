'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useTranslations } from '@/lib/i18n/client'
import { describeError } from '@/lib/errors'
import {
  createTemplateAsset,
  editTemplateAsset,
  softDeleteAsset,
} from '@/actions/asset'
import { NameField } from './shared/NameField'
import { NotesField } from './shared/NotesField'
import { SheetShell } from './shared/SheetShell'
import { DeleteConfirmFlow } from './shared/DeleteConfirmFlow'
import type { AssetSheetInitial, BodySharedProps } from './types'

interface Props extends BodySharedProps {
  initial?: AssetSheetInitial
}

// #222 — body for the template path (currently only the `general` template:
// `name` + `notes`, no extra fields). Lives alongside the legacy
// *SheetBody files and is dispatched to by AssetSheet when the user picks
// 「物品」 in TypePicker (or when editing a template-based asset).
//
// The shape stays generic enough that adding more templates later means:
//   - declare fields in lib/assetTemplates.ts
//   - render them here by iterating `getTemplate(templateKey).fields`
// The current MVP doesn't iterate because there are no fields to render.
export function TemplateSheetBody({
  open,
  onClose,
  onMutated,
  typePickerSlot,
  initial,
}: Props) {
  const isEdit = !!initial
  const t = useTranslations()
  const ts = t.assetTemplate

  const [name, setName] = useState(initial?.name ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setNotes(initial?.notes ?? '')
    setError('')
    const id = setTimeout(() => nameInputRef.current?.focus(), 350)
    return () => clearTimeout(id)
  }, [open, initial])

  const canSave = name.trim() !== '' && !pending

  const handleSave = () => {
    startTransition(async () => {
      try {
        const payload = {
          templateKey: 'general' as const,
          name: name.trim(),
          notes: notes.trim() || null,
          fields: {},
        }
        if (isEdit) {
          await editTemplateAsset({ id: initial!.id, ...payload })
        } else {
          await createTemplateAsset(payload)
        }
        onMutated?.('saved')
        onClose()
      } catch (e) {
        setError(describeError(e, t.common.error, t.common.offlineError))
      }
    })
  }

  const performDelete = () => {
    if (!isEdit) return
    startTransition(async () => {
      try {
        await softDeleteAsset(initial!.id)
        onMutated?.('deleted')
        onClose()
      } catch (e) {
        setError(describeError(e, t.common.error, t.common.offlineError))
      }
    })
  }

  const title = isEdit
    ? t.assetSheet.titleEdit.replace('{type}', t.assetSheet.type.item)
    : t.assetSheet.titleNew

  return (
    <SheetShell
      open={open}
      title={title}
      canSave={canSave}
      pending={pending}
      bottomSaveLabel={isEdit ? t.assetSheet.saveChanges : t.assetSheet.titleNew}
      error={error}
      onClose={onClose}
      onSave={handleSave}
    >
      {typePickerSlot}

      <NameField
        ref={nameInputRef}
        label={t.assetSheet.name.label}
        value={name}
        onChange={setName}
        placeholder={ts.namePlaceholder}
      />

      <NotesField
        label={t.assetSheet.notes.label}
        placeholder={t.assetSheet.notes.placeholder}
        value={notes}
        onChange={setNotes}
      />

      {isEdit && <DeleteConfirmFlow pending={pending} onDelete={performDelete} />}
    </SheetShell>
  )
}
