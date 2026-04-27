'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, Plus, ChevronRight, Baby, Users2, Home, Copy, Check, MessageCircle, Share2, User as UserIcon, AlertTriangle } from 'lucide-react';
import { getFamily, getParents, getChildren, resetFamilyCache } from '@/lib/store';
import { getSupabase } from '@/lib/supabase';
import type { Family, Parent, Child } from '@/lib/types';
import { formatAge } from '@/lib/age';

const TIMEZONE_LABELS: Record<string, string> = {
  'America/Argentina/Buenos_Aires': 'Argentina (GMT-3)',
  'America/Mexico_City': 'México CDMX (GMT-6)',
  'America/Bogota': 'Colombia (GMT-5)',
  'America/Lima': 'Perú (GMT-5)',
  'America/Santiago': 'Chile (GMT-3 / -4)',
  'America/Montevideo': 'Uruguay (GMT-3)',
  'America/Caracas': 'Venezuela (GMT-4)',
  'America/Guayaquil': 'Ecuador (GMT-5)',
  'America/La_Paz': 'Bolivia (GMT-4)',
  'America/Asuncion': 'Paraguay (GMT-3 / -4)',
  'America/Tegucigalpa': 'Honduras (GMT-6)',
  'America/Guatemala': 'Guatemala (GMT-6)',
  'America/El_Salvador': 'El Salvador (GMT-6)',
  'America/Costa_Rica': 'Costa Rica (GMT-6)',
  'America/Panama': 'Panamá (GMT-5)',
  'America/Santo_Domingo': 'República Dominicana (GMT-4)',
  'America/Havana': 'Cuba (GMT-5)',
  'America/New_York': 'EE.UU. Este (GMT-5)',
  'America/Los_Angeles': 'EE.UU. Pacífico (GMT-8)',
  'Europe/Madrid': 'España (GMT+1)',
};

function tzShortLabel(tz: string | null | undefined): string {
  if (!tz) return 'Argentina';
  return TIMEZONE_LABELS[tz] || tz;
}

export default function PerfilPage() {
  const router = useRouter();
  const [family, setFamily] = useState<Family | null>(null);
  const [parents, setParents] = useState<Parent[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [loggingOut, setLoggingOut] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [f, p, c] = await Promise.all([getFamily(), getParents(), getChildren()]);
      if (!f) {
        setLoadError(true);
        return;
      }
      setFamily(f);
      setParents(p);
      setChildren(c);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (loadError) router.replace('/login');
  }, [loadError, router]);

  const handleLogout = async () => {
    setLoggingOut(true);
    const supabase = getSupabase();
    await supabase.auth.signOut();
    resetFamilyCache();
    window.location.href = '/login';
  };

  if (loading || !family) {
    return (
      <div className="min-h-screen bg-white">
        <header className="px-5 pt-header pb-5">
          <div className="skeleton h-9 w-48 mb-2" />
          <div className="skeleton h-4 w-32" />
        </header>
        <div className="px-4 space-y-3">
          <div className="skeleton h-20 w-full rounded-2xl" />
          <div className="skeleton h-32 w-full rounded-2xl" />
          <div className="skeleton h-32 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-24 page-enter">
      <header className="px-5 pt-header pb-4">
        <h1 className="text-large-title text-[var(--text-primary)]">{family.name}</h1>
        <p className="text-footnote text-[var(--text-tertiary)] mt-0.5">Configuración familiar</p>
      </header>

      <div className="px-4 space-y-4">
        {/* Familia */}
        <section>
          <h2 className="text-caption text-[var(--text-tertiary)] mb-2 px-2 uppercase tracking-wider flex items-center gap-1.5">
            <Home size={12} /> Familia
          </h2>
          <div className="list-group">
            <Link href="/perfil/familia" className="list-row w-full focus-ring">
              <span className="text-subhead text-[var(--text-primary)] flex-1 text-left">Nombre</span>
              <span className="text-subhead text-[var(--text-tertiary)]">{family.name}</span>
              <ChevronRight size={16} className="text-[var(--text-quaternary)]" />
            </Link>
            <Link href="/perfil/familia" className="list-row w-full focus-ring">
              <span className="text-subhead text-[var(--text-primary)] flex-1 text-left">Zona horaria</span>
              <span className="text-subhead text-[var(--text-tertiary)] truncate max-w-[55%] text-right">
                {tzShortLabel(family.timezone)}
              </span>
              <ChevronRight size={16} className="text-[var(--text-quaternary)]" />
            </Link>
          </div>
        </section>

        {/* Padres */}
        <section>
          <h2 className="text-caption text-[var(--text-tertiary)] mb-2 px-2 uppercase tracking-wider flex items-center gap-1.5">
            <Users2 size={12} /> Padres
          </h2>
          <div className="list-group">
            {parents.map(p => (
              <Link key={p.id} href={`/perfil/padre/${p.id}`} className="list-row w-full text-left focus-ring">
                <span className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${p.role === 'mama' ? 'bg-pink-100' : 'bg-blue-100'}`}>
                  <UserIcon size={18} className={p.role === 'mama' ? 'text-pink-600' : 'text-blue-600'} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-subhead text-[var(--text-primary)] truncate">{p.name}</p>
                  <p className="text-footnote text-[var(--text-tertiary)]">{p.role === 'mama' ? 'Mamá' : 'Papá'}</p>
                </div>
                <ChevronRight size={16} className="text-[var(--text-quaternary)]" />
              </Link>
            ))}
          </div>
        </section>

        {/* Hijos */}
        <section>
          <div className="flex items-center justify-between px-2 mb-2">
            <h2 className="text-caption text-[var(--text-tertiary)] uppercase tracking-wider flex items-center gap-1.5">
              <Baby size={12} /> Hijos
            </h2>
            <Link href="/perfil/hijo/nuevo" className="text-caption text-[var(--nanny-purple)] font-semibold inline-flex items-center gap-1">
              <Plus size={12} /> Agregar
            </Link>
          </div>
          <div className="list-group">
            {children.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-footnote text-[var(--text-tertiary)]">Aún no hay hijos. Agrega el primero.</p>
              </div>
            ) : children.map(c => {
              const age = c.birth_date ? formatAge(c.birth_date) : null;
              return (
                <Link key={c.id} href={`/perfil/hijo/${c.id}`} className="list-row w-full text-left focus-ring">
                  <span
                    className="w-10 h-10 rounded-full flex items-center justify-center text-headline font-semibold text-white shrink-0"
                    style={{ background: c.color || 'var(--nanny-purple)' }}
                  >
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-subhead text-[var(--text-primary)] truncate">{c.name}</p>
                    <p className="text-footnote text-[var(--text-tertiary)] truncate">
                      {age ?? ''}{c.school ? ` · ${c.school}` : ''}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-[var(--text-quaternary)]" />
                </Link>
              );
            })}
          </div>
        </section>

        {/* Invitar pareja */}
        <section>
          <h2 className="text-caption text-[var(--text-tertiary)] mb-2 px-2 uppercase tracking-wider flex items-center gap-1.5">
            <Share2 size={12} /> Invitar pareja
          </h2>
          <div className="card space-y-3">
            <p className="text-footnote text-[var(--text-tertiary)]">
              Comparte el enlace para que tu pareja se una a la familia
            </p>
            <button
              onClick={() => {
                const inviteLink = `${window.location.origin}/login?invite=${family.id}`;
                const msg = `Estoy usando Nanny para organizar las cosas de los niños. Únete aquí: ${inviteLink}`;
                window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
              }}
              className="btn btn-block"
              style={{ background: '#25D366', color: '#fff' }}
            >
              <MessageCircle size={18} /> Invitar por WhatsApp
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/login?invite=${family.id}`);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="btn btn-secondary btn-block"
            >
              {copied ? <><Check size={18} className="text-[var(--success)]" /> Enlace copiado</> : <><Copy size={18} /> Copiar enlace</>}
            </button>
          </div>
        </section>

        {/* Avanzado */}
        <details className="text-footnote text-[var(--text-tertiary)]">
          <summary className="cursor-pointer py-2 px-1 select-none focus-ring rounded">
            Avanzado
          </summary>
          <div className="card mt-2 space-y-2">
            <p className="text-caption text-[var(--text-tertiary)]">
              Nanny revisa el chat automáticamente cada noche para detectar lo que se le haya escapado durante el día. Si necesitás forzar una revisión ahora, podés hacerla desde el chat.
            </p>
            <button
              onClick={() => router.push('/chat?catchup=1')}
              className="btn btn-secondary btn-sm btn-block"
            >
              Re-analizar el chat ahora
            </button>
          </div>
        </details>

        {/* Logout */}
        <button
          onClick={() => setConfirmLogout(true)}
          disabled={loggingOut}
          className="btn btn-block mt-2"
          style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
        >
          <LogOut size={16} /> {loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </button>
      </div>

      {/* Confirm logout dialog */}
      {confirmLogout && (
        <>
          <div className="sheet-backdrop" onClick={() => setConfirmLogout(false)} />
          <div
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[62] w-[88%] max-w-[340px] bg-[var(--bg-elevated)] rounded-2xl shadow-xl animate-scale-in p-5"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="logout-title"
          >
            <div className="w-12 h-12 mx-auto rounded-full bg-[var(--danger-soft)] flex items-center justify-center mb-3">
              <AlertTriangle size={20} className="text-[var(--danger)]" />
            </div>
            <h3 id="logout-title" className="text-headline text-center text-[var(--text-primary)]">
              ¿Cerrar sesión?
            </h3>
            <p className="text-footnote text-center text-[var(--text-tertiary)] mt-1">
              Tendrás que volver a iniciar sesión para acceder a tu familia.
            </p>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setConfirmLogout(false)}
                className="btn btn-secondary flex-1"
                disabled={loggingOut}
              >
                Cancelar
              </button>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="btn btn-destructive flex-1"
              >
                {loggingOut ? 'Saliendo…' : 'Cerrar sesión'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
