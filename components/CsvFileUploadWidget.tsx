'use client'

import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
  type RefObject,
} from 'react'

interface CsvFileUploadWidgetProps {
  onFile: (file: File) => void
  loading?: boolean
  error?: string
  onRetry?: () => void
  accept?: string
  promptText: string
  buttonText: string
  loadingText?: string
  retryText?: string
  icon?: ReactNode
  hint?: ReactNode
  size?: 'sm' | 'md'
  /** Optional external ref to the file input — pass when the caller needs to
   *  clear `input.value` from outside (e.g. retrying from a sibling preview card). */
  inputRef?: RefObject<HTMLInputElement | null>
}

interface Variant {
  label: string
  prompt: string
  button: string
  buttonStyle: CSSProperties
  errorWrap: string
  errorStyle: CSSProperties
  errorRetry: string
  errorBodySpacing?: string
}

const VARIANTS: Record<'sm' | 'md', Variant> = {
  sm: {
    label: 'block cursor-pointer rounded-2xl px-6 py-9 text-center transition-colors',
    prompt: 'text-meta mb-3',
    button:
      'inline-flex items-center justify-center h-11 px-5 rounded-xl text-white text-sm font-medium',
    buttonStyle: {
      background: 'var(--btn-primary-bg)',
      letterSpacing: '0.4px',
    },
    errorWrap: 'rounded-xl px-4 py-3 text-sm text-center',
    errorStyle: {
      background: 'var(--surface)',
      border: '1px solid var(--hairline)',
      color: 'var(--debit)',
    },
    errorRetry: 'mt-2 underline cursor-pointer text-xs',
  },
  md: {
    label: 'block cursor-pointer rounded-2xl px-6 py-10 md:py-12 text-center transition-colors',
    prompt: 'text-base mb-3',
    button:
      'inline-flex items-center justify-center h-11 px-6 rounded-xl text-white text-meta font-medium',
    buttonStyle: {
      background: 'var(--btn-primary-bg)',
      letterSpacing: '0.6px',
      boxShadow: '0 10px 24px -10px rgba(58, 36, 25, 0.4)',
    },
    errorWrap: 'rounded-2xl px-5 py-4 text-meta text-center',
    errorStyle: {
      background: 'var(--surface)',
      border: '1px solid var(--hairline)',
      color: 'var(--ink)',
    },
    errorRetry: 'underline cursor-pointer',
    errorBodySpacing: 'mb-3',
  },
}

export function CsvFileUploadWidget({
  onFile,
  loading = false,
  error,
  onRetry,
  accept = '.csv,text/csv',
  promptText,
  buttonText,
  loadingText,
  retryText,
  icon,
  hint,
  size = 'sm',
  inputRef: providedRef,
}: CsvFileUploadWidgetProps) {
  const inputId = useId()
  const fallbackRef = useRef<HTMLInputElement>(null)
  const inputRef = providedRef ?? fallbackRef
  const [isDragging, setIsDragging] = useState(false)
  const v = VARIANTS[size]

  function pickFile(file: File | undefined | null) {
    if (!file) return
    onFile(file)
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setIsDragging(false)
    pickFile(e.dataTransfer.files?.[0])
  }

  function handleRetry() {
    if (inputRef.current) inputRef.current.value = ''
    onRetry?.()
  }

  return (
    <>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={v.label}
        style={{
          background: isDragging ? 'var(--surface-alt)' : 'var(--surface)',
          border: `1px dashed ${isDragging ? 'var(--ink-2)' : 'var(--ink-3)'}`,
          color: 'var(--ink-2)',
        }}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
        {icon}
        <div className={v.prompt}>{promptText}</div>
        <span className={v.button} style={v.buttonStyle}>
          {loading ? (loadingText ?? buttonText) : buttonText}
        </span>
        {hint}
      </label>

      {error && (
        <div className={v.errorWrap} style={v.errorStyle}>
          <p className={v.errorBodySpacing}>{error}</p>
          {onRetry && (
            <button
              type="button"
              onClick={handleRetry}
              className={v.errorRetry}
              style={{ color: 'var(--ink-2)' }}
            >
              {retryText ?? 'Retry'}
            </button>
          )}
        </div>
      )}
    </>
  )
}
