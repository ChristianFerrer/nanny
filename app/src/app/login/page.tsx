'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Baby, Mail, Lock, ArrowRight, UserPlus, LogIn } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';

type Mode = 'login' | 'register';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
          <div className="w-24 h-24 rounded-full bg-[var(--nanny-purple-bg)] flex items-center justify-center mb-5">
            <Baby size={48} className="text-[var(--nanny-purple)]" />
          </div>
          <h1 className="text-3xl font-bold">Bienvenido a Nanny</h1>
          <p className="text-sm text-[var(--nanny-gray)] mt-2 text-center max-w-[250px]">
            Organiza la vida de tus hijos desde el chat.
          </p>
        </div>

        {/* Social login buttons - placeholder for future OAuth */}
        {mode === 'register' && (
          <div className="space-y-2.5 mb-6">
            <button
              disabled
              className="w-full flex items-center justify-center gap-3 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-400 bg-gray-50 cursor-not-allowed"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-1.15.69-2.48 1.08-3.91 1.08-4.17 0-7.55-3.38-7.55-7.56 0-4.17 3.38-7.55 7.55-7.55 2.09 0 3.98.85 5.35 2.22l-2.17 2.17c-.83-.8-1.96-1.28-3.18-1.28-2.65 0-4.79 2.14-4.79 4.79s2.14 4.8 4.79 4.8c2.09 0 3.86-1.34 4.51-3.2h-4.51v-2.86h7.65c.09.52.14 1.06.14 1.62 0 3.13-1.69 5.77-4.23 7.12z"/></svg>
              Continuar con Google (pronto)
            </button>
            <button
              disabled
              className="w-full flex items-center justify-center gap-3 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-400 bg-gray-50 cursor-not-allowed"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
              Continuar con Apple (pronto)
            </button>
          </div>
        )}

        {mode === 'register' && (
          <div className="relative mb-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-3 text-[var(--nanny-gray)]">o continúa con email</span>
            </div>
          </div>
        )}

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
      </div>
    </div>
  );
}
