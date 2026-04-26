'use client';

import { InputHTMLAttributes, forwardRef, useId } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, id, className = '', ...rest },
  ref,
) {
  const reactId = useId();
  const inputId = id ?? reactId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  const inputClass = [error ? 'input-error' : '', className].filter(Boolean).join(' ');

  return (
    <div>
      {label && (
        <label
          htmlFor={inputId}
          className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider"
        >
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={!!error || undefined}
        aria-describedby={describedBy}
        className={inputClass}
        {...rest}
      />
      {error ? (
        <p id={`${inputId}-error`} className="mt-1.5 text-footnote text-[var(--danger)]">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1.5 text-footnote text-[var(--text-tertiary)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
