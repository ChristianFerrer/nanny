import Image from 'next/image';

/**
 * Header consistente de las 4 tabs principales: logo de Nanny a la izquierda,
 * título (formato large-title) + subtítulo gris opcional, y un slot de acciones
 * a la derecha (gear, etc.). NO usar en páginas de detalle/edición — ésas tienen
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
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="size-10 rounded-[11px] overflow-hidden shrink-0 flex items-center justify-center"
          style={{ background: 'var(--nanny-purple)' }}
        >
          <Image src="/icon-192.png" alt="Nanny" width={40} height={40} />
        </div>
        <div className="min-w-0">
          <h1 className="text-large-title text-[var(--text-primary)] leading-[1.05] truncate">{title}</h1>
          {subtitle != null && subtitle !== '' && (
            <p className="text-footnote text-[var(--text-secondary)] truncate mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {right != null && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </div>
  );
}
