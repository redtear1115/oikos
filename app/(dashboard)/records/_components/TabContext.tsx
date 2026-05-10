'use client'

import { createContext, useContext } from 'react'

export type RecordsTab = 'all' | 'expense' | 'income'

const TabContext = createContext<RecordsTab>('all')

export const TabProvider = TabContext.Provider

/** Read the current Records tab from the surrounding RecordsList. Defaults to
 *  `'all'` if used outside a provider — keeps the context optional for tests. */
export function useRecordsTab(): RecordsTab {
  return useContext(TabContext)
}
