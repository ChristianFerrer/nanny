'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'tinted' | 'destructive';
type Size = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  loading?: boolean;
}

const variantClass: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  tinted: 'btn-tinted',
  destructive: 'btn-destructive',
};

const sizeClass: Record<Size, string> = {
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
  icon: 'btn-icon',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', block, loading, disabled, className = '', children, ...rest },
  ref,
) {
  const classes = [
    'btn',
    variantClass[variant],
    sizeClass[size],
    block ? 'btn-block' : '',
    'focus-ring',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button ref={ref} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="animate-spin-slow inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full" /> : children}
    </button>
  );
});
