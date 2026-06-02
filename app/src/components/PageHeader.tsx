import Image from 'next/image';

/**
 * Header consistente de las 4 tabs: logo de Nanny a la izquierda, título +
 * subtítulo gris opcional, y un slot de acciones a la derecha. Estático (sin
 * colapso al scroll). NO usar en páginas de detalle/edición — ésas tienen
 * flecha de volver a la izquierda, donde el logo chocaría.
 */
export default function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="relative size-9 rounded-[9px] overflow-hidden shrink-0"
            style={{ background: 'var(--nanny-purple)' }}
          >
            <Image src="/icon-192.png" alt="Nanny" fill sizes="36px" className="object-cover" />
          </div>
          <h1 className="text-large-title leading-none text-[var(--text-primary)] truncate">{title}</h1>
        </div>
        {subtitle != null && subtitle !== '' && (
          <p className="text-footnote text-[var(--text-secondary)] truncate mt-1.5 pl-[46px]">{subtitle}</p>
        )}
      </div>
      {right != null && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </div>
  );
}
