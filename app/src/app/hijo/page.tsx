'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getChildren } from '@/lib/store';
import type { Child } from '@/lib/types';

export default function HijosPage() {
  const [children, setChildren] = useState<Child[]>([]);

  const loadData = useCallback(async () => {
    setChildren(await getChildren());
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <div className="min-h-screen">
      <div className="px-5 pt-12 pb-4">
        <h1 className="text-2xl font-bold">Hijos</h1>
        <p className="text-sm text-[var(--nanny-gray)]">Perfiles y memoria de cada hijo</p>
      </div>

      <div className="px-4 space-y-3 pb-20">
        {children.map(child => {
          const age = child.birth_date ? calcAge(child.birth_date) : null;
          return (
            <Link
              key={child.id}
              href={`/hijo/${child.id}`}
              className="block bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-[var(--nanny-purple-bg)] flex items-center justify-center text-3xl">
                  {child.emoji}
                </div>
                <div className="flex-1">
                  <h2 className="font-semibold text-lg">{child.name}</h2>
                  {age !== null && (
                    <p className="text-sm text-[var(--nanny-gray)]">{age} años</p>
                  )}
                  {child.school && (
                    <p className="text-xs text-[var(--nanny-gray)] mt-0.5">🏫 {child.school}</p>
                  )}
                </div>
                <div className="text-[var(--nanny-gray)]">›</div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function calcAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}
