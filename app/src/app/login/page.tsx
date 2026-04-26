'use client';

import { useState, Suspense, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Mail, Lock, AlertCircle, ArrowLeft, Check } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';

const PENDING_INVITE_KEY = 'nanny:pendingInvite';

type JoinResult =
  | { success: true; familyId: string }
  | { success: false; code?: string; error?: string };

async function joinFamilyWithRetry(familyId: string, maxAttempts = 3): Promise<JoinResult> {
  let lastError: { code?: string; error?: string } = {};
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 250 * Math.pow(2, attempt - 1)));
    }
    try {
      const res = await fetch('/api/join-family', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ familyId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        return { success: true, familyId: data.familyId };
      }
      lastError = { code: data.code, error: data.error };
      // Only the auth race is worth retrying; everything else fails fast.
      if (data.code !== 'NOT_AUTHENTICATED') break;
    } catch (e) {
      lastError = { code: 'NETWORK', error: String(e) };
    }
  }
  return { success: false, ...lastError };
}

type Mode = 'login' | 'register' | 'forgot';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryInvite = searchParams.get('invite');
  // Resolve invite synchronously: prefer URL, fall back to localStorage. Survives
  // email-confirmation redirects that might strip the query string.
  const [pendingInvite] = useState<string | null>(() => {
    if (queryInvite) return queryInvite;
    if (typeof window === 'undefined') return null;
    try { return window.localStorage.getItem(PENDING_INVITE_KEY); } catch { return null; }
  });
  const [mode, setMode] = useState<Mode>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  // Persist invite from URL so it survives later navigations.
  useEffect(() => {
    if (!queryInvite || typeof window === 'undefined') return;
    try { window.localStorage.setItem(PENDING_INVITE_KEY, queryInvite); } catch {}
  }, [queryInvite]);

  const inviteFamilyId = pendingInvite;

  const isDev = process.env.NODE_ENV === 'development';

  const passwordStrength = useMemo(() => {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 10) score++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) score++;
    return Math.min(score, 4);
  }, [password]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = getSupabase();

    if (mode === 'register') {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }
      if (!signUpData.session) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          setError('Este email ya tiene cuenta. Verifica tu contraseña.');
          setLoading(false);
          return;
        }
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(
          signInError.message === 'Invalid login credentials'
            ? 'Email o contraseña incorrectos'
            : signInError.message
        );
        setLoading(false);
        return;
      }
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setError('No se pudo iniciar sesión. Intenta de nuevo.');
        setLoading(false);
        return;
      }
    }

    if (inviteFamilyId) {
      // Retry join with small backoff: covers the case where session cookies
      // haven't propagated to the server immediately after signUp/signIn.
      const joinResult = await joinFamilyWithRetry(inviteFamilyId);
      if (joinResult.success) {
        try { window.localStorage.removeItem(PENDING_INVITE_KEY); } catch {}
        router.replace('/chat');
        return;
      }
      if (joinResult.code === 'NOT_AUTHENTICATED') {
        // Session lost — keep invite in storage and let /chat retry on first load
        router.replace('/chat');
        return;
      }
      if (joinResult.code === 'FAMILY_NOT_FOUND') {
        setError('El enlace de invitación ya no es válido. Pídele a tu pareja que te envíe uno nuevo.');
        try { window.localStorage.removeItem(PENDING_INVITE_KEY); } catch {}
        setLoading(false);
        return;
      }
      // Other errors: show but still allow access — chat will retry from storage
      setError('No pudimos vincularte a la familia. Lo intentaremos de nuevo al abrir el chat.');
      setLoading(false);
      router.replace('/chat');
      return;
    }

    router.replace('/chat');
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const supabase = getSupabase();
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (resetError) {
      setError(resetError.message);
      setLoading(false);
      return;
    }
    setForgotSent(true);
    setLoading(false);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setForgotSent(false);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 animate-fade-in">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <div
            className="w-[72px] h-[72px] rounded-[18px] overflow-hidden mb-5"
            style={{
              background: 'var(--nanny-purple)',
              boxShadow: '0 8px 24px rgba(124, 58, 237, 0.24), 0 2px 6px rgba(124, 58, 237, 0.16)',
            }}
          >
            <Image src="/icon-192.png" alt="Nanny" width={72} height={72} priority className="w-full h-full object-cover" />
          </div>
          <h1 className="text-title-1 text-center" style={{ color: 'var(--text-primary)' }}>
            {mode === 'forgot' ? 'Recupera tu cuenta' : 'Bienvenido a Nanny'}
          </h1>
          <p className="text-callout text-center mt-1.5 max-w-[280px]" style={{ color: 'var(--text-secondary)' }}>
            {mode === 'forgot'
              ? 'Te enviaremos un enlace a tu correo'
              : inviteFamilyId
              ? 'Crea tu cuenta para unirte a la familia'
              : 'Tú cuidas a tus hijos. Nanny cuida los detalles.'}
          </p>
        </div>

        {mode !== 'forgot' && (
          <div
            role="tablist"
            className="flex p-1 rounded-[14px] mb-6"
            style={{ background: 'var(--gray-100)' }}
          >
            {(['login', 'register'] as const).map(m => {
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => switchMode(m)}
                  className="flex-1 py-2.5 rounded-[10px] text-subhead transition-all"
                  style={{
                    background: active ? 'var(--bg-elevated)' : 'transparent',
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: active ? 600 : 500,
                    boxShadow: active ? 'var(--shadow-xs)' : 'none',
                  }}
                >
                  {m === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
                </button>
              );
            })}
          </div>
        )}

        {mode === 'forgot' && forgotSent ? (
          <div className="card animate-slide-up text-center" style={{ padding: '24px' }}>
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: 'var(--success-soft)' }}
            >
              <Check size={24} style={{ color: 'var(--success)' }} strokeWidth={2.5} />
            </div>
            <h2 className="text-headline mb-2">Revisa tu correo</h2>
            <p className="text-footnote" style={{ color: 'var(--text-secondary)' }}>
              Enviamos un enlace a <strong style={{ color: 'var(--text-primary)' }}>{email}</strong> para restablecer tu contraseña.
            </p>
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="btn btn-ghost btn-sm mt-5"
            >
              <ArrowLeft size={16} /> Volver a iniciar sesión
            </button>
          </div>
        ) : (
          <form onSubmit={mode === 'forgot' ? handleForgot : handleAuth} className="space-y-3">
            <div className="relative">
              <Mail
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-tertiary)' }}
              />
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                aria-label="Email"
                className={error ? 'input-error' : ''}
                style={{ paddingLeft: '46px' }}
              />
            </div>

            {mode !== 'forgot' && (
              <>
                <div className="relative">
                  <Lock
                    size={18}
                    className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'var(--text-tertiary)' }}
                  />
                  <input
                    type="password"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'register' ? 'Mínimo 6 caracteres' : 'Contraseña'}
                    required
                    minLength={6}
                    aria-label="Contraseña"
                    className={error ? 'input-error' : ''}
                    style={{ paddingLeft: '46px' }}
                  />
                </div>

                {mode === 'register' && password.length > 0 && (
                  <div className="px-1 animate-fade-in">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className="flex-1 h-[3px] rounded-full transition-colors"
                          style={{
                            background:
                              i <= passwordStrength
                                ? passwordStrength <= 1
                                  ? 'var(--danger)'
                                  : passwordStrength === 2
                                  ? 'var(--warning)'
                                  : 'var(--success)'
                                : 'var(--gray-200)',
                          }}
                        />
                      ))}
                    </div>
                    <p
                      className="text-caption-2 mt-1.5"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      {passwordStrength <= 1
                        ? 'Contraseña débil'
                        : passwordStrength === 2
                        ? 'Aceptable'
                        : passwordStrength === 3
                        ? 'Buena'
                        : 'Excelente'}
                    </p>
                  </div>
                )}

                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="block ml-auto px-1 py-1 text-footnote focus-ring rounded"
                    style={{ color: 'var(--nanny-purple)', fontWeight: 500 }}
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                )}
              </>
            )}

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 p-3 rounded-[12px] animate-slide-up"
                style={{ background: 'var(--danger-soft)' }}
              >
                <AlertCircle size={18} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} />
                <p className="text-footnote" style={{ color: '#C62828' }}>{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary btn-block"
              style={{ marginTop: '8px' }}
            >
              {loading
                ? 'Cargando…'
                : mode === 'forgot'
                ? 'Enviar enlace'
                : mode === 'login'
                ? 'Iniciar sesión'
                : 'Crear cuenta'}
            </button>

            {mode === 'forgot' && (
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="btn btn-ghost btn-block"
              >
                <ArrowLeft size={16} /> Volver
              </button>
            )}
          </form>
        )}

        {isDev && email && mode !== 'forgot' && (
          <div className="mt-10 pt-5" style={{ borderTop: '1px solid var(--separator)' }}>
            <p className="text-caption-2 text-center mb-2" style={{ color: 'var(--text-quaternary)' }}>
              Solo desarrollo
            </p>
            <button
              type="button"
              onClick={async () => {
                if (!confirm(`¿Borrar TODOS los datos de ${email}?`)) return;
                try {
                  const res = await fetch('/api/reset-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email }),
                  });
                  const data = await res.json();
                  if (data.success) {
                    await getSupabase().auth.signOut();
                    alert('Datos borrados. Puedes registrarte de nuevo.');
                  } else {
                    alert(data.error || 'Error al borrar');
                  }
                } catch {
                  alert('Error de conexión');
                }
              }}
              className="btn btn-secondary btn-sm btn-block"
            >
              Reiniciar datos de {email}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
