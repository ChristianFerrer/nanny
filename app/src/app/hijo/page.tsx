'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { GraduationCap, CalendarDays as CalIcon, CheckSquare as TaskIcon, Pill } from 'lucide-react';
import { getChildren, getTodayEvents, getTasks, getMedications } from '@/lib/store';
import type { Child, FamilyEvent, Task, Medication } from '@/lib/types';

export default function HijosPage() {
  const [children, setChildren] = useState<Child[]>([]);
  const [todayEvents, setTodayEvents] = useState<FamilyEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);

  const loadData = useCallback(async () => {
    const [c, te, t, m] = await Promise.all([
      getChildren(), getTodayEvents(), getTasks(), getMedications(),
    ]);
    setChildren(c);
    setTodayEvents(te);
    setTasks(t);
    setMedications(m);
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
          const childEvents = todayEvents.filter(e => e.child_id === child.id).length;
          const childTasks = tasks.filter(t => t.child_id === child.id && t.status !== 'done').length;
          const childMeds = medications.filter(m => m.child_id === child.id && m.status === 'active').length;
          const hasActivity = childEvents > 0 || childTasks > 0 || childMeds > 0;

          return (
            <Link
              key={child.id}
              href={`/hijo/${child.id}`}
              className="block bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-[var(--nanny-purple-bg)] flex items-center justify-center text-xl font-bold text-[var(--nanny-purple)]">
                  {child.name.charAt(0)}
                </div>
                <div className="flex-1">
                  <h2 className="font-semibold text-lg">{child.name}</h2>
                  {age !== null && (
                    <p className="text-sm text-[var(--nanny-gray)]">{age} a&ntilde;os</p>
                  )}
                  {child.school && (
                    <p className="text-xs text-[var(--nanny-gray)] mt-0.5 inline-flex items-center gap-1"><GraduationCap size={11} /> {child.school}</p>
                  )}
                  {/* Mini resumen de actividad */}
                  {hasActivity && (
                    <div className="flex gap-2 mt-1.5 flex-wrap">
                      {childEvents > 0 && (
                        <span className="text-[10px] bg-[var(--nanny-purple-bg)] text-[var(--nanny-purple)] px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1">
                          <CalIcon size={10} /> {childEvents} evento{childEvents > 1 ? 's' : ''} hoy
                        </span>
                      )}
                      {childTasks > 0 && (
                        <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1">
                          <TaskIcon size={10} /> {childTasks} tarea{childTasks > 1 ? 's' : ''}
                        </span>
                      )}
                      {childMeds > 0 && (
                        <span className="text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1">
                          <Pill size={10} /> Tratamiento activo
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-[var(--nanny-gray)]">&rsaquo;</div>
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
