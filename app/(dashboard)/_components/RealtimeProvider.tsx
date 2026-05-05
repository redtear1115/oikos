'use client'

import { createContext, useCallback, useContext, useEffect, useRef } from 'react'
import type { AuthChangeEvent, Session } from '@supabase/auth-js'
import type { REALTIME_SUBSCRIBE_STATES, RealtimePostgresChangesPayload } from '@supabase/realtime-js'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeEvent, TxnRowPayload, SettleRowPayload, AssetRowPayload } from '@/lib/realtime/event'

type PgPayload = RealtimePostgresChangesPayload<Record<string, unknown>>

type Handler = (event: RealtimeEvent) => void

interface BusContextValue {
  subscribe: (handler: Handler) => () => void  // returns unsubscribe fn
}

const BusContext = createContext<BusContextValue | null>(null)

/** Subscribe a handler. Returns an unsubscribe; call from useEffect cleanup. */
export function useRealtimeEvents(handler: Handler) {
  const ctx = useContext(BusContext)
  // Stash handler in a ref so we don't re-subscribe on every render — but update
  // the ref inside an effect (writing to refs during render is flagged by lint
  // and breaks under React's concurrent rendering).
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  }, [handler])

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
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false

    // We need a fresh user JWT BEFORE subscribing — the channel join carries the
    // token Supabase Realtime uses to evaluate auth.uid() inside RLS policies.
    // Subscribing before the session loads sends an anonymous join, RLS denies
    // every row, and no postgres_changes events ever reach the client.
    const setup = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (session) {
        supabase.realtime.setAuth(session.access_token)
      }

      channel = supabase
      .channel(`group:${groupId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'CashTransactions', filter: `group_id=eq.${groupId}` },
        (payload: PgPayload) => {
          if (payload.eventType === 'INSERT') {
            dispatch({ kind: 'txn-insert', row: rowFromPayload(payload.new) as TxnRowPayload })
          } else if (payload.eventType === 'UPDATE') {
            dispatch({ kind: 'txn-update', row: rowFromPayload(payload.new) as TxnRowPayload })
          }
          // DELETE: we soft-delete, so DELETE events shouldn't fire. Hard delete via pg_cron fires DELETE
          // but those rows are >1yr stale and likely already off-screen. Ignore.
        })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'Settlements', filter: `group_id=eq.${groupId}` },
        (payload: PgPayload) => {
          if (payload.eventType === 'INSERT') {
            dispatch({ kind: 'settle-insert', row: rowFromPayload(payload.new) as SettleRowPayload })
          } else if (payload.eventType === 'UPDATE') {
            dispatch({ kind: 'settle-update', row: rowFromPayload(payload.new) as SettleRowPayload })
          }
        })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'GroupBalance', filter: `group_id=eq.${groupId}` },
        (payload: PgPayload) => {
          const b = payload.new as { balance: number; version: number }
          dispatch({ kind: 'balance-change', balance: b.balance, version: b.version })
        })
      // OikosGroups UPDATE fires when member_b is set after invite acceptance.
      // Dispatch group-updated so Dashboard can router.refresh() and re-derive MemberContext.
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'OikosGroups', filter: `id=eq.${groupId}` },
        () => {
          dispatch({ kind: 'group-updated' })
        })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'Assets', filter: `group_id=eq.${groupId}` },
        (payload: PgPayload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            dispatch({ kind: 'asset-changed', row: rowFromPayload(payload.new) as AssetRowPayload })
          }
          // DELETE: we soft-delete; hard delete via pg_cron only happens >1yr later. Ignore.
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
    }

    setup()

    // Refresh the channel auth when the user's session changes (e.g. token refresh
    // after ~1 hour). Without this, the channel keeps using a stale JWT and RLS
    // starts denying once the token expires, even though our cookie session is
    // still valid.
    const { data: authSub } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (session) supabase.realtime.setAuth(session.access_token)
    })

    return () => {
      cancelled = true
      authSub.subscription.unsubscribe()
      if (channel) supabase.removeChannel(channel)
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
