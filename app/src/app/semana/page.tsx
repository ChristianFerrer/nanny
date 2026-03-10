'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Clock, MapPin } from 'lucide-react';
import { getEvents, getChildren } from '@/lib/store';
import type { FamilyEvent, Child } from '@/lib/types';

export default function SemanaPage() {
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);

  const loadData = useCallback(async () => {
    const [e, c] = await Promise.all([getEvents(), getChildren()]);
    setEvents(e);
    setChildren(c);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

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

  const typeEmoji: Record<string, string> = {
    doctor: '🏥', school: '🏫', birthday: '🎂', activity: '⚽', travel: '✈️', other: '📌',
  };

  const typeColor: Record<string, string> = {
    doctor: 'border-l-red-400', school: 'border-l-blue-400', birthday: 'border-l-pink-400',
    activity: 'border-l-green-400', travel: 'border-l-purple-400', other: 'border-l-gray-400',
  };

  const monthYear = startOfWeek.toLocaleDateString('es', { month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-white border-b px-4 pt-12 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setWeekOffset(w => w - 1)}
            className="p-2 rounded-full hover:bg-[var(--nanny-gray-light)]"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="text-center">
            <h1 className="font-semibold capitalize">{monthYear}</h1>
            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                className="text-xs text-[var(--nanny-purple)] font-medium"
              >
                Ir a esta semana
              </button>
            )}
          </div>
          <button
            onClick={() => setWeekOffset(w => w + 1)}
            className="p-2 rounded-full hover:bg-[var(--nanny-gray-light)]"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Day pills */}
        <div className="flex justify-between">
          {days.map((day, i) => {
            const isToday = day.toDateString() === today.toDateString();
            const dayEvents = events.filter(e => {
              const ed = new Date(e.date_start);
              return ed.toDateString() === day.toDateString();
            });
            const dayNames = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
            return (
              <div
                key={i}
                className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl ${
                  isToday ? 'bg-[var(--nanny-purple)] text-white' : ''
                }`}
              >
                <span className={`text-[10px] font-medium ${isToday ? 'text-white/80' : 'text-[var(--nanny-gray)]'}`}>
                  {dayNames[i]}
                </span>
                <span className={`text-sm font-semibold ${isToday ? '' : ''}`}>
                  {day.getDate()}
                </span>
                {dayEvents.length > 0 && (
                  <div className={`w-1.5 h-1.5 rounded-full ${isToday ? 'bg-white' : 'bg-[var(--nanny-purple)]'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Day-by-day events */}
      <div className="px-4 py-4 space-y-4 pb-20">
        {days.map((day, i) => {
          const dayEvents = events.filter(e => {
            const ed = new Date(e.date_start);
            return ed.toDateString() === day.toDateString();
          });
          const isToday = day.toDateString() === today.toDateString();
          const isPast = day < today && !isToday;

          if (dayEvents.length === 0 && !isToday) return null;

          return (
            <div key={i} className={isPast ? 'opacity-50' : ''}>
              <h3 className={`text-xs font-semibold mb-2 ${
                isToday ? 'text-[var(--nanny-purple)]' : 'text-[var(--nanny-gray)]'
              }`}>
                {isToday ? '📍 HOY' : day.toLocaleDateString('es', { weekday: 'long', day: 'numeric' }).toUpperCase()}
              </h3>
              {dayEvents.length === 0 ? (
                <div className="bg-white rounded-xl p-3 text-center text-sm text-[var(--nanny-gray)]">
                  Sin eventos
                </div>
              ) : (
                <div className="space-y-2">
                  {dayEvents.map(event => {
                    const child = getChild(event.child_id);
                    const time = new Date(event.date_start).toLocaleTimeString('es', {
                      hour: '2-digit', minute: '2-digit',
                    });
                    return (
                      <div
                        key={event.id}
                        className={`bg-white rounded-xl p-3 border-l-4 ${typeColor[event.event_type] || 'border-l-gray-400'} shadow-sm`}
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-lg">{typeEmoji[event.event_type] || '📌'}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{event.title}</p>
                            <div className="flex items-center gap-2 mt-1 text-xs text-[var(--nanny-gray)]">
                              <span className="flex items-center gap-0.5">
                                <Clock size={10} /> {time}
                              </span>
                              {event.location && (
                                <span className="flex items-center gap-0.5 truncate">
                                  <MapPin size={10} /> {event.location}
                                </span>
                              )}
                            </div>
                          </div>
                          {child && <span className="text-lg">{child.emoji}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
