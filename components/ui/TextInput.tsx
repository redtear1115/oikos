'use client'

import { type ComponentPropsWithRef, type ReactNode } from 'react'

interface TextInputProps extends Omit<ComponentPropsWithRef<'input'>, 'className'> {
  leftAddon?: ReactNode
  rightAddon?: ReactNode
  error?: boolean
  /** Classes for the wrapper (width, margin, flex sizing). */
  className?: string
  /** Typographic classes for the `<input>` itself (`font-numeric`, `tnum`,
   *  `uppercase`). Text properties don't reach the input from the wrapper:
   *  form controls reset `text-transform` and feature settings. Not for
   *  height, border, radius or colour; those belong to the primitive. */
  inputClassName?: string
}

/**
 * The canonical single-line field (DESIGN.md "Inputs / Fields"): 44px tall,
 * `--radius-bubble`, hairline border, `--input-bg`, ember focus ring on the
 * wrapper. `ref` and every native attribute (`id`, `aria-*`, `inputMode`,
 * `autoComplete`) land on the `<input>`, so label association works exactly
 * as it would on a bare input.
 */
export function TextInput({
  leftAddon,
  rightAddon,
  error = false,
  className = '',
  inputClassName = '',
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
        // Fade the whole field, not just the text. `disabled:opacity-50` on
        // the `<input>` alone left the border and the addons at full strength,
        // so a disabled field (the renewal sheet's policy number while the
        // save runs, InsuranceListItem) read as an active input whose text had
        // simply gone faint. TextArea is one element, so its own
        // `disabled:opacity-50` already covers its border.
        rest.disabled ? 'opacity-50' : '',
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
          'disabled:cursor-default',
          inputClassName,
        ].filter(Boolean).join(' ')}
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
