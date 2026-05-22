'use client';

import { useRouter } from 'next/navigation';
import { MapPin, Repeat, Circle, Stethoscope, GraduationCap, Cake, Dumbbell, Plane, CalendarDays, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { FamilyEvent, Child, Task, Routine, RoutineException } from '@/lib/types';

const HOUR_PX = 56;
const GUTTER = 52; // ancho de la columna de horas

const EVENT_ICON: Record<string, LucideIcon> = {
  doctor: Stethoscope,
  school: GraduationCap,
  birthday: Cake,
  activity: Dumbbell,
  travel: Plane,
  other: CalendarDays,
};

type Block = {
  id: string;
  kind: 'event' | 'routine';
  title: string;
  location: string | null;
  start: number; // minutos desde 00:00
  end: number;
  color: string;
  href: string | null;
  Icon: LucideIcon;
  col: number;
  cols: number;
};

// Layout de columnas para bloques solapados (algoritmo de calendario estándar).
function layoutColumns(items: Omit<Block, 'col' | 'cols'>[]): Block[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Block[] = [];
  let cluster: (Omit<Block, 'col' | 'cols'> & { col?: number })[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const colEnds: number[] = [];
    cluster.forEach(it => {
      let placed = false;
      for (let c = 0; c < colEnds.length; c++) {
        if (colEnds[c] <= it.start) { it.col = c; colEnds[c] = it.end; placed = true; break; }
      }
      if (!placed) { it.col = colEnds.length; colEnds.push(it.end); }
    });
    const cols = colEnds.length || 1;
    cluster.forEach(it => out.push({ ...(it as Omit<Block, 'col' | 'cols'>), col: it.col ?? 0, cols }));
    cluster = [];
  };

  sorted.forEach(it => {
    if (cluster.length && it.start >= clusterEnd) { flush(); clusterEnd = -1; }
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  });
  flush();
  return out;
}

function hourLabel(h: number): string {
  const hh = ((h % 24) + 24) % 24;
  const ampm = hh < 12 ? 'a.m.' : 'p.m.';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12} ${ampm}`;
}

function tint(color: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? `${color}1f` : 'var(--nanny-purple-tint)';
}

export default function DayTimeline({
  day, events, routines, routineExceptions, tasks, children, onComplete,
}: {
  day: Date;
  events: FamilyEvent[];
  routines: Routine[];
  routineExceptions: RoutineException[];
  tasks: Task[];
  children: Child[];
  onComplete: (taskId: string) => void;
}) {
  const router = useRouter();
  const getChild = (id: string | null) => children.find(c => c.id === id);
  const ds = day.toDateString();
  const dow = day.getDay();
  const dayIso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;

  const purple = 'var(--nanny-purple)';
  const childColor = (id: string | null) => getChild(id)?.color || '#7C3AED';

  // --- Eventos del día ---
  const dayEvents = events.filter(e => new Date(e.date_start).toDateString() === ds);
  // --- Rutinas activas del día (sin excepción cancelada) ---
  const dayRoutines = routines
    .filter(r => r.active && r.days_of_week.includes(dow))
    .map(r => ({ routine: r, exception: routineExceptions.find(rx => rx.routine_id === r.id && rx.date === dayIso) }))
    .filter(({ exception }) => !exception || !exception.cancelled);
  // --- Tareas del día ---
  const dayTasks = tasks.filter(t => t.due_date && new Date(t.due_date).toDateString() === ds);

  // Separar bloques con hora vs. items de "todo el día"
  const timed: Omit<Block, 'col' | 'cols'>[] = [];
  const allDay: { id: string; title: string; color: string; href: string | null; Icon: LucideIcon }[] = [];

  dayEvents.forEach(e => {
    const start = new Date(e.date_start);
    const startMin = start.getHours() * 60 + start.getMinutes();
    const Icon = EVENT_ICON[e.event_type] || CalendarDays;
    if (startMin === 0 && !e.date_end) {
      allDay.push({ id: e.id, title: e.title, color: childColor(e.child_id), href: `/evento/${e.id}`, Icon });
      return;
    }
    const end = e.date_end ? new Date(e.date_end) : null;
    let endMin = end ? end.getHours() * 60 + end.getMinutes() : startMin + 60;
    if (endMin <= startMin) endMin = startMin + 60;
    timed.push({ id: e.id, kind: 'event', title: e.title, location: e.location, start: startMin, end: endMin, color: childColor(e.child_id), href: `/evento/${e.id}`, Icon });
  });

  dayRoutines.forEach(({ routine, exception }) => {
    const ts = exception?.time_start_override || routine.time_start;
    const te = exception?.time_end_override || routine.time_end;
    const href = routine.child_id ? `/hijo/${routine.child_id}` : null;
    if (!ts) {
      allDay.push({ id: routine.id, title: routine.name, color: childColor(routine.child_id), href, Icon: Repeat });
      return;
    }
    const [sh, sm] = ts.split(':').map(Number);
    const startMin = sh * 60 + sm;
    let endMin = startMin + 60;
    if (te) { const [eh, em] = te.split(':').map(Number); endMin = eh * 60 + em; }
    if (endMin <= startMin) endMin = startMin + 60;
    timed.push({ id: routine.id, kind: 'routine', title: routine.name, location: null, start: startMin, end: endMin, color: childColor(routine.child_id), href, Icon: Repeat });
  });

  const blocks = layoutColumns(timed);

  const hasNothing = blocks.length === 0 && allDay.length === 0 && dayTasks.length === 0;
  if (hasNothing) {
    return (
      <div className="px-4 py-6">
        <Link href="/chat" className="block rounded-2xl bg-[var(--gray-50)] px-4 py-4 hover:bg-[var(--gray-100)] transition-colors focus-ring">
          <p className="text-subhead text-[var(--text-tertiary)]">Día libre</p>
          <p className="text-caption text-[var(--nanny-purple)] font-medium mt-0.5 text-pretty">Decile a Nanny qué agendar →</p>
        </Link>
      </div>
    );
  }

  // Rango de horas a mostrar
  let minHour = 7, maxHour = 22;
  if (blocks.length) {
    minHour = Math.floor(Math.min(...blocks.map(b => b.start)) / 60);
    maxHour = Math.ceil(Math.max(...blocks.map(b => b.end)) / 60);
  }
  minHour = Math.max(0, Math.min(minHour, 23));
  maxHour = Math.min(24, Math.max(maxHour, minHour + 1));
  const hours = Array.from({ length: maxHour - minHour + 1 }, (_, i) => minHour + i);
  const gridH = (maxHour - minHour) * HOUR_PX;
  const topFor = (min: number) => ((min - minHour * 60) / 60) * HOUR_PX;

  return (
    <div className="px-4 pb-24">
      {/* Todo el día: eventos/rutinas sin hora + tareas */}
      {(allDay.length > 0 || dayTasks.length > 0) && (
        <div className="mb-3 rounded-2xl bg-white border border-[var(--border-subtle)] overflow-hidden shadow-xs">
          <p className="text-caption-2 text-[var(--text-tertiary)] uppercase tracking-wider px-3 pt-2.5 pb-1">Todo el día</p>
          {allDay.map(it => (
            <button
              key={it.id}
              onClick={() => it.href && router.push(it.href)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left active:bg-[var(--gray-50)] transition-colors"
            >
              <span className="w-[3px] self-stretch rounded-full shrink-0" style={{ background: it.color }} />
              <it.Icon size={15} className="text-[var(--text-tertiary)] shrink-0" />
              <span className="text-callout font-medium text-[var(--text-primary)] truncate">{it.title}</span>
            </button>
          ))}
          {dayTasks.map(task => {
            const child = getChild(task.child_id);
            return (
              <div
                key={task.id}
                onClick={() => router.push(`/tarea/${task.id}`)}
                className="w-full flex items-center gap-2.5 px-3 py-2 cursor-pointer active:bg-[var(--gray-50)] transition-colors"
              >
                <button
                  onClick={(e) => { e.stopPropagation(); onComplete(task.id); }}
                  aria-label="Completar tarea"
                  className="shrink-0 text-[var(--text-quaternary)] hover:text-[var(--nanny-purple)] transition-colors focus-ring rounded-full"
                >
                  <Circle size={18} />
                </button>
                <span className="text-callout text-[var(--text-primary)] truncate flex-1">{task.title}</span>
                {child && (
                  <span className="size-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0" style={{ background: child.color || purple }}>
                    {child.name.charAt(0)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Timeline horario */}
      {blocks.length > 0 && (
        <div className="relative" style={{ height: gridH + 8 }}>
          {/* Líneas + etiquetas de hora */}
          {hours.map(h => (
            <div key={h} className="absolute left-0 right-0 flex items-start" style={{ top: topFor(h * 60) }}>
              <span className="text-caption-2 text-[var(--text-tertiary)] tabular-nums -translate-y-1/2 w-[44px] text-right pr-2 shrink-0">
                {hourLabel(h)}
              </span>
              <span className="flex-1 border-t border-[var(--border-subtle)]" />
            </div>
          ))}
          {/* Capa de bloques (inset por el gutter de horas) */}
          <div className="absolute top-0 bottom-0 right-0" style={{ left: GUTTER }}>
            {blocks.map(b => {
              const top = topFor(b.start);
              const height = Math.max(((b.end - b.start) / 60) * HOUR_PX - 3, 22);
              const widthPct = 100 / b.cols;
              const leftPct = (b.col * 100) / b.cols;
              return (
                <button
                  key={`${b.kind}-${b.id}`}
                  onClick={() => b.href && router.push(b.href)}
                  className="absolute rounded-lg px-2 py-1 text-left overflow-hidden active:scale-[0.99] transition-transform focus-ring"
                  style={{
                    top, height,
                    left: `${leftPct}%`,
                    width: `calc(${widthPct}% - 4px)`,
                    background: tint(b.color),
                    borderLeft: `3px solid ${b.color}`,
                  }}
                >
                  <span className="flex items-center gap-1 min-w-0">
                    {b.kind === 'routine' && <Repeat size={11} className="shrink-0 text-[var(--text-secondary)]" />}
                    <span className="text-caption font-semibold text-[var(--text-primary)] truncate leading-tight">{b.title}</span>
                  </span>
                  {b.location && height > 34 && (
                    <span className="flex items-center gap-0.5 text-caption-2 text-[var(--text-tertiary)] truncate mt-0.5">
                      <MapPin size={9} className="shrink-0" /> {b.location}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
