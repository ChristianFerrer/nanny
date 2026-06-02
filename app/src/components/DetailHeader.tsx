'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

/**
 * Header consistente para páginas de detalle/edición: flecha de volver a la
 * izquierda (patrón de navegación, decisión 11), título grande + subtítulo
 * gris opcional, y un slot de acciones a la derecha. Estático. Las 4 tabs
 * usan PageHeader (logo); estas pantallas usan la flecha en su lugar.
 */
export default function DetailHeader({
  title,
  subtitle,
  right,
  onBack,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  onBack?: () => void;
}) {
  const router = useRouter();
  return (
    <header className="px-5 pt-header pb-1">
      <div className="flex items-center justify-between min-h-10">
        <button
          onClick={onBack ?? (() => router.back())}
          aria-label="Volver"
          className="size-10 -ml-2 rounded-full flex items-center justify-center text-[var(--text-secondary)] focus-ring tap-highlight"
        >
          <ArrowLeft size={26} />
        </button>
        {right != null && <div className="flex items-center gap-2 shrink-0">{right}</div>}
      </div>
      <div className="mt-1.5 min-w-0">
        <h1 className="text-large-title leading-[1.05] text-[var(--text-primary)] text-balance truncate">{title}</h1>
        {subtitle != null && subtitle !== '' && (
          <p className="text-footnote text-[var(--text-secondary)] truncate mt-0.5">{subtitle}</p>
        )}
      </div>
    </header>
  );
}
