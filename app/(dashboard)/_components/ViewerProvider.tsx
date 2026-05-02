'use client'

import { MemberProvider, type MemberContextValue } from './MemberContext'

interface Props {
  value: MemberContextValue
  children: React.ReactNode
}

export function ViewerProvider({ value, children }: Props) {
  return <MemberProvider value={value}>{children}</MemberProvider>
}
