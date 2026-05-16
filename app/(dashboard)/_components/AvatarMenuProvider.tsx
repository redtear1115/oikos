'use client'

import { createContext, useCallback, useContext, useState } from 'react'
import { AvatarMenuSheet } from './AvatarMenuSheet'

export interface AvatarMenuData {
  viewerEmail: string
  groupDefaultRatioA: number | null
  guardianBetaEnabled: boolean
  currentLocale: string
}

interface AvatarMenuApi {
  open: () => void
  close: () => void
  isOpen: boolean
}

const AvatarMenuContext = createContext<AvatarMenuApi | null>(null)

export function useAvatarMenu(): AvatarMenuApi {
  const ctx = useContext(AvatarMenuContext)
  if (!ctx) throw new Error('useAvatarMenu must be inside <AvatarMenuProvider>')
  return ctx
}

interface Props {
  data: AvatarMenuData
  children: React.ReactNode
}

export function AvatarMenuProvider({ data, children }: Props) {
  const [isOpen, setOpen] = useState(false)
  const open = useCallback(() => setOpen(true), [])
  const close = useCallback(() => setOpen(false), [])
  return (
    <AvatarMenuContext.Provider value={{ open, close, isOpen }}>
      {children}
      <AvatarMenuSheet open={isOpen} onClose={close} data={data} />
    </AvatarMenuContext.Provider>
  )
}
