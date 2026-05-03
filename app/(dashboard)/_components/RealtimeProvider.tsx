'use client'

import { createContext, useCallback, useContext, useEffect, useRef } from 'react'
import type { REALTIME_SUBSCRIBE_STATES } from '@supabase/realtime-js'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeEvent, TxnRowPayload, SettleRowPayload } from '@/lib/realtime/event'

type Handler = (event: RealtimeEvent) => void

interface BusContextValue {
  subscribe: (handler: Handler) => () => void  // returns unsubscribe fn
}

const BusContext = createContext<BusContextValue | null>(null)

/** Subscribe a handler. Returns an unsubscribe; call from useEffect cleanup. */
export function useRealtimeEvents(handler: Handler) {
  const ctx = useContext(BusContext)
  // Stash handler in a ref so we don't re-subscribe on every render.
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!ctx) return
    return ctx.subscribe((e) => handlerRef.current(e))
  }, [ctx])
}

interface Props {
  groupId: string
  children: React.ReactNode
}

export function RealtimeProvider({ groupId, children }: Props) {
  const handlersRef = useRef<Set<Handler>>(new Set())

  const subscribe = useCallback<BusContextValue['subscribe']>((handler) => {
    handlersRef.current.add(handler)
    return () => { handlersRef.current.delete(handler) }
  }, [])

  const dispatch = useCallback((event: RealtimeEvent) => {
    handlersRef.current.forEach((h) => h(event))
  }, [])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`group:${groupId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'CashTransactions', filter: `group_id=eq.${groupId}` },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          if (payload.eventType === 'INSERT') {
            dispatch({ kind: 'txn-insert', row: rowFromPayload(payload.new as Record<string, unknown>) as TxnRowPayload })
          } else if (payload.eventType === 'UPDATE') {
            dispatch({ kind: 'txn-update', row: rowFromPayload(payload.new as Record<string, unknown>) as TxnRowPayload })
          }
          // DELETE: we soft-delete, so DELETE events shouldn't fire. Hard delete via pg_cron fires DELETE
          // but those rows are >1yr stale and likely already off-screen. Ignore.
        })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'Settlements', filter: `group_id=eq.${groupId}` },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          if (payload.eventType === 'INSERT') {
            dispatch({ kind: 'settle-insert', row: rowFromPayload(payload.new as Record<string, unknown>) as SettleRowPayload })
          } else if (payload.eventType === 'UPDATE') {
            dispatch({ kind: 'settle-update', row: rowFromPayload(payload.new as Record<string, unknown>) as SettleRowPayload })
          }
        })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'GroupBalance', filter: `group_id=eq.${groupId}` },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const b = payload.new as { balance: number; version: number }
          dispatch({ kind: 'balance-change', balance: b.balance, version: b.version })
        })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'OikosGroups', filter: `id=eq.${groupId}` },
        () => {
          dispatch({ kind: 'group-updated' })
        })

    let wasSubscribed = false
    channel.subscribe((status: REALTIME_SUBSCRIBE_STATES) => {
      if (status === 'SUBSCRIBED') {
        if (wasSubscribed) {
          // This is a re-subscribe after a disconnect — tell subscribers to refetch.
          dispatch({ kind: 'reconnect' })
        }
        wasSubscribed = true
      }
    })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [groupId, dispatch])

  return <BusContext.Provider value={{ subscribe }}>{children}</BusContext.Provider>
}

/**
 * Postgres realtime payloads use snake_case column names. Convert to camelCase to
 * match the rest of the app. Timestamps come in as ISO strings already.
 */
function rowFromPayload(raw: Record<string, unknown>): unknown {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw)) {
    const camel = k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
    out[camel] = v
  }
  return out
}
