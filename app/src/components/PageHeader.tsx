import Image from 'next/image';

/**
 * Header consistente de las 4 tabs principales: logo de Nanny a la izquierda,
 * título + subtítulo gris opcional, y un slot de acciones a la derecha.
 * `compact` baja la densidad (chat): logo + título más chicos para no robar
 * alto a la conversación. NO usar en páginas de detalle/edición — ésas tienen
 * flecha de volver a la izquierda, donde el logo chocaría.
 */
export default function PageHeader({
  title,
  subtitle,
  right,
  compact = false,
}: {
  title: string;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5 min-w-0">
        <div
          className={`relative ${compact ? 'size-9' : 'size-10'} rounded-[10px] overflow-hidden shrink-0`}
          style={{ background: 'var(--nanny-purple)' }}
        >
          <Image src="/icon-192.png" alt="Nanny" fill sizes="40px" className="object-cover" />
        </div>
        <div className="min-w-0">
          <h1 className={`${compact ? 'text-title-3' : 'text-large-title leading-[1.05]'} text-[var(--text-primary)] truncate`}>
            {title}
          </h1>
          {subtitle != null && subtitle !== '' && (
            <p className={`${compact ? 'text-caption' : 'text-footnote'} text-[var(--text-secondary)] truncate mt-0.5`}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {right != null && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </div>
  );
}
