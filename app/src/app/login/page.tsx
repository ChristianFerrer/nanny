'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Baby, Mail, Lock, ArrowRight, UserPlus, LogIn } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';

type Mode = 'login' | 'register';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
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
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });
      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
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

    // After auth, check if user has a family
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Error al obtener usuario');
      setLoading(false);
      return;
    }

    const { data: parent } = await supabase
      .from('parents')
      .select('family_id')
      .eq('auth_user_id', user.id)
      .limit(1)
      .single();

    if (parent) {
      router.replace('/chat');
    } else {
      router.replace('/onboarding');
    }
  };

  return (
    <div className="min-h-[100dvh] bg-white flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs animate-fade-in">
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-full bg-[var(--nanny-purple-bg)] flex items-center justify-center mb-4">
            <Baby size={40} className="text-[var(--nanny-purple)]" />
          </div>
          <h1 className="text-2xl font-bold">Nanny</h1>
          <p className="text-sm text-[var(--nanny-gray)] mt-1">
            {mode === 'login' ? 'Inicia sesión para continuar' : 'Crea tu cuenta'}
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
      </div>
    </div>
  );
}
