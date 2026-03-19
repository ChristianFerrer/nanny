'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bot } from 'lucide-react';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/check-family');
        const data = await res.json();
        if (data.authenticated === false) {
          router.replace('/login');
        } else {
          router.replace(data.hasFamily ? '/chat' : '/onboarding');
        }
      } catch {
        router.replace('/login');
      }
    }

    checkAuth();
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[100dvh]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-[var(--nanny-purple)] animate-pulse flex items-center justify-center">
          <Bot size={24} className="text-white" />
        </div>
        <p className="text-sm text-[var(--nanny-gray)]">Cargando...</p>
      </div>
    </div>
  );
}
