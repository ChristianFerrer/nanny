'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    async function checkAuth() {
      const supabase = getSupabase();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/login');
        return;
      }

      // Check if user has a family linked
      const { data: parent } = await supabase
        .from('parents')
        .select('family_id')
        .eq('auth_user_id', user.id)
        .limit(1)
        .single();

      router.replace(parent ? '/chat' : '/onboarding');
    }

    checkAuth();
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[100dvh]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-[var(--nanny-purple)] animate-pulse" />
        <p className="text-sm text-[var(--nanny-gray)]">Cargando...</p>
      </div>
    </div>
  );
}
