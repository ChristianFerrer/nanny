'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, Plus, ChevronRight, Baby, Users2, Home, Copy, Check, MessageCircle, Share2, User as UserIcon, AlertTriangle } from 'lucide-react';
import { getFamily, getParents, getChildren, resetFamilyCache } from '@/lib/store';
import { clearCachedChat } from '@/lib/chat-cache';
import { getSupabase } from '@/lib/supabase';
import type { Family, Parent, Child } from '@/lib/types';
import { formatAge } from '@/lib/age';
import DetailHeader from '@/components/DetailHeader';

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
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [inviteError, setInviteError] = useState('');

  const handleInviteByEmail = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    setInviteStatus('sending');
    setInviteError('');
    try {
      const res = await fetch('/api/invite-partner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setInviteStatus('sent');
        setInviteEmail('');
        setTimeout(() => setInviteStatus('idle'), 4000);
      } else {
        setInviteStatus('error');
        setInviteError(
          data.code === 'INVALID_EMAIL' ? 'Email inválido'
          : data.code === 'SELF_INVITE' ? 'Ese es tu propio correo'
          : data.code === 'ALREADY_MEMBER' ? 'Ese correo ya está en tu familia'
          : 'No se pudo guardar la invitación'
        );
      }
    } catch {
      setInviteStatus('error');
      setInviteError('Sin conexión. Intentalo de nuevo.');
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      const res = await fetch('/api/reset-user', { method: 'POST' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Reset failed');
      const supabase = getSupabase();
      await supabase.auth.signOut();
      resetFamilyCache();
      clearCachedChat();
      window.location.href = '/login';
    } catch (err) {
      alert(`No se pudieron borrar los datos: ${err instanceof Error ? err.message : 'error desconocido'}`);
      setResetting(false);
      setConfirmReset(false);
    }
  };

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
    clearCachedChat(); // localStorage del chat — evita leak entre cuentas
    window.location.href = '/login';
  };

  // Escape cierra el dialog de logout
  useEffect(() => {
    if (!confirmLogout) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirmLogout(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmLogout]);

  // Escape cierra el dialog de reset (respeta el guard de resetting)
  useEffect(() => {
    if (!confirmReset) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !resetting) setConfirmReset(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmReset, resetting]);

  if (loading || !family) {
    return (
      <div className="min-h-dvh bg-white">
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
    <div className="min-h-dvh bg-white pb-24 page-enter">
      <DetailHeader title={family.name} subtitle="Configuración" />

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
              <span className="text-subhead text-[var(--text-tertiary)] truncate max-w-[55%] text-right tabular-nums">
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
                <span className={`size-10 rounded-full flex items-center justify-center shrink-0 ${p.role === 'mama' ? 'bg-pink-100' : 'bg-blue-100'}`}>
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
                    className="size-10 rounded-full flex items-center justify-center text-headline font-semibold text-white shrink-0"
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
            <p className="text-footnote text-pretty text-[var(--text-tertiary)]">
              Invita por correo y tu pareja se unirá automáticamente al crear su cuenta con ese email — aunque no abra el enlace.
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                inputMode="email"
                autoComplete="off"
                value={inviteEmail}
                onChange={(e) => { setInviteEmail(e.target.value); if (inviteStatus !== 'idle') setInviteStatus('idle'); }}
                placeholder="correo de tu pareja"
                aria-label="Correo de tu pareja"
                className={`flex-1 ${inviteStatus === 'error' ? 'input-error' : ''}`}
              />
              <button
                onClick={handleInviteByEmail}
                disabled={inviteStatus === 'sending' || !inviteEmail.trim()}
                className="btn btn-primary"
                style={{ flexShrink: 0 }}
              >
                {inviteStatus === 'sending' ? 'Enviando…' : 'Invitar'}
              </button>
            </div>
            {inviteStatus === 'sent' && (
              <p className="text-footnote" style={{ color: 'var(--success)' }}>
                Listo. Cuando tu pareja cree su cuenta con ese correo, se unirá a la familia.
              </p>
            )}
            {inviteStatus === 'error' && (
              <p className="text-footnote" style={{ color: 'var(--danger)' }}>{inviteError}</p>
            )}

            <div className="flex items-center gap-2">
              <div className="flex-1 h-px" style={{ background: 'var(--gray-200)' }} />
              <span className="text-caption-2" style={{ color: 'var(--text-tertiary)' }}>o comparte el enlace</span>
              <div className="flex-1 h-px" style={{ background: 'var(--gray-200)' }} />
            </div>
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
            <p className="text-caption text-pretty text-[var(--text-tertiary)]">
              Nanny revisa el chat automáticamente cada noche para detectar lo que se le haya escapado durante el día. Si necesitás forzar una revisión ahora, podés hacerla desde el chat.
            </p>
            <button
              onClick={() => router.push('/chat?catchup=1')}
              className="btn btn-secondary btn-sm btn-block"
            >
              Re-analizar el chat ahora
            </button>

            <div className="pt-3 mt-1" style={{ borderTop: '1px solid var(--separator)' }}>
              <p className="text-caption text-pretty text-[var(--text-tertiary)] mb-2">
                Borrar todos los datos de esta familia (hijos, mensajes, eventos, rutinas, tareas). Esta acción no se puede deshacer.
              </p>
              <button
                onClick={() => setConfirmReset(true)}
                disabled={resetting}
                className="btn btn-sm btn-block"
                style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
              >
                {resetting ? 'Borrando…' : 'Reiniciar mis datos'}
              </button>
            </div>
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
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[var(--z-dialog)] w-[88%] max-w-[340px] bg-[var(--bg-elevated)] rounded-2xl shadow-xl animate-scale-in p-5"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="logout-title"
            aria-describedby="logout-desc"
          >
            <div className="size-12 mx-auto rounded-full bg-[var(--danger-soft)] flex items-center justify-center mb-3">
              <AlertTriangle size={20} className="text-[var(--danger)]" />
            </div>
            <h3 id="logout-title" className="text-headline text-balance text-center text-[var(--text-primary)]">
              ¿Cerrar sesión?
            </h3>
            <p id="logout-desc" className="text-footnote text-pretty text-center text-[var(--text-tertiary)] mt-1">
              Tendrás que volver a iniciar sesión para acceder a tu familia.
            </p>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setConfirmLogout(false)}
                className="btn btn-secondary flex-1"
                disabled={loggingOut}
                autoFocus
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

      {/* Confirm reset (borrar todo) — separado del logout, doble peligro */}
      {confirmReset && (
        <>
          <div className="sheet-backdrop" onClick={() => !resetting && setConfirmReset(false)} />
          <div
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[var(--z-dialog)] w-[88%] max-w-[340px] bg-[var(--bg-elevated)] rounded-2xl shadow-xl animate-scale-in p-5"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="reset-title"
            aria-describedby="reset-desc"
          >
            <div className="size-12 mx-auto rounded-full bg-[var(--danger-soft)] flex items-center justify-center mb-3">
              <AlertTriangle size={20} className="text-[var(--danger)]" />
            </div>
            <h3 id="reset-title" className="text-headline text-balance text-center text-[var(--text-primary)]">
              ¿Borrar TODOS los datos?
            </h3>
            <p id="reset-desc" className="text-footnote text-pretty text-center text-[var(--text-tertiary)] mt-1">
              Se eliminarán los hijos, eventos, tareas, rutinas, mensajes y tu cuenta. Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setConfirmReset(false)}
                className="btn btn-secondary flex-1"
                disabled={resetting}
                autoFocus
              >
                Cancelar
              </button>
              <button
                onClick={handleReset}
                disabled={resetting}
                className="btn btn-destructive flex-1"
              >
                {resetting ? 'Borrando…' : 'Sí, borrar todo'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
