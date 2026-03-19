'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bot, Mail, Lock, ArrowRight, UserPlus, LogIn } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';

type Mode = 'login' | 'register';

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
  const inviteFamilyId = searchParams.get('invite');
  const [mode, setMode] = useState<Mode>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetStatus, setResetStatus] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = getSupabase();

    if (mode === 'register') {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });
      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }
      // If user already exists, signUp succeeds but no session is created
      // In that case, try signing in instead
      if (!signUpData.session) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) {
          setError('Este email ya tiene cuenta. Verifica tu contraseña.');
          setLoading(false);
          return;
        }
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
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

    // After auth, get the current session user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Fallback: try getting from session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setError('No se pudo iniciar sesión. Intenta de nuevo.');
        setLoading(false);
        return;
      }
    }

    // If invite link, join the existing family
    if (inviteFamilyId) {
      try {
        const joinRes = await fetch('/api/join-family', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ familyId: inviteFamilyId }),
        });
        const joinData = await joinRes.json();
        if (joinData.success) {
          router.replace('/chat');
          return;
        }
      } catch {
        // Fall through to normal check
      }
    }

    // Check if user has a family using admin API (bypasses RLS)
    try {
      const res = await fetch('/api/check-family');
      const { hasFamily } = await res.json();
      router.replace(hasFamily ? '/chat' : '/onboarding');
    } catch {
      router.replace('/onboarding');
    }
  };

  return (
    <div className="min-h-[100dvh] bg-white flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs animate-fade-in">
        <div className="flex flex-col items-center mb-8">
          <div className="w-24 h-24 rounded-full bg-[var(--nanny-purple)] flex items-center justify-center mb-5">
            <Bot size={48} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold">Bienvenido a Nanny</h1>
          <p className="text-sm text-[var(--nanny-gray)] mt-2 text-center max-w-[250px]">
            {inviteFamilyId
              ? 'Crea tu cuenta para unirte a la familia.'
              : 'Organiza la vida de tus hijos desde el chat.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--nanny-gray)]" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-[var(--nanny-purple-light)] outline-none"
            />
          </div>

          <div className="relative">
            <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--nanny-gray)]" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña"
              required
              minLength={6}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-[var(--nanny-purple-light)] outline-none"
            />
          </div>

          {error && (
            <p className="text-sm text-[var(--nanny-red)] text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-[var(--nanny-purple)] text-white py-3.5 rounded-xl font-medium text-sm disabled:opacity-40"
          >
            {loading ? (
              'Cargando...'
            ) : mode === 'login' ? (
              <>Entrar <LogIn size={16} /></>
            ) : (
              <>Crear cuenta <UserPlus size={16} /></>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          {mode === 'login' ? (
            <p className="text-sm text-[var(--nanny-gray)]">
              ¿No tienes cuenta?{' '}
              <button
                onClick={() => { setMode('register'); setError(''); }}
                className="text-[var(--nanny-purple)] font-medium"
              >
                Regístrate
              </button>
            </p>
          ) : (
            <p className="text-sm text-[var(--nanny-gray)]">
              ¿Ya tienes cuenta?{' '}
              <button
                onClick={() => { setMode('login'); setError(''); }}
                className="text-[var(--nanny-purple)] font-medium"
              >
                Inicia sesión
              </button>
            </p>
          )}
        </div>
        {/* Reset button for testing */}
        {email && (
          <div className="mt-8 pt-4 border-t border-gray-100">
            <button
              type="button"
              disabled={!!resetStatus}
              onClick={async () => {
                if (!confirm(`¿Borrar TODOS los datos de ${email}? Esta acción no se puede deshacer.`)) return;
                setResetStatus('Borrando...');
                try {
                  const res = await fetch('/api/reset-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email }),
                  });
                  const data = await res.json();
                  if (data.success) {
                    setResetStatus('Datos borrados. Puedes registrarte de nuevo.');
                    // Sign out locally
                    await getSupabase().auth.signOut();
                  } else {
                    setResetStatus(data.error || 'Error al borrar');
                  }
                } catch {
                  setResetStatus('Error de conexión');
                }
                setTimeout(() => setResetStatus(''), 4000);
              }}
              className="w-full text-xs text-[var(--nanny-gray)] py-2 hover:text-[var(--nanny-red)] transition-colors"
            >
              {resetStatus || `Reiniciar datos de ${email}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
