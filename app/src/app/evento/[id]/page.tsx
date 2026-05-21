'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Save, Trash2, Calendar, Clock, MapPin, User as UserIcon,
  Stethoscope, GraduationCap, Trophy, Cake, Plane, MapPin as MapPinAlt,
  AlertTriangle,
} from 'lucide-react';
import { getEvents, getChildren, getParents, getCachedSnapshot, updateEvent, deleteEvent } from '@/lib/store';
import type { FamilyEvent, Child, Parent } from '@/lib/types';
import DetailHeader from '@/components/DetailHeader';

const TYPE_OPTIONS: { value: string; label: string; icon: React.ReactNode }[] = [
  { value: 'doctor', label: 'Médico', icon: <Stethoscope size={14} /> },
  { value: 'school', label: 'Cole', icon: <GraduationCap size={14} /> },
  { value: 'birthday', label: 'Cumple', icon: <Cake size={14} /> },
  { value: 'activity', label: 'Actividad', icon: <Trophy size={14} /> },
  { value: 'travel', label: 'Viaje', icon: <Plane size={14} /> },
  { value: 'other', label: 'Otro', icon: <MapPinAlt size={14} /> },
];

export default function EventoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const _snap = getCachedSnapshot();

  const [event, setEvent] = useState<FamilyEvent | null>(() => _snap?.events.find(e => e.id === id) || null);
  const [children, setChildren] = useState<Child[]>(_snap?.children || []);
  const [parents, setParents] = useState<Parent[]>(_snap?.parents || []);
  const [loading, setLoading] = useState(!_snap);
  const [notFound, setNotFound] = useState(false);

  const [title, setTitle] = useState(event?.title || '');
  const [eventType, setEventType] = useState(event?.event_type || 'other');
  const [dateStr, setDateStr] = useState(event?.date_start ? event.date_start.split('T')[0] : '');
  const [timeStr, setTimeStr] = useState(event?.date_start ? new Date(event.date_start).toTimeString().slice(0, 5) : '');
  const [location, setLocation] = useState(event?.location || '');
  const [description, setDescription] = useState(event?.description || '');
  const [childId, setChildId] = useState<string | null>(event?.child_id ?? null);
  const [status, setStatus] = useState<FamilyEvent['status']>(event?.status || 'pending');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [e, c, p] = await Promise.all([getEvents(), getChildren(), getParents()]);
      setChildren(c);
      setParents(p);
      const found = e.find(x => x.id === id) || null;
      if (!found) {
        setNotFound(true);
      } else {
        setEvent(found);
        setTitle(found.title);
        setEventType(found.event_type);
        setDateStr(found.date_start.split('T')[0]);
        setTimeStr(new Date(found.date_start).toTimeString().slice(0, 5));
        setLocation(found.location || '');
        setDescription(found.description || '');
        setChildId(found.child_id);
        setStatus(found.status);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async () => {
    if (!event) return;
    setSaving(true);
    const dateStart = `${dateStr}T${timeStr || '00:00'}:00`;
    await updateEvent(event.id, {
      title: title.trim(),
      event_type: eventType,
      date_start: dateStart,
      location: location.trim() || null,
      description: description.trim() || null,
      child_id: childId,
      status,
    });
    setSaving(false);
    router.back();
  };

  const handleDelete = async () => {
    if (!event) return;
    await deleteEvent(event.id);
    router.back();
  };

  if (loading) {
    return (
      <div className="min-h-dvh bg-white pb-24 page-enter">
        <header className="px-5 pt-header pb-4">
          <div className="skeleton size-9 rounded-full mb-3" />
          <div className="skeleton h-7 w-48" />
        </header>
        <div className="px-5 space-y-4">
          <div className="skeleton h-10 w-full rounded-xl" />
          <div className="skeleton h-10 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (notFound || !event) {
    return (
      <div className="min-h-dvh bg-white pb-24 page-enter px-5 pt-header">
        <button
          onClick={() => router.back()}
          aria-label="Volver"
          className="size-10 -ml-2 rounded-full flex items-center justify-center text-[var(--text-secondary)] focus-ring tap-highlight mb-4"
        >
          <ArrowLeft size={26} />
        </button>
        <p className="text-headline">Evento no encontrado</p>
        <p className="text-footnote text-[var(--text-tertiary)] mt-1 text-pretty">Puede que haya sido eliminado.</p>
      </div>
    );
  }

  const child = children.find(c => c.id === childId);

  return (
    <div className="min-h-dvh bg-[var(--bg-canvas)] pb-24 page-enter">
      <DetailHeader title="Editar evento" subtitle={child?.name} />

      <div className="px-5 mt-4 space-y-4">
        <div>
          <label htmlFor="evento-titulo" className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Título</label>
          <input id="evento-titulo" type="text" value={title} onChange={e => setTitle(e.target.value)} />
        </div>

        <div>
          <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Tipo</label>
          <div className="flex gap-2 flex-wrap">
            {TYPE_OPTIONS.map(({ value, label, icon }) => (
              <ChipButton key={value} active={eventType === value} onClick={() => setEventType(value)}>
                <span className="inline-flex items-center gap-1">{icon} {label}</span>
              </ChipButton>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="evento-fecha" className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider inline-flex items-center gap-1">
              <Calendar size={12} /> Fecha
            </label>
            <input id="evento-fecha" type="date" value={dateStr} onChange={e => setDateStr(e.target.value)} />
          </div>
          <div>
            <label htmlFor="evento-hora" className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider inline-flex items-center gap-1">
              <Clock size={12} /> Hora
            </label>
            <input id="evento-hora" type="time" value={timeStr} onChange={e => setTimeStr(e.target.value)} />
          </div>
        </div>

        <div>
          <label htmlFor="evento-lugar" className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider inline-flex items-center gap-1">
            <MapPin size={12} /> Lugar (opcional)
          </label>
          <input id="evento-lugar" type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="Cole, club, casa…" />
        </div>

        <div>
          <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider inline-flex items-center gap-1">
            <UserIcon size={12} /> Hijo (opcional)
          </label>
          <div className="flex gap-2 flex-wrap">
            <ChipButton active={childId === null} onClick={() => setChildId(null)}>Ninguno</ChipButton>
            {children.map(c => (
              <ChipButton key={c.id} active={childId === c.id} onClick={() => setChildId(c.id)}>
                {c.name}
              </ChipButton>
            ))}
          </div>
          {child && <p className="text-caption-2 text-[var(--text-tertiary)] mt-1">Asociado a {child.name}</p>}
        </div>

        <div>
          <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Estado</label>
          <div className="flex gap-2">
            <ChipButton active={status === 'pending'} onClick={() => setStatus('pending')}>Pendiente</ChipButton>
            <ChipButton active={status === 'confirmed'} onClick={() => setStatus('confirmed')}>Confirmado</ChipButton>
            <ChipButton active={status === 'completed'} onClick={() => setStatus('completed')}>Completado</ChipButton>
            <ChipButton active={status === 'cancelled'} onClick={() => setStatus('cancelled')}>Cancelado</ChipButton>
          </div>
        </div>

        <div>
          <label htmlFor="evento-notas" className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Notas (opcional)</label>
          <textarea
            id="evento-notas"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            placeholder="Algo importante a recordar"
          />
        </div>

        <button onClick={handleSave} disabled={saving || !title.trim() || !dateStr} className="btn btn-primary btn-block">
          <Save size={18} /> {saving ? 'Guardando…' : 'Guardar'}
        </button>

        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="btn btn-block mt-1"
            style={{ background: 'transparent', color: 'var(--danger)' }}
          >
            <Trash2 size={16} /> Eliminar evento
          </button>
        ) : (
          <div className="rounded-xl p-3" style={{ background: 'var(--danger-soft)' }}>
            <p role="alert" className="text-footnote text-[var(--text-primary)] mb-2 inline-flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-[var(--danger)]" />
              ¿Eliminar este evento?
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)} className="btn btn-secondary btn-sm flex-1">Cancelar</button>
              <button autoFocus onClick={handleDelete} className="btn btn-destructive btn-sm flex-1">Eliminar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChipButton({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-footnote font-medium transition-colors focus-ring"
      style={{
        background: active ? 'var(--nanny-purple)' : 'var(--gray-100)',
        color: active ? 'white' : 'var(--text-secondary)',
      }}
    >
      {children}
    </button>
  );
}
