'use client';

import Link from 'next/link';
import { ArrowLeft, BarChart3, Sparkles } from 'lucide-react';

export default function InsightsPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] pb-24 page-enter">
      <header className="px-5 pt-header pb-4">
        <Link href="/mas" className="inline-flex items-center gap-1 text-footnote text-[var(--nanny-purple)] mb-3">
          <ArrowLeft size={14} /> Más
        </Link>
        <h1 className="text-large-title text-[var(--text-primary)]">Insights</h1>
        <p className="text-footnote text-[var(--text-tertiary)] mt-0.5">
          Patrones y resumen familiar
        </p>
      </header>

      <div className="px-4">
        <div className="card text-center py-10 px-5">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-[var(--nanny-purple-tint)] flex items-center justify-center mb-3">
            <BarChart3 size={22} className="text-[var(--nanny-purple)]" />
          </div>
          <p className="text-subhead text-[var(--text-primary)]">Próximamente</p>
          <p className="text-footnote text-[var(--text-tertiary)] mt-1 max-w-[280px] mx-auto">
            Resumen semanal por hijo, distribución de tareas entre mamá y papá, eventos
            completados vs olvidados, conflictos pendientes — todo desde lo que pasa en el chat.
          </p>
          <p className="inline-flex items-center gap-1.5 text-caption text-[var(--text-quaternary)] mt-4">
            <Sparkles size={12} /> Fase 2 del roadmap
          </p>
        </div>
      </div>
    </div>
  );
}
