import { HTMLAttributes, ReactNode } from 'react';

type Variant = 'default' | 'flat' | 'elevated';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  children: ReactNode;
}

const variantClass: Record<Variant, string> = {
  default: 'card',
  flat: 'card-flat',
  elevated: 'card-elevated',
};

export function Card({ variant = 'default', className = '', children, ...rest }: CardProps) {
  return (
    <div className={`${variantClass[variant]} ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}
