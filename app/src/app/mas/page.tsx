'use client';

import Link from 'next/link';
import { Calendar, Users2, BarChart3, Settings, ChevronRight, LucideIcon } from 'lucide-react';

type Item = {
  href: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  available: boolean;
};

const items: Item[] = [
  { href: '/semana', icon: Calendar, title: 'Semana', subtitle: 'Plan de 7 días, conflictos', available: true },
  { href: '/red-apoyo', icon: Users2, title: 'Red de apoyo', subtitle: 'Abuela, niñera, contactos', available: false },
  { href: '/insights', icon: BarChart3, title: 'Insights', subtitle: 'Patrones y resumen familiar', available: false },
  { href: '/perfil', icon: Settings, title: 'Configuración', subtitle: 'Familia, integraciones, cuenta', available: true },
];

export default function MasPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] pb-24 page-enter">
      <header className="px-5 pt-14 pb-4">
        <h1 className="text-large-title text-[var(--text-primary)]">Más</h1>
        <p className="text-footnote text-[var(--text-tertiary)] mt-0.5">
          Vista semanal, red de apoyo, métricas y configuración
        </p>
      </header>

      <div className="px-4">
        <div className="list-group">
          {items.map(({ href, icon: Icon, title, subtitle, available }) => {
            const content = (
              <>
                <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--nanny-purple-tint)' }}>
                  <Icon size={18} className="text-[var(--nanny-purple)]" />
                </span>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-subhead text-[var(--text-primary)] flex items-center gap-2">
                    {title}
                    {!available && (
                      <span className="text-caption-2 px-1.5 py-0.5 rounded-md font-semibold" style={{ background: 'var(--gray-100)', color: 'var(--text-tertiary)' }}>
                        Próximamente
                      </span>
                    )}
                  </p>
                  <p className="text-footnote text-[var(--text-tertiary)] truncate">{subtitle}</p>
                </div>
                <ChevronRight size={16} className="text-[var(--text-quaternary)]" />
              </>
            );
            return available ? (
              <Link key={href} href={href} className="list-row w-full focus-ring">
                {content}
              </Link>
            ) : (
              <Link key={href} href={href} className="list-row w-full focus-ring opacity-90">
                {content}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
