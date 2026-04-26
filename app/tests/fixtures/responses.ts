import type { NannyResponse } from '../../src/lib/types';

/**
 * Respuestas predefinidas de Nanny para diferentes tipos de mensajes.
 *
 * Los mocks de `/api/chat` deciden qué respuesta devolver según keywords
 * en el texto del mensaje del usuario.
 */

export const nannyResponses: Record<string, NannyResponse> = {
  default: {
    reply: 'Entendido, anotado.',
    intent: 'CHAT',
    next_action: 'stay_silent',
  },

  medication: {
    reply: 'Anoté el medicamento. ¿Querés que cree recordatorios?',
    intent: 'MEDICATION',
    next_action: 'confirm_medication',
    child: 'Pau',
    confirmation: {
      type: 'medication',
      data: {
        medication_name: 'Jarabe Test',
        child_name: 'Pau',
        frequency: '3 veces al día',
        schedule_times: ['08:00', '14:00', '20:00'],
        start_date: '2026-04-26',
        end_date: '2026-05-03',
        duration_days: 7,
      },
    },
  },

  event: {
    reply: 'Anoté la cita. ¿Confirmás que la agregue?',
    intent: 'EVENT_MEDICAL',
    next_action: 'confirm_event',
    child: 'Pau',
    confirmation: {
      type: 'event',
      data: {
        title: 'Cita pediatra',
        event_type: 'doctor',
        date_start: '2026-04-29T15:00:00.000Z',
        location: null,
      },
    },
  },

  task: {
    reply: 'Tarea agregada.',
    intent: 'TASK_SHOPPING',
    next_action: 'confirm_task',
    confirmation: {
      type: 'task',
      data: {
        title: 'Comprar leche',
        assigned_to: null,
        due_date: null,
        priority: 'normal',
      },
    },
  },
};

/**
 * Decide qué respuesta de Nanny devolver según el texto del mensaje.
 */
export function pickResponse(text: string): NannyResponse {
  const lower = text.toLowerCase();
  if (/jarabe|medicament|antibiótico|gotas|tabletas|toma\s+\d+\s+veces/.test(lower)) {
    return nannyResponses.medication;
  }
  if (/cita|reuni[oó]n|excursi[oó]n|fiesta|cumple/.test(lower)) {
    return nannyResponses.event;
  }
  if (/comprar|compra|necesit[oa] (.*) (pañales|leche|útiles)/.test(lower)) {
    return nannyResponses.task;
  }
  return nannyResponses.default;
}
