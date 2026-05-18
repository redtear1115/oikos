'use client'

import { useCallback, useState } from 'react'
import {
  computeStats,
  decodeBytes,
  detectSource,
  parseCsv,
  type CsvRow,
  type CsvStats,
  type DetectedEncoding,
  type MigrateSource,
} from './csv'

export type CsvPreviewStatus = 'idle' | 'parsing' | 'ready' | 'error'

export interface CsvPreviewState {
  status: CsvPreviewStatus
  file: File | null
  headers: string[]
  rows: CsvRow[]
  detectedSource: MigrateSource
  encoding: DetectedEncoding | null
  stats: CsvStats | null
  error: string | null
}

const INITIAL: CsvPreviewState = {
  status: 'idle',
  file: null,
  headers: [],
  rows: [],
  detectedSource: 'unknown',
  encoding: null,
  stats: null,
  error: null,
}

/**
 * Parses an uploaded CSV file fully in the browser. No bytes leave the device —
 * the /migrate pages are anonymous SEO entries; account creation + the real
 * import flow live behind auth. `hint` lets the caller bias the page towards
 * a known source (e.g. /migrate/honeydue passes 'honeydue') when the header
 * sniffer can't tell.
 */
export function useCsvPreview({ hint = 'unknown' }: { hint?: MigrateSource } = {}) {
  const [state, setState] = useState<CsvPreviewState>(INITIAL)

  const load = useCallback(async (file: File) => {
    setState({ ...INITIAL, status: 'parsing', file })
    try {
      const buffer = await file.arrayBuffer()
      const { text, encoding } = decodeBytes(buffer)
      const { headers, rows } = parseCsv(text)
      const sniffed = detectSource(headers)
      const detectedSource = sniffed !== 'unknown' ? sniffed : hint
      const stats = computeStats(rows)
      setState({
        status: 'ready',
        file,
        headers,
        rows,
        detectedSource,
        encoding,
        stats,
        error: null,
      })
    } catch (err) {
      setState({
        ...INITIAL,
        status: 'error',
        file,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }, [hint])

  const reset = useCallback(() => setState(INITIAL), [])

  return { ...state, load, reset }
}
