'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { GraduationCap, CalendarDays as CalIcon, CheckSquare as TaskIcon, Pill, Plus, ChevronRight, Users, Settings } from 'lucide-react';
import { getChildren, getTodayEvents, getTasks, getMedications, getCachedSnapshot } from '@/lib/store';
import type { Child, FamilyEvent, Task, Medication } from '@/lib/types';
import { formatAge } from '@/lib/age';

export default function HijosPage() {
  const _snap = getCachedSnapshot();
  const [children, setChildren] = useState<Child[]>(_snap?.children || []);
  const [todayEvents, setTodayEvents] = useState<FamilyEvent[]>(_snap?.events || []);
  const [tasks, setTasks] = useState<Task[]>(_snap?.tasks || []);
  const [medications, setMedications] = useState<Medication[]>(_snap?.medications || []);
  const [loading, setLoading] = useState(!_snap);

  const loadData = useCallback(async () => {
    try {
      const [c, te, t, m] = await Promise.all([
        getChildren(), getTodayEvents(), getTasks(), getMedications(),
      ]);
      setChildren(c);
      setTodayEvents(te);
      setTasks(t);
      setMedications(m);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <header className="px-5 pt-header pb-4">
          <div className="skeleton h-9 w-32 mb-2" />
          <div className="skeleton h-4 w-48" />
        </header>
        <div className="px-4 space-y-3">
          <div className="skeleton h-28 w-full rounded-2xl" />
          <div className="skeleton h-28 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white page-enter">
      <header className="px-5 pt-header pb-4 flex items-end justify-between">
        <div>
          <h1 className="text-large-title text-[var(--text-primary)]">Hijos</h1>
          <p className="text-footnote text-[var(--text-tertiary)] mt-0.5">Perfiles y memoria de cada hijo</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/perfil/hijo/nuevo"
            aria-label="Agregar hijo"
            className="w-10 h-10 rounded-full bg-[var(--nanny-purple-tint)] text-[var(--nanny-purple)] flex items-center justify-center active:scale-95 transition-transform focus-ring"
          >
            <Plus size={20} />
          </Link>
          <Link
            href="/perfil"
            aria-label="Configuración"
            className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--gray-100)] focus-ring"
          >
            <Settings size={24} />
          </Link>
        </div>
      </header>

      <div className="px-4 space-y-3 pb-24">
        {children.length === 0 ? (
          <div className="card-flat text-center py-12 px-6">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[var(--nanny-purple-tint)] flex items-center justify-center mb-4">
              <Users size={26} className="text-[var(--nanny-purple)]" />
            </div>
            <p className="text-headline text-[var(--text-primary)]">Aún no hay hijos</p>
            <p className="text-footnote text-[var(--text-tertiary)] mt-1 mb-5">Agrega el perfil de tu primer hijo para que Nanny pueda ayudarte mejor</p>
            <Link href="/perfil?addChild=1" className="btn btn-primary">
              <Plus size={16} /> Agregar hijo
            </Link>
          </div>
        ) : children.map(child => {
          const age = child.birth_date ? formatAge(child.birth_date) : null;
          const childEvents = todayEvents.filter(e => e.child_id === child.id).length;
          const childTasks = tasks.filter(t => t.child_id === child.id && t.status !== 'done').length;
          const childMeds = medications.filter(m => m.child_id === child.id && m.status === 'active').length;
          const hasUrgent = childMeds > 0 || tasks.some(t => t.child_id === child.id && t.priority === 'urgent' && t.status !== 'done');

          return (
            <Link
              key={child.id}
              href={`/hijo/${child.id}`}
              className="block card hover:shadow-md transition-shadow active:scale-[0.99]"
            >
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center text-title-3 font-semibold text-white shadow-sm"
                    style={{ background: child.color || 'var(--nanny-purple)' }}
                  >
                    {child.name.charAt(0).toUpperCase()}
                  </div>
                  {hasUrgent && (
                    <span
                      className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[var(--danger)] border-2 border-white"
                      aria-label="Requiere atención"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-headline text-[var(--text-primary)] truncate">{child.name}</h2>
                    {age !== null && (
                      <span className="text-footnote text-[var(--text-tertiary)]">{age}</span>
                    )}
                  </div>
                  {child.school && (
                    <p className="text-footnote text-[var(--text-tertiary)] mt-0.5 inline-flex items-center gap-1 truncate">
                      <GraduationCap size={12} /> {child.school}
                    </p>
                  )}
                  {/* Mini-dashboard de stats */}
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    <Stat icon={<CalIcon size={11} />} label={`${childEvents} hoy`} active={childEvents > 0} tone="purple" />
                    <Stat icon={<TaskIcon size={11} />} label={`${childTasks} ${childTasks === 1 ? 'tarea' : 'tareas'}`} active={childTasks > 0} tone="warning" />
                    {childMeds > 0 && (
                      <Stat icon={<Pill size={11} />} label="Medicamento" active tone="purple" />
                    )}
                  </div>
                </div>
                <ChevronRight size={18} className="text-[var(--text-quaternary)] shrink-0" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ icon, label, active, tone }: { icon: React.ReactNode; label: string; active: boolean; tone: 'purple' | 'warning' | 'success' | 'neutral' }) {
  const styles = {
    purple: active ? 'bg-[var(--nanny-purple-tint)] text-[var(--nanny-purple)]' : 'bg-[var(--gray-100)] text-[var(--text-quaternary)]',
    warning: active ? 'bg-[var(--warning-soft)] text-[#B86600]' : 'bg-[var(--gray-100)] text-[var(--text-quaternary)]',
    success: active ? 'bg-[var(--success-soft)] text-[#1F8F3F]' : 'bg-[var(--gray-100)] text-[var(--text-quaternary)]',
    neutral: 'bg-[var(--gray-100)] text-[var(--text-secondary)]',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption font-medium ${styles[tone]}`}>
      {icon} {label}
    </span>
  );
}

