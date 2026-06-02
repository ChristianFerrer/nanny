/**
 * Hook de Supabase Realtime para sincronización entre dispositivos.
 *
 * Cuando un padre agrega un evento desde su teléfono, el otro debe ver el
 * cambio sin tener que recargar manualmente. Usa Supabase Realtime
 * (websockets sobre Postgres logical replication).
 *
 * Uso:
 *   useRealtimeFamily({
 *     familyId,
 *     tables: ['events', 'tasks', 'routines', 'routine_exceptions', 'medications'],
 *     onChange: loadData,
 *   });
 *
 * Pre-requisito en Supabase: las tablas deben estar en la publication
 * `supabase_realtime`. Una sola vez:
 *   ALTER PUBLICATION supabase_realtime ADD TABLE events, tasks, routines,
 *     routine_exceptions, medications, medication_intakes;
 *
 * Patrón:
 * - Una sola suscripción por familia, no una por tabla (más eficiente)
 * - Filtro server-side por family_id donde aplica; client-side para tablas
 *   sin family_id (routines, routine_exceptions) — esas se refetchean por
 *   defecto y el componente filtra
 * - Debounce 200ms: si llegan varios eventos juntos (ej. delete cascade),
 *   onChange se invoca una sola vez al final
 * - Cleanup garantizado en unmount: previene memory leaks tras navegaciones
 */

import { useEffect, useRef } from 'react';
import { getSupabase } from './supabase';

const TABLES_WITH_FAMILY_ID = new Set([
  'events',
  'tasks',
  'medications',
  'medication_intakes',
  'messages',
  'children',
  'parents',
]);

const DEBOUNCE_MS = 200;

export interface UseRealtimeFamilyOptions {
  familyId: string;
  tables: string[];
  onChange: () => void | Promise<void>;
  /** Si false, no se suscribe (útil cuando familyId todavía no está listo) */
  enabled?: boolean;
}

export function useRealtimeFamily({ familyId, tables, onChange, enabled = true }: UseRealtimeFamilyOptions) {
  // Mantenemos referencia mutable a onChange para no recrear la suscripción
  // cada vez que el componente re-renderiza con un loadData nuevo.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Las dependencias del effect son los inputs estables (familyId + tables.join);
  // serializamos tables para evitar re-suscripciones por referencia nueva del array.
  const tablesKey = tables.join(',');

  useEffect(() => {
    if (!enabled || !familyId || tables.length === 0) return;

    const supabase = getSupabase();
    const channel = supabase.channel(`family-${familyId}`);

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const triggerOnChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        onChangeRef.current();
      }, DEBOUNCE_MS);
    };

    for (const table of tables) {
      const filter = TABLES_WITH_FAMILY_ID.has(table)
        ? `family_id=eq.${familyId}`
        : undefined; // routines / routine_exceptions: sin filtro server-side
      channel.on(
        'postgres_changes' as never,
        {
          event: '*',
          schema: 'public',
          table,
          ...(filter ? { filter } : {}),
        },
        () => triggerOnChange(),
      );
    }

    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        // En caso de problema con la suscripción, el polling de chat y el
        // refetch en mount son la red de seguridad. No reintentamos en loop
        // para no consumir batería; la próxima navegación re-arma el canal.
        console.warn('[realtime] channel issue:', status);
      }
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [familyId, tablesKey, enabled, tables]);
}
