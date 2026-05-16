'use client'

import type { AvatarMenuData } from './AvatarMenuProvider'

interface Props {
  open: boolean
  onClose: () => void
  data: AvatarMenuData
}

// Sheet UI is filled in by Task 6 + 7. For Task 1 we only need the component
// to exist so AvatarMenuProvider type-checks. Returning null is intentional —
// no visible change yet.
export function AvatarMenuSheet({ open }: Props) {
  if (!open) return null
  return null
}
