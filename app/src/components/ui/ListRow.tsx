'use client';

import { ButtonHTMLAttributes, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

export interface ListRowProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'title'> {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  showChevron?: boolean;
}

export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  showChevron = true,
  className = '',
  ...rest
}: ListRowProps) {
  return (
    <button
      type="button"
      className={`list-row w-full text-left focus-ring ${className}`.trim()}
      {...rest}
    >
      {leading && <span className="shrink-0">{leading}</span>}
      <div className="flex-1 min-w-0">
        <p className="text-subhead text-[var(--text-primary)] truncate">{title}</p>
        {subtitle && (
          <p className="text-footnote text-[var(--text-tertiary)] truncate">{subtitle}</p>
        )}
      </div>
      {trailing}
      {showChevron && <ChevronRight size={16} className="text-[var(--text-quaternary)] shrink-0" />}
    </button>
  );
}
