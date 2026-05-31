'use client'

import { type ButtonHTMLAttributes, type ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  loading?: boolean
  children: ReactNode
}

const variantBase: Record<ButtonVariant, string> = {
  primary:   'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] border-0',
  secondary: 'bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-text)] border border-[var(--btn-secondary-border)]',
  ghost:     'bg-transparent text-[var(--ink-2)] border-0',
  danger:    'bg-[var(--btn-destructive-bg)] text-[var(--btn-destructive-text)] border-0',
  accent:    'bg-[var(--btn-accent-bg)] text-[var(--btn-accent-text)] border-0',
}

const sizeBase: Record<ButtonSize, string> = {
  sm: 'h-[var(--control-sm)] px-4 text-sm',
  md: 'h-[var(--control-md)] px-5 text-base',
  lg: 'h-[var(--control-lg)] px-6 text-base',
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading

  return (
    <button
      type="button"
      disabled={isDisabled}
      aria-busy={loading}
      className={[
        'inline-flex items-center justify-center gap-2',
        'rounded-bubble font-medium cursor-pointer',
        'transition-opacity duration-150',
        'oik-btn',
        'disabled:opacity-40 disabled:cursor-default',
        'min-w-0 truncate',
        variantBase[variant],
        sizeBase[size],
        fullWidth && 'w-full',
        className,
      ].filter(Boolean).join(' ')}
      {...rest}
    >
      {loading ? (
        <>
          <span aria-hidden="true" className="opacity-60">···</span>
          <span className="sr-only">Loading</span>
        </>
      ) : children}
    </button>
  )
}
