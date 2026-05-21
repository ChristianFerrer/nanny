'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';

// Detecta scroll en cualquier contenedor de la página (captura en fase
// capture, así sirve tanto para <main> de las tabs como para el contenedor
// de mensajes del chat) y devuelve si se pasó el umbral.
function useScrolled(enabled: boolean, threshold = 16) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const onScroll = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t && typeof t.scrollTop === 'number') setScrolled(t.scrollTop > threshold);
    };
    document.addEventListener('scroll', onScroll, true);
    return () => document.removeEventListener('scroll', onScroll, true);
  }, [enabled, threshold]);
  return scrolled;
}

/**
 * Header consistente de las 4 tabs: logo de Nanny a la izquierda, título +
 * subtítulo gris, y un slot de acciones a la derecha. Con `collapsible`, el
 * header se compacta suavemente al scrollear (título y logo más chicos, se
 * oculta el subtítulo) y se expande al volver arriba. NO usar en páginas de
 * detalle/edición (tienen flecha de volver a la izquierda).
 */
export default function PageHeader({
  title,
  subtitle,
  right,
  collapsible = false,
}: {
  title: string;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  collapsible?: boolean;
}) {
  const compact = useScrolled(collapsible);
  const ease = 'var(--ease-out)';

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5 min-w-0">
        <div
          className="relative rounded-[10px] overflow-hidden shrink-0"
          style={{
            width: compact ? 34 : 40,
            height: compact ? 34 : 40,
            background: 'var(--nanny-purple)',
            transition: `width .25s ${ease}, height .25s ${ease}`,
          }}
        >
          <Image src="/icon-192.png" alt="Nanny" fill sizes="40px" className="object-cover" />
        </div>
        <div className="min-w-0">
          <h1
            className="text-[var(--text-primary)] font-bold truncate"
            style={{
              fontSize: compact ? 22 : 34,
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              transition: `font-size .25s ${ease}`,
            }}
          >
            {title}
          </h1>
          {subtitle != null && subtitle !== '' && (
            <p
              className="text-footnote text-[var(--text-secondary)] truncate"
              style={{
                maxHeight: compact ? 0 : 22,
                opacity: compact ? 0 : 1,
                marginTop: compact ? 0 : 2,
                overflow: 'hidden',
                transition: `max-height .25s ${ease}, opacity .25s ${ease}, margin-top .25s ${ease}`,
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {right != null && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </div>
  );
}
