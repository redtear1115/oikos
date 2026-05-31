'use client'

import { type InputHTMLAttributes, type ReactNode } from 'react'

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  leftAddon?: ReactNode
  rightAddon?: ReactNode
  error?: boolean
  className?: string
}

export function TextInput({
  leftAddon,
  rightAddon,
  error = false,
  className = '',
  ...rest
}: TextInputProps) {
  return (
    <div
      className={[
        'oik-input-wrapper',
        'flex items-center',
        'h-[var(--control-md)]',
        'rounded-bubble',
        'border',
        error
          ? 'border-[var(--destructive)]'
          : 'border-[var(--hairline)]',
        'bg-[var(--input-bg)]',
        className,
      ].filter(Boolean).join(' ')}
    >
      {leftAddon && (
        <span className="shrink-0 pl-3.5 text-base text-ink-2 select-none">
          {leftAddon}
        </span>
      )}
      <input
        className={[
          'flex-1 min-w-0 h-full bg-transparent',
          'px-3.5 text-base text-ink',
          'border-0 outline-none',
          'placeholder:text-ink-3',
          'disabled:opacity-50 disabled:cursor-default',
        ].join(' ')}
        {...rest}
      />
      {rightAddon && (
        <span className="shrink-0 pr-2 flex items-center">
          {rightAddon}
        </span>
      )}
    </div>
  )
}
