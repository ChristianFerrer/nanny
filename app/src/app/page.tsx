'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function Home() {
  const router = useRouter();
  const [stalled, setStalled] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const checkAuth = useCallback(async () => {
    setStalled(false);
    try {
      const res = await fetch('/api/check-family');
      const data = await res.json();
      if (data.authenticated === false) {
        router.replace('/login');
      } else {
        router.replace(data.hasFamily ? '/chat' : '/onboarding');
      }
    } catch {
      setStalled(true);
    }
  }, [router]);

  useEffect(() => {
    checkAuth();
    const stallTimer = setTimeout(() => setStalled(true), 5000);
    return () => clearTimeout(stallTimer);
  }, [checkAuth]);

  const handleRetry = async () => {
    setRetrying(true);
    await checkAuth();
    setRetrying(false);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] px-8 animate-fade-in">
      <div className="flex flex-col items-center gap-5">
        <div
          className="size-[88px] rounded-[22px] overflow-hidden flex items-center justify-center"
          style={{
            background: 'var(--nanny-purple)',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.16), 0 4px 8px rgba(0, 0, 0, 0.10)',
          }}
        >
          <Image
            src="/icon-192.png"
            alt="Nanny"
            width={88}
            height={88}
            priority
            className="size-full object-cover"
          />
        </div>

        <div className="text-center">
          <h1 className="text-title-1 text-balance" style={{ color: 'var(--text-primary)' }}>
            Nanny
          </h1>
          <p
            className="text-callout mt-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            Tu asistente familiar
          </p>
        </div>

        {!stalled && (
          <div
            className="mt-6 size-6 rounded-full border-2 animate-spin-slow"
            style={{
              borderColor: 'var(--gray-200)',
              borderTopColor: 'var(--nanny-purple)',
            }}
            aria-label="Cargando"
          />
        )}
      </div>

      {stalled && (
        <div className="mt-10 text-center animate-slide-up max-w-xs">
          <p className="text-footnote mb-4 text-pretty" style={{ color: 'var(--text-secondary)' }}>
            Estamos tardando más de lo normal
          </p>
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="btn btn-tinted btn-sm"
          >
            {retrying ? 'Reintentando…' : 'Reintentar'}
          </button>
        </div>
      )}
    </div>
  );
}
