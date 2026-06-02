'use client';

import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  hideCloseButton?: boolean;
  children: ReactNode;
  ariaLabel?: string;
}

export function Sheet({ open, onClose, title, hideCloseButton, children, ariaLabel }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : ariaLabel}>
        <div className="sheet-handle" />
        {(title || !hideCloseButton) && (
          <div className="sheet-header flex items-center justify-between">
            {title && <h2 className="text-title-3 text-[var(--text-primary)]">{title}</h2>}
            {!hideCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="w-9 h-9 rounded-full bg-[var(--gray-100)] flex items-center justify-center text-[var(--text-secondary)] focus-ring ml-auto"
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}
        <div className="sheet-body">{children}</div>
      </div>
    </>
  );
}
