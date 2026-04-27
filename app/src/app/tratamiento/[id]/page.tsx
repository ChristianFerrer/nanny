'use client';

import { useState, useEffect, useCallback, use, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Pill, CheckCircle2, Circle, AlertCircle, Calendar,
  Clock, User as UserIcon, MoreVertical, X, SkipForward
} from 'lucide-react';
import { getMedicationDetail, upsertIntake, updateMedication, getCurrentParentId, getChildren } from '@/lib/store';
import type { Medication, MedicationIntake, MedicationIntakeStatus, Child } from '@/lib/types';

type DoseRow = {
  scheduled_at: string;
  intake: MedicationIntake | null;
  status: MedicationIntakeStatus;
  isPast: boolean;
  isToday: boolean;
};

export default function TratamientoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [medication, setMedication] = useState<Medication | null>(null);
  const [intakes, setIntakes] = useState<MedicationIntake[]>([]);
  const [child, setChild] = useState<Child | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [actionMenu, setActionMenu] = useState(false);
  const [savingIntake, setSavingIntake] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const [detail, allChildren] = await Promise.all([
      getMedicationDetail(id),
      getChildren().catch(() => [] as Child[]),
    ]);
    if (!detail) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setMedication(detail.medication);
    setIntakes(detail.intakes);
    if (detail.medication.child_id) {
      setChild(allChildren.find(c => c.id === detail.medication.child_id) || null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  const doses: DoseRow[] = useMemo(() => {
    if (!medication) return [];
    const times = (medication.schedule_times && medication.schedule_times.length > 0)
      ? medication.schedule_times
      : ['09:00'];
    const totalDays = medication.duration_days
      || (medication.end_date ? daysBetween(medication.start_date, medication.end_date) + 1 : 1);
    const rows: DoseRow[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const now = new Date();
    const intakesByKey = new Map(intakes.map(i => [i.scheduled_at, i]));

    for (let day = 0; day < totalDays; day++) {
      for (const t of times) {
        const scheduled = composeDateTime(medication.start_date, day, t);
        const key = scheduled.toISOString();
        const matched = intakesByKey.get(key)
          || intakes.find(i => Math.abs(new Date(i.scheduled_at).getTime() - scheduled.getTime()) < 60_000)
          || null;
        const isPast = scheduled.getTime() < now.getTime();
        const dayDate = new Date(scheduled); dayDate.setHours(0, 0, 0, 0);
        const isToday = dayDate.getTime() === today.getTime();
        let status: MedicationIntakeStatus = matched?.status ?? 'pending';
        if (status === 'pending' && isPast) {
          // Visual hint: past + pending = falta marcar (lo dejamos como pending para que el padre decida)
          status = 'pending';
        }
        rows.push({ scheduled_at: key, intake: matched, status, isPast, isToday });
      }
    }
    return rows;
  }, [medication, intakes]);

  const stats = useMemo(() => {
    const total = doses.length;
    const done = doses.filter(d => d.status === 'done').length;
    const skipped = doses.filter(d => d.status === 'skipped').length;
    const pendingPast = doses.filter(d => d.status === 'pending' && d.isPast).length;
    const pendingFuture = doses.filter(d => d.status === 'pending' && !d.isPast).length;
    return { total, done, skipped, pendingPast, pendingFuture };
  }, [doses]);

  const handleSetIntake = async (dose: DoseRow, status: MedicationIntakeStatus) => {
    if (!medication) return;
    setSavingIntake(dose.scheduled_at);
    const parentId = getCurrentParentId();
    try {
      const updated = await upsertIntake({
        id: dose.intake?.id,
        medication_id: medication.id,
        family_id: medication.family_id,
        scheduled_at: dose.scheduled_at,
        status,
        taken_at: status === 'done' ? new Date().toISOString() : null,
        recorded_by: parentId,
      });
      setIntakes(prev => {
        const others = prev.filter(i => i.id !== updated.id && i.scheduled_at !== updated.scheduled_at);
        return [...others, updated];
      });
    } finally {
      setSavingIntake(null);
    }
  };

  const handleStatusChange = async (newStatus: 'completed' | 'cancelled' | 'active') => {
    if (!medication) return;
    await updateMedication(medication.id, { status: newStatus });
    setMedication({ ...medication, status: newStatus });
    setActionMenu(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white pb-24 page-enter">
        <header className="px-5 pt-header pb-4">
          <div className="skeleton h-9 w-48 mb-2" />
          <div className="skeleton h-4 w-32" />
        </header>
        <div className="px-4 space-y-3">
          <div className="skeleton h-24 w-full rounded-2xl" />
          <div className="skeleton h-44 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (notFound || !medication) {
    return (
      <div className="min-h-screen bg-white pb-24 page-enter px-5 pt-header">
        <Link href="/hoy" className="inline-flex items-center gap-1 text-footnote text-[var(--nanny-purple)] mb-4">
          <ArrowLeft size={14} /> Volver
        </Link>
        <p className="text-headline">Tratamiento no encontrado</p>
        <p className="text-footnote text-[var(--text-tertiary)] mt-1">Puede que haya sido eliminado.</p>
      </div>
    );
  }

  const start = new Date(medication.start_date);
  const totalDays = medication.duration_days
    || (medication.end_date ? daysBetween(medication.start_date, medication.end_date) + 1 : 1);
  const end = medication.end_date ? new Date(medication.end_date) : addDays(start, totalDays - 1);
  const today = new Date();
  const daysPassed = Math.max(0, Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  const daysLeft = Math.max(0, totalDays - daysPassed);
  const dayProgress = Math.min(100, Math.round((daysPassed / Math.max(1, totalDays)) * 100));
  const intakeProgress = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
  const allDone = stats.total > 0 && stats.done === stats.total;
  const isCompleted = medication.status === 'completed' || allDone;

  return (
    <div className="min-h-screen bg-white pb-24 page-enter">
      <header className="px-5 pt-header pb-4 flex items-start justify-between">
        <button
          onClick={() => router.back()}
          aria-label="Volver"
          className="w-10 h-10 -ml-2 rounded-full flex items-center justify-center text-[var(--text-secondary)] focus-ring tap-highlight"
        >
          <ArrowLeft size={20} />
        </button>
        <button
          onClick={() => setActionMenu(true)}
          aria-label="Acciones"
          className="w-10 h-10 -mr-2 rounded-full flex items-center justify-center text-[var(--text-secondary)] focus-ring tap-highlight"
        >
          <MoreVertical size={20} />
        </button>
      </header>

      <div className="px-5">
        <div className="flex items-center gap-3 mb-1">
          <span className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--nanny-purple-tint)' }}>
            <Pill size={22} className="text-[var(--nanny-purple)]" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-title-2 text-[var(--text-primary)] truncate">{medication.medication_name}</h1>
            <p className="text-footnote text-[var(--text-tertiary)] truncate">
              {child ? child.name : medication.child_name}
              {medication.frequency ? ` · ${medication.frequency}` : ''}
            </p>
          </div>
          <StatusBadge status={medication.status} allDone={allDone} />
        </div>
      </div>

      <div className="px-4 mt-5 space-y-4">
        {/* Resumen */}
        <section className="card">
          <div className="grid grid-cols-2 gap-y-3">
            <InfoCell icon={<Calendar size={14} />} label="Inicio" value={fmtDate(start)} />
            <InfoCell icon={<Calendar size={14} />} label="Fin" value={fmtDate(end)} />
            <InfoCell icon={<Clock size={14} />} label="Horarios" value={(medication.schedule_times || []).join(', ') || '—'} />
            <InfoCell icon={<UserIcon size={14} />} label="Para" value={child?.name || medication.child_name} />
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-caption text-[var(--text-tertiary)] uppercase tracking-wider">Progreso del tratamiento</span>
              <span className="text-caption text-[var(--text-secondary)] font-medium">
                {daysLeft === 0 ? 'Último día' : `${daysLeft}d restantes`}
              </span>
            </div>
            <div className="h-1.5 bg-[var(--gray-100)] rounded-full overflow-hidden">
              <div className="h-full bg-[var(--nanny-purple)] rounded-full transition-all" style={{ width: `${dayProgress}%` }} />
            </div>
            <p className="text-caption-2 text-[var(--text-tertiary)] mt-1">Día {Math.min(daysPassed + 1, totalDays)} de {totalDays}</p>
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-caption text-[var(--text-tertiary)] uppercase tracking-wider">Tomas</span>
              <span className="text-caption text-[var(--text-secondary)] font-medium">{stats.done}/{stats.total}</span>
            </div>
            <div className="h-1.5 bg-[var(--gray-100)] rounded-full overflow-hidden">
              <div className="h-full bg-[var(--success)] rounded-full transition-all" style={{ width: `${intakeProgress}%` }} />
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
              <Pill_Stat color="var(--success)" label={`${stats.done} hechas`} />
              {stats.skipped > 0 && <Pill_Stat color="var(--text-tertiary)" label={`${stats.skipped} saltadas`} />}
              {stats.pendingPast > 0 && <Pill_Stat color="var(--warning)" label={`${stats.pendingPast} sin marcar`} />}
              {stats.pendingFuture > 0 && <Pill_Stat color="var(--text-quaternary)" label={`${stats.pendingFuture} próximas`} />}
            </div>
          </div>
        </section>

        {/* Tomas */}
        <section>
          <h2 className="text-caption text-[var(--text-tertiary)] mb-2 px-1 uppercase tracking-wider">
            Tomas {isCompleted ? 'realizadas' : 'programadas'}
          </h2>
          <div className="card p-0 overflow-hidden">
            {groupByDay(doses).map((group, gi) => (
              <div key={group.dayKey} className={gi > 0 ? 'border-t border-[var(--separator)]' : ''}>
                <div className="px-4 py-2 bg-[var(--gray-50)]">
                  <p className="text-caption text-[var(--text-secondary)] font-semibold uppercase tracking-wider">
                    {fmtDayHeader(group.dayKey)}
                  </p>
                </div>
                {group.rows.map(row => (
                  <DoseRowItem
                    key={row.scheduled_at}
                    row={row}
                    saving={savingIntake === row.scheduled_at}
                    onMark={handleSetIntake}
                  />
                ))}
              </div>
            ))}
          </div>
        </section>
      </div>

      {actionMenu && (
        <>
          <div className="sheet-backdrop" onClick={() => setActionMenu(false)} />
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Acciones del tratamiento">
            <div className="sheet-handle" />
            <div className="sheet-header flex items-center justify-between">
              <h2 className="text-title-3 text-[var(--text-primary)]">Acciones</h2>
              <button
                onClick={() => setActionMenu(false)}
                aria-label="Cerrar"
                className="w-9 h-9 rounded-full bg-[var(--gray-100)] flex items-center justify-center text-[var(--text-secondary)] focus-ring"
              >
                <X size={18} />
              </button>
            </div>
            <div className="sheet-body space-y-2">
              {medication.status !== 'completed' && (
                <button onClick={() => handleStatusChange('completed')} className="btn btn-secondary btn-block">
                  <CheckCircle2 size={16} /> Marcar como completado
                </button>
              )}
              {medication.status !== 'cancelled' && (
                <button onClick={() => handleStatusChange('cancelled')} className="btn btn-block" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
                  Cancelar tratamiento
                </button>
              )}
              {medication.status !== 'active' && (
                <button onClick={() => handleStatusChange('active')} className="btn btn-secondary btn-block">
                  Reactivar
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DoseRowItem({ row, saving, onMark }: { row: DoseRow; saving: boolean; onMark: (row: DoseRow, status: MedicationIntakeStatus) => void }) {
  const t = new Date(row.scheduled_at);
  const time = t.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
  const isDone = row.status === 'done';
  const isSkipped = row.status === 'skipped';
  const needsAction = row.status === 'pending' && row.isPast;

  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{
        background: isDone ? 'var(--success-soft)' : isSkipped ? 'var(--gray-100)' : needsAction ? 'var(--warning-soft)' : 'var(--gray-50)',
      }}>
        {isDone
          ? <CheckCircle2 size={18} className="text-[var(--success)]" />
          : isSkipped
          ? <SkipForward size={16} className="text-[var(--text-tertiary)]" />
          : needsAction
          ? <AlertCircle size={18} className="text-[var(--warning)]" />
          : <Circle size={18} className="text-[var(--text-tertiary)]" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-subhead text-[var(--text-primary)]">{time}</p>
        <p className="text-caption-2 text-[var(--text-tertiary)]">
          {isDone && row.intake?.taken_at
            ? `Tomada ${formatRelative(row.intake.taken_at)}`
            : isSkipped
            ? 'Saltada'
            : needsAction
            ? 'Sin marcar'
            : 'Programada'}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {isDone || isSkipped ? (
          <button
            onClick={() => onMark(row, 'pending')}
            disabled={saving}
            className="text-caption text-[var(--nanny-purple)] px-2 py-1 rounded focus-ring"
          >
            Deshacer
          </button>
        ) : (
          <>
            <button
              onClick={() => onMark(row, 'done')}
              disabled={saving}
              aria-label="Marcar como hecha"
              className="w-9 h-9 rounded-full flex items-center justify-center focus-ring tap-highlight"
              style={{ background: 'var(--success-soft)', color: 'var(--success)' }}
            >
              <CheckCircle2 size={18} />
            </button>
            {row.isPast && (
              <button
                onClick={() => onMark(row, 'skipped')}
                disabled={saving}
                aria-label="Saltar"
                className="w-9 h-9 rounded-full flex items-center justify-center focus-ring tap-highlight"
                style={{ background: 'var(--gray-100)', color: 'var(--text-secondary)' }}
              >
                <SkipForward size={16} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status, allDone }: { status: Medication['status']; allDone: boolean }) {
  if (status === 'cancelled') {
    return <span className="text-caption-2 px-2 py-1 rounded-full font-semibold" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>Cancelado</span>;
  }
  if (status === 'completed' || allDone) {
    return <span className="text-caption-2 px-2 py-1 rounded-full font-semibold" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}>Completado</span>;
  }
  return <span className="text-caption-2 px-2 py-1 rounded-full font-semibold" style={{ background: 'var(--nanny-purple-tint)', color: 'var(--nanny-purple)' }}>Activo</span>;
}

function InfoCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-caption-2 text-[var(--text-tertiary)] uppercase tracking-wider">
        {icon}<span>{label}</span>
      </div>
      <p className="text-subhead text-[var(--text-primary)] mt-0.5">{value}</p>
    </div>
  );
}

function Pill_Stat({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-caption-2 text-[var(--text-secondary)]">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

// --- helpers ---
function composeDateTime(startDate: string, dayOffset: number, time: string): Date {
  const [hh, mm] = time.split(':').map(n => parseInt(n, 10));
  const d = new Date(`${startDate}T00:00:00`);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hh || 0, mm || 0, 0, 0);
  return d;
}

function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00`);
  const db = new Date(`${b}T00:00:00`);
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

function fmtDayHeader(iso: string): string {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dd = new Date(d); dd.setHours(0, 0, 0, 0);
  const diff = Math.round((dd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'Hoy';
  if (diff === -1) return 'Ayer';
  if (diff === 1) return 'Mañana';
  return d.toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'short' });
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.round((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

function groupByDay(doses: DoseRow[]): { dayKey: string; rows: DoseRow[] }[] {
  const groups = new Map<string, DoseRow[]>();
  for (const r of doses) {
    const d = new Date(r.scheduled_at);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  return [...groups.entries()].map(([dayKey, rows]) => ({ dayKey, rows }));
}
