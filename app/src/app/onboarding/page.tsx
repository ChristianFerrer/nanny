'use client';

import { useEffect } from 'react';

export default function OnboardingPage() {
  useEffect(() => {
    window.location.href = '/chat';
  }, []);

  return (
    <div className="flex items-center justify-center h-[100dvh]">
      <p className="text-sm text-gray-400">Redirigiendo...</p>
    </div>
  );
}
