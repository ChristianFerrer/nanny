'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fraunces, Archivo } from 'next/font/google';
import { ChevronLeft, ChevronRight, MapPin, Circle, Plus, Settings, Repeat } from 'lucide-react';
import { getEvents, getChildren, getTasks, getMedications, getRoutines, getRoutineExceptions, completeTask, getCachedSnapshot, invalidateTableCache } from '@/lib/store';
import { useRealtimeFamily } from '@/lib/realtime';
import type { FamilyEvent, Child, Task, Medication, Routine, RoutineException } from '@/lib/types';

// Editorial type pairing — scoped to esta pantalla (no toca el Inter global).
const display = Fraunces({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--ed-display', display: 'swap' });
const grotesque = Archivo({ subsets: ['latin'], variable: '--ed-grotesque', display: 'swap' });

const TYPE_LABEL: Record<string, string> = {
  doctor: 'Médico', school: 'Escuela', birthday: 'Cumpleaños',
  activity: 'Actividad', travel: 'Viaje', other: 'Evento',
};

export default function AgendaPage() {
  const router = useRouter();
  const _snap = getCachedSnapshot();
  const [events, setEvents] = useState<FamilyEvent[]>(_snap?.events || []);
  const [children, setChildren] = useState<Child[]>(_snap?.children || []);
  const [tasks, setTasks] = useState<Task[]>(_snap?.tasks || []);
  const [medications, setMedications] = useState<Medication[]>(_snap?.medications || []);
  const [routines, setRoutines] = useState<Routine[]>(_snap?.routines || []);
  const [routineExceptions, setRoutineExceptions] = useState<RoutineException[]>(_snap?.routineExceptions || []);
  const [weekOffset, setWeekOffset] = useState(0);
  // Default: today selected (radio); user can switch to full-week via "Toda la semana"
  const todayInitialIdx = (() => {
    const d = new Date().getDay();
    return d === 0 ? 6 : d - 1; // Monday=0 ... Sunday=6
  })();
  const [selectedDayIdx, setSelectedDayIdx] = useState<number | null>(todayInitialIdx);
  const [loading, setLoading] = useState(!_snap);

  const loadData = useCallback(async () => {
    try {
      const [e, c, t, m, r, rx] = await Promise.all([
        getEvents(), getChildren(), getTasks(), getMedications(),
        getRoutines(), getRoutineExceptions(),
      ]);
      setEvents(e);
      setChildren(c);
      setTasks(t);
      setMedications(m);
      setRoutines(r);
      setRoutineExceptions(rx);
    } catch {
      window.location.href = '/login';
    } finally {
      setLoading(false);
    }
  }, []);

  const handleComplete = async (taskId: string) => {
    await completeTask(taskId);
    setTasks(prev => prev.filter(t => t.id !== taskId));
  };

  useEffect(() => { loadData(); }, [loadData]);

  // Real-time sync: cuando otro padre agrega/edita/borra algo, invalidar
  // las caches relevantes y refetchear sin esperar al próximo refresh manual.
  const familyId = _snap?.family?.id || '';
  useRealtimeFamily({
    familyId,
    tables: ['events', 'tasks', 'medications', 'routines', 'routine_exceptions'],
    enabled: !!familyId,
    onChange: () => {
      invalidateTableCache('events');
      invalidateTableCache('tasks');
      invalidateTableCache('medications');
      invalidateTableCache('routines');
      invalidateTableCache('routine_exceptions');
      loadData();
    },
  });

  // Calculate week dates
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + 1 + weekOffset * 7); // Monday

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });

  const getChild = (id: string | null) => children.find(c => c.id === id);

  const monthYear = startOfWeek.toLocaleDateString('es', { month: 'long', year: 'numeric' });

  const rootClass = `agenda-ed ${display.variable} ${grotesque.variable}`;

  if (loading) {
    return (
      <div className={`${rootClass} min-h-dvh`}>
        <EditorialStyle />
        <div className="ed-masthead">
          <div className="ed-rule-thick" />
          <div className="ed-masthead-row">
            <span className="ed-skel ed-skel-title" />
            <span className="ed-skel ed-skel-dot" />
          </div>
          <div className="ed-rule" />
          <div className="ed-weekstrip">
            {Array.from({ length: 7 }).map((_, i) => (
              <span key={i} className="ed-skel ed-skel-day" />
            ))}
          </div>
          <div className="ed-rule" />
        </div>
        <div className="ed-body">
          {Array.from({ length: 3 }).map((_, i) => (
            <span key={i} className="ed-skel ed-skel-entry" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`${rootClass} min-h-dvh page-enter`}>
      <EditorialStyle />

      {/* Masthead — periódico: regla gruesa, título serif, dateline */}
      <header className="ed-masthead">
        <div className="ed-rule-thick" />
        <div className="ed-masthead-row">
          <h1 className="ed-title">Agenda</h1>
          <div className="ed-actions">
            {weekOffset !== 0 && (
              <button
                onClick={() => { setWeekOffset(0); setSelectedDayIdx(todayInitialIdx); }}
                aria-label="Ir a hoy"
                className="ed-btn-today focus-ring"
              >
                Hoy
              </button>
            )}
            <Link href="/perfil" aria-label="Configuración" className="ed-icon-btn focus-ring">
              <Settings size={20} />
            </Link>
          </div>
        </div>

        <div className="ed-dateline">
          <button onClick={() => setWeekOffset(w => w - 1)} aria-label="Semana anterior" className="ed-icon-btn focus-ring">
            <ChevronLeft size={18} />
          </button>
          <div className="ed-dateline-center">
            <p className="ed-monthyear">{monthYear}</p>
            {weekOffset !== 0 ? (
              <p className="ed-dateline-sub tabular-nums">
                Hoy · {today.toLocaleDateString('es', { weekday: 'long', day: 'numeric' })}
              </p>
            ) : (
              <button
                onClick={() => setSelectedDayIdx(prev => prev === null ? todayInitialIdx : null)}
                className="ed-toggle"
              >
                {selectedDayIdx === null ? 'Vista de día' : 'Toda la semana'}
              </button>
            )}
          </div>
          <button onClick={() => setWeekOffset(w => w + 1)} aria-label="Semana siguiente" className="ed-icon-btn focus-ring">
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="ed-rule" />

        {/* Week strip — columnas editoriales: día abreviado + numeral grande */}
        <div role="radiogroup" aria-label="Día de la semana" className="ed-weekstrip">
          {days.map((day, i) => {
            const isToday = day.toDateString() === today.toDateString();
            const isSelected = selectedDayIdx === i;
            const dayEvents = events.filter(e => new Date(e.date_start).toDateString() === day.toDateString());
            const dayTasks = tasks.filter(t => t.due_date && new Date(t.due_date).toDateString() === day.toDateString());
            const dayLabel = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'][i];

            const dayMeds = medications.filter(m => {
              if (m.status !== 'active') return false;
              const start = new Date(m.start_date);
              const end = m.end_date ? new Date(m.end_date) : new Date(8.64e15);
              const dMid = new Date(day); dMid.setHours(0, 0, 0, 0);
              return dMid >= start && dMid <= end;
            });
            const hourBuckets = Array.from({ length: 24 }, (_, h) => {
              const hasEvent = dayEvents.some(e => new Date(e.date_start).getHours() === h);
              if (hasEvent) return 'event';
              const hasMed = dayMeds.some(m => (m.schedule_times || []).some(t => parseInt(t.split(':')[0], 10) === h));
              if (hasMed) return 'med';
              const hasTask = dayTasks.some(t => t.due_date && new Date(t.due_date).getHours() === h);
              if (hasTask) return 'task';
              return null;
            });
            const segments = Array.from({ length: 6 }, (_, s): 'event' | 'med' | 'task' | null => {
              const slice = hourBuckets.slice(s * 4, s * 4 + 4);
              if (slice.includes('event')) return 'event';
              if (slice.includes('med')) return 'med';
              if (slice.includes('task')) return 'task';
              return null;
            });

            return (
              <button
                key={i}
                role="radio"
                aria-checked={isSelected}
                aria-label={`${dayLabel} ${day.getDate()}, ${dayEvents.length} eventos, ${dayTasks.length} tareas, ${dayMeds.length} tratamientos`}
                onClick={() => setSelectedDayIdx(i)}
                className={`ed-day focus-ring${isSelected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}`}
              >
                <span className="ed-day-label">{dayLabel}</span>
                <span className="ed-day-num tabular-nums">{day.getDate()}</span>
                <span className="ed-day-ticks" aria-hidden="true">
                  {segments.map((kind, idx) => (
                    <span key={idx} className={`ed-tick${kind ? ` ed-tick-${kind}` : ''}`} />
                  ))}
                </span>
                {dayTasks.length > 0 && (
                  <span className="ed-day-tasks tabular-nums">{dayTasks.length}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="ed-rule" />
      </header>

      {/* Day-by-day — itinerario editorial */}
      <div className="ed-body">
        {days
          .map((day, i) => ({ day, i }))
          .filter(({ i }) => selectedDayIdx === null || selectedDayIdx === i)
          .map(({ day, i }, renderIdx) => {
          const dayEvents = events.filter(e => {
            const ed = new Date(e.date_start);
            return ed.toDateString() === day.toDateString();
          });
          const dayTasks = tasks.filter(t => t.due_date && new Date(t.due_date).toDateString() === day.toDateString());

          const dow = day.getDay();
          const dayIso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
          const dayRoutines = routines
            .filter(r => r.active && r.days_of_week.includes(dow))
            .map(r => {
              const exception = routineExceptions.find(rx => rx.routine_id === r.id && rx.date === dayIso);
              return { routine: r, exception };
            })
            .filter(({ exception }) => !exception || !exception.cancelled);

          const isToday = day.toDateString() === today.toDateString();
          const isPast = day < today && !isToday;
          const hasNothing = dayEvents.length === 0 && dayTasks.length === 0 && dayRoutines.length === 0;

          const todayMid = new Date(); todayMid.setHours(0, 0, 0, 0);
          const tomorrowMid = new Date(todayMid); tomorrowMid.setDate(tomorrowMid.getDate() + 1);
          const dayMid = new Date(day); dayMid.setHours(0, 0, 0, 0);
          let label: string;
          if (dayMid.getTime() === todayMid.getTime()) label = 'Hoy';
          else if (dayMid.getTime() === tomorrowMid.getTime()) label = 'Mañana';
          else label = day.toLocaleDateString('es', { weekday: 'long' });

          return (
            <section
              key={i}
              className={`ed-section${isPast && selectedDayIdx === null ? ' is-past' : ''}${isToday ? ' is-today' : ''}`}
              style={{ animationDelay: `${renderIdx * 70}ms` }}
            >
              <div className="ed-section-head">
                <span className="ed-section-num tabular-nums">{day.getDate()}</span>
                <span className="ed-section-label">{label}</span>
                <span className="ed-section-rule" />
              </div>

              {hasNothing ? (
                <Link href="/chat" className="ed-free focus-ring">
                  <span className="ed-free-line">Día libre</span>
                  <span className="ed-free-cta">Decile a Nanny qué agendar →</span>
                </Link>
              ) : (
                <div className="ed-entries">
                  {dayEvents.map(event => {
                    const child = getChild(event.child_id);
                    const time = new Date(event.date_start).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
                    return (
                      <div key={event.id} className="ed-entry ed-entry-event" onClick={() => router.push(`/evento/${event.id}`)}>
                        <span className="ed-entry-time tabular-nums">{time}</span>
                        <span className="ed-entry-mark" aria-hidden="true" />
                        <div className="ed-entry-body">
                          <p className="ed-entry-title">{event.title}</p>
                          <div className="ed-entry-meta">
                            <span className="ed-tag">{TYPE_LABEL[event.event_type] || 'Evento'}</span>
                            {event.location && (
                              <span className="ed-loc"><MapPin size={11} /> {event.location}</span>
                            )}
                          </div>
                        </div>
                        {child && <span className="ed-who" style={{ background: child.color || undefined }}>{child.name.charAt(0)}</span>}
                      </div>
                    );
                  })}

                  {dayRoutines.map(({ routine, exception }) => {
                    const child = getChild(routine.child_id);
                    const start = exception?.time_start_override || routine.time_start;
                    const end = exception?.time_end_override || routine.time_end;
                    const timeLabel = start && end ? `${start.slice(0, 5)}–${end.slice(0, 5)}` : start ? start.slice(0, 5) : '';
                    return (
                      <div key={routine.id} className="ed-entry ed-entry-routine" onClick={() => child && router.push(`/hijo/${child.id}`)}>
                        <span className="ed-entry-time tabular-nums">{timeLabel || '—'}</span>
                        <span className="ed-entry-mark" aria-hidden="true"><Repeat size={11} /></span>
                        <div className="ed-entry-body">
                          <p className="ed-entry-title is-routine">{routine.name}</p>
                          <div className="ed-entry-meta">
                            <span className="ed-tag is-routine">Rutina</span>
                          </div>
                        </div>
                        {child && <span className="ed-who" style={{ background: child.color || undefined }}>{child.name.charAt(0)}</span>}
                      </div>
                    );
                  })}

                  {dayTasks.map(task => {
                    const child = getChild(task.child_id);
                    return (
                      <div key={task.id} className="ed-entry ed-entry-task" onClick={() => router.push(`/tarea/${task.id}`)}>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleComplete(task.id); }}
                          aria-label="Completar tarea"
                          className="ed-check focus-ring"
                        >
                          <Circle size={17} />
                        </button>
                        <div className="ed-entry-body">
                          <p className="ed-entry-title">{task.title}</p>
                          <div className="ed-entry-meta">
                            <span className={`ed-tag is-pri-${task.priority}`}>{task.priority}</span>
                            {task.assigned_to && <span className="ed-loc">asignado</span>}
                          </div>
                        </div>
                        {child && <span className="ed-who" style={{ background: child.color || undefined }}>{child.name.charAt(0)}</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* FAB → chat. Editorial: bermellón con sombra dura. */}
      <Link href="/chat" aria-label="Decirle a Nanny" className="ed-fab focus-ring" style={{ bottom: 'calc(var(--nav-h) + 12px)' }}>
        <Plus size={24} />
      </Link>
    </div>
  );
}

function EditorialStyle() {
  return (
    <style>{`
      .agenda-ed {
        --paper: #F4EEE3;
        --ink: #1B1A16;
        --ink-soft: #6F675A;
        --ink-faint: rgba(27,26,22,0.14);
        --accent: #D33A24;
        --accent-deep: #A52A18;
        background-color: var(--paper);
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E");
        color: var(--ink);
        font-family: var(--ed-grotesque), system-ui, sans-serif;
        font-feature-settings: 'ss01';
        letter-spacing: -0.005em;
      }
      .agenda-ed .focus-ring:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      .agenda-ed button { cursor: pointer; }

      /* ── Masthead ── */
      .agenda-ed .ed-masthead {
        position: sticky; top: 0; z-index: var(--z-sticky);
        background-color: var(--paper);
        padding: max(env(safe-area-inset-top, 0px), 8px) 18px 0;
      }
      .agenda-ed .ed-rule-thick { height: 4px; background: var(--ink); }
      .agenda-ed .ed-rule { height: 1px; background: var(--ink-faint); }
      .agenda-ed .ed-masthead-row {
        display: flex; align-items: flex-end; justify-content: space-between;
        padding: 8px 0 10px;
      }
      .agenda-ed .ed-title {
        font-family: var(--ed-display), Georgia, serif;
        font-weight: 900; font-size: 40px; line-height: 0.92;
        letter-spacing: -0.02em; font-optical-sizing: auto;
      }
      .agenda-ed .ed-actions { display: flex; align-items: center; gap: 8px; }
      .agenda-ed .ed-btn-today {
        height: 34px; padding: 0 14px; border: 1.5px solid var(--ink);
        background: var(--accent); color: var(--paper);
        font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em;
        box-shadow: 2px 2px 0 var(--ink); transition: transform 120ms, box-shadow 120ms;
      }
      .agenda-ed .ed-btn-today:active { transform: translate(2px,2px); box-shadow: 0 0 0 var(--ink); }
      .agenda-ed .ed-icon-btn {
        width: 38px; height: 38px; display: flex; align-items: center; justify-content: center;
        color: var(--ink); border-radius: 50%; transition: background 120ms;
      }
      .agenda-ed .ed-icon-btn:hover { background: rgba(27,26,22,0.06); }

      .agenda-ed .ed-dateline {
        display: flex; align-items: center; justify-content: space-between; padding: 4px 0 10px;
      }
      .agenda-ed .ed-dateline-center { text-align: center; }
      .agenda-ed .ed-monthyear {
        font-family: var(--ed-display), Georgia, serif; font-style: italic; font-weight: 500;
        font-size: 19px; line-height: 1; text-transform: capitalize; letter-spacing: 0;
      }
      .agenda-ed .ed-dateline-sub { font-size: 11px; color: var(--ink-soft); margin-top: 3px; text-transform: capitalize; }
      .agenda-ed .ed-toggle {
        font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 700;
        color: var(--accent-deep); margin-top: 4px; border-bottom: 1px solid var(--accent);
        padding-bottom: 1px;
      }

      /* ── Week strip ── */
      .agenda-ed .ed-weekstrip { display: flex; gap: 0; padding: 8px 0; }
      .agenda-ed .ed-day {
        flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px;
        padding: 6px 2px 7px; position: relative; color: var(--ink-soft);
        border-radius: 3px;
      }
      .agenda-ed .ed-day-label { font-size: 10px; font-weight: 700; letter-spacing: 0.06em; }
      .agenda-ed .ed-day-num {
        font-family: var(--ed-display), Georgia, serif; font-weight: 600; font-size: 22px;
        line-height: 1; color: var(--ink); font-optical-sizing: auto;
      }
      .agenda-ed .ed-day.is-today .ed-day-num { color: var(--accent-deep); }
      .agenda-ed .ed-day.is-today::after {
        content: ''; position: absolute; bottom: 2px; width: 16px; height: 2px; background: var(--accent);
      }
      .agenda-ed .ed-day.is-selected {
        background: var(--ink); color: var(--paper);
      }
      .agenda-ed .ed-day.is-selected .ed-day-num,
      .agenda-ed .ed-day.is-selected .ed-day-label { color: var(--paper); }
      .agenda-ed .ed-day.is-selected.is-today::after { background: var(--accent); }
      .agenda-ed .ed-day-ticks { display: flex; gap: 1.5px; width: 100%; padding: 0 3px; margin-top: 1px; }
      .agenda-ed .ed-tick { flex: 1; height: 3px; background: var(--ink-faint); }
      .agenda-ed .ed-tick-event { background: var(--accent); }
      .agenda-ed .ed-tick-med { background: var(--ink); }
      .agenda-ed .ed-tick-task { background: var(--ink-soft); }
      .agenda-ed .ed-day.is-selected .ed-tick { background: rgba(244,238,227,0.3); }
      .agenda-ed .ed-day.is-selected .ed-tick-event,
      .agenda-ed .ed-day.is-selected .ed-tick-med,
      .agenda-ed .ed-day.is-selected .ed-tick-task { background: var(--paper); }
      .agenda-ed .ed-day-tasks {
        font-size: 9px; font-weight: 800; color: var(--accent-deep); line-height: 1;
        position: absolute; top: 4px; right: 4px;
      }
      .agenda-ed .ed-day.is-selected .ed-day-tasks { color: var(--paper); }

      /* ── Body / sections ── */
      .agenda-ed .ed-body { padding: 14px 18px 96px; }
      .agenda-ed .ed-section { animation: edRise 520ms cubic-bezier(0.2,0.7,0.2,1) both; margin-bottom: 26px; }
      .agenda-ed .ed-section.is-past { opacity: 0.45; }
      @keyframes edRise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }

      .agenda-ed .ed-section-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px; }
      .agenda-ed .ed-section-num {
        font-family: var(--ed-display), Georgia, serif; font-weight: 900; font-size: 34px;
        line-height: 0.8; letter-spacing: -0.03em; font-optical-sizing: auto;
      }
      .agenda-ed .ed-section.is-today .ed-section-num { color: var(--accent); }
      .agenda-ed .ed-section-label {
        font-size: 11px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase;
        color: var(--ink-soft); white-space: nowrap;
      }
      .agenda-ed .ed-section.is-today .ed-section-label { color: var(--accent-deep); }
      .agenda-ed .ed-section-rule { flex: 1; height: 1px; background: var(--ink); align-self: center; }

      /* ── Entries (itinerary) ── */
      .agenda-ed .ed-entries { display: flex; flex-direction: column; }
      .agenda-ed .ed-entry {
        display: flex; align-items: flex-start; gap: 11px; padding: 12px 2px;
        border-bottom: 1px solid var(--ink-faint); cursor: pointer;
        transition: background 120ms, transform 120ms;
      }
      .agenda-ed .ed-entry:active { transform: translateX(2px); }
      .agenda-ed .ed-entry:last-child { border-bottom: none; }
      .agenda-ed .ed-entry-time {
        font-family: var(--ed-display), Georgia, serif; font-weight: 600; font-size: 15px;
        color: var(--accent-deep); min-width: 48px; padding-top: 1px; line-height: 1.2;
        font-variant-numeric: tabular-nums; letter-spacing: 0;
      }
      .agenda-ed .ed-entry-routine .ed-entry-time { color: var(--ink-soft); font-style: italic; }
      .agenda-ed .ed-entry-mark {
        width: 16px; display: flex; justify-content: center; padding-top: 4px; color: var(--accent);
        flex-shrink: 0;
      }
      .agenda-ed .ed-entry-event .ed-entry-mark::before {
        content: ''; width: 7px; height: 7px; background: var(--accent); border-radius: 50%;
      }
      .agenda-ed .ed-entry-routine .ed-entry-mark { color: var(--ink-soft); }
      .agenda-ed .ed-entry-body { flex: 1; min-width: 0; }
      .agenda-ed .ed-entry-title {
        font-size: 16px; font-weight: 600; line-height: 1.25; color: var(--ink);
        letter-spacing: -0.01em;
      }
      .agenda-ed .ed-entry-title.is-routine { color: var(--ink-soft); font-weight: 500; }
      .agenda-ed .ed-entry-meta { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
      .agenda-ed .ed-tag {
        font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
        color: var(--ink-soft);
      }
      .agenda-ed .ed-tag.is-routine { color: var(--accent-deep); }
      .agenda-ed .ed-tag.is-pri-high, .agenda-ed .ed-tag.is-pri-urgent { color: var(--accent); }
      .agenda-ed .ed-loc {
        display: inline-flex; align-items: center; gap: 3px; font-size: 12px; color: var(--ink-soft);
        min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .agenda-ed .ed-check {
        margin-top: 1px; color: var(--ink-soft); width: 24px; height: 24px; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center; border-radius: 50%;
      }
      .agenda-ed .ed-check:hover { color: var(--accent); }
      .agenda-ed .ed-who {
        width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        font-size: 11px; font-weight: 800; color: var(--paper); background: var(--ink);
        border: 1.5px solid var(--ink); margin-top: 1px;
      }

      /* ── Empty ── */
      .agenda-ed .ed-free {
        display: flex; flex-direction: column; gap: 4px; padding: 14px 2px;
        border-bottom: 1px solid var(--ink-faint);
      }
      .agenda-ed .ed-free-line {
        font-family: var(--ed-display), Georgia, serif; font-style: italic; font-size: 17px; color: var(--ink-soft);
      }
      .agenda-ed .ed-free-cta { font-size: 12px; font-weight: 700; color: var(--accent-deep); letter-spacing: 0.02em; }

      /* ── FAB ── */
      .agenda-ed .ed-fab {
        position: fixed; right: 18px; z-index: var(--z-raised);
        width: 56px; height: 56px; display: flex; align-items: center; justify-content: center;
        background: var(--accent); color: var(--paper);
        border: 2px solid var(--ink); box-shadow: 4px 4px 0 var(--ink);
        transition: transform 120ms, box-shadow 120ms;
      }
      .agenda-ed .ed-fab:active { transform: translate(4px,4px); box-shadow: 0 0 0 var(--ink); }

      /* ── Skeleton ── */
      .agenda-ed .ed-skel { display: block; background: var(--ink-faint); }
      .agenda-ed .ed-skel-title { height: 36px; width: 150px; }
      .agenda-ed .ed-skel-dot { height: 34px; width: 34px; border-radius: 50%; }
      .agenda-ed .ed-skel-day { height: 52px; flex: 1; }
      .agenda-ed .ed-skel-entry { height: 56px; width: 100%; margin-bottom: 12px; }

      @media (prefers-reduced-motion: reduce) {
        .agenda-ed .ed-section { animation: none; }
      }
    `}</style>
  );
}
