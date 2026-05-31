import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { create, getNumericDate } from 'https://deno.land/x/djwt@v3.0.2/mod.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APNS_KEY_ID = Deno.env.get('APNS_KEY_ID')!
const APNS_TEAM_ID = Deno.env.get('APNS_TEAM_ID')!
const APNS_PRIVATE_KEY_PEM = Deno.env.get('APNS_PRIVATE_KEY_PEM')!
const APNS_BUNDLE_ID = 'dev.southernlight.futari'
const APNS_HOST = 'https://api.push.apple.com'

async function importApnsKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '')
  const binary = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0))
  return crypto.subtle.importKey(
    'pkcs8',
    binary.buffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )
}

async function buildApnsJwt(key: CryptoKey): Promise<string> {
  return create(
    { alg: 'ES256', kid: APNS_KEY_ID },
    { iss: APNS_TEAM_ID, iat: getNumericDate(0) },
    key
  )
}

async function sendApnsNotification(
  jwt: string,
  token: string,
  title: string,
  body: string
): Promise<number> {
  const payload = JSON.stringify({
    aps: {
      alert: { title, body },
      sound: 'default',
      badge: 1,
    },
  })

  const res = await fetch(`${APNS_HOST}/3/device/${token}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${jwt}`,
      'apns-topic': APNS_BUNDLE_ID,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    },
    body: payload,
  })

  if (!res.ok) {
    const err = await res.text()
    console.error(`[apns] failed token=${token.slice(0, 8)}… status=${res.status} err=${err}`)
  }
  return res.status
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const today = new Date().toISOString().slice(0, 10)

  const { data: groups, error: groupsErr } = await supabase
    .from('PendingExpenseOccurrences')
    .select('group_id')
    .lte('proposed_date', today)
    .is('skipped_at', null)
    .is('resolved_tx_id', null)

  if (groupsErr) {
    console.error('[push] query error', groupsErr)
    return new Response('error', { status: 500 })
  }

  const { data: incomeGroups } = await supabase
    .from('PendingIncomeOccurrences')
    .select('group_id')
    .lte('proposed_date', today)
    .is('skipped_at', null)
    .is('resolved_tx_id', null)

  const allGroupIds = [
    ...new Set([
      ...(groups ?? []).map(r => r.group_id),
      ...(incomeGroups ?? []).map(r => r.group_id),
    ])
  ]

  if (allGroupIds.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
  }

  const { data: tokens, error: tokenErr } = await supabase
    .from('PushTokens')
    .select('token')
    .in('group_id', allGroupIds)
    .eq('platform', 'apns')

  if (tokenErr || !tokens?.length) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
  }

  const key = await importApnsKey(APNS_PRIVATE_KEY_PEM)
  const jwt = await buildApnsJwt(key)

  const staleTokens: string[] = []
  let sent = 0
  for (const { token } of tokens) {
    const status = await sendApnsNotification(jwt, token, '有待確認的定期收支', '點開 Futari 確認本期帳目')
    if (status >= 200 && status < 300) sent++
    if (status === 410) staleTokens.push(token)
  }

  if (staleTokens.length > 0) {
    await supabase.from('PushTokens').delete().in('token', staleTokens)
  }

  return new Response(JSON.stringify({ sent }), { status: 200 })
})
