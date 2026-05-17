import type { Scenario } from '../types';

/**
 * Escenario 5: Eventos y rutinas.
 *
 * Mensajes típicos de coordinación: cita médica, rutina semanal nueva,
 * tarea de compra, cambio de plan. Mide:
 *   - Que Nanny acuse cada uno (no caiga en "ya hay próxima acción visible")
 *   - Que capture learning items útiles cuando aplica
 *   - Que distinga info dirigida a Nanny vs coordinación entre padres
 */
export const scenario: Scenario = {
  id: 'events-and-routines',
  name: 'Eventos y rutinas',
  description: 'Cita médica, rutina nueva, compra, cambio de plan.',
  setup: {
    family_name: 'Familia Ferrer',
    timezone: 'Europe/Madrid',
    parents: [
      { id: 'p1', name: 'Christian', role: 'papa' },
      { id: 'p2', name: 'Delia', role: 'mama' },
    ],
    children: [
      { id: 'c1', name: 'Pau', birth_date: '2022-06-15', allergies: [], medical_notes: null, personality_notes: null },
    ],
    support_contacts: [],
    upcoming_events: [],
    pending_tasks: [],
    active_medications: [],
    patterns: [],
    preferences: [],
    learning_queue: [],
  },
  messages: [
    {
      sender_name: 'Delia',
      text: 'Pau tiene pediatra el viernes a las 10:30',
      expected_intervene: true,
      expected_capture: { type: 'learning_item' },
      expected_resolves_topic: null,
      notes: 'Cita médica → acuse + capture (eventualmente debería crear evento, pero eso es Sprint 3)',
    },
    {
      sender_name: 'Christian',
      text: 'yo lo llevo',
      expected_intervene: false,
      // Acepto captura de parent_role_assignment — es info legítima que puede formarse patrón
      expected_resolves_topic: null,
      notes: 'Coordinación entre padres asignando responsable → silencio (captura opcional)',
    },
    {
      sender_name: 'Delia',
      text: 'los lunes Pau tiene fútbol a las 17 en el club Pinar',
      expected_intervene: true,
      expected_capture: { type: 'learning_item' },
      expected_resolves_topic: null,
      notes: 'Rutina semanal nueva → acuse + capture',
    },
    {
      sender_name: 'Christian',
      text: 'hay que comprar pañales talle 4',
      expected_intervene: true,
      // Acepto captura: el modelo puede registrar talle como learning útil
      expected_resolves_topic: null,
      notes: 'Tarea concreta sin coordinación previa → acuse (captura opcional)',
    },
    {
      sender_name: 'Delia',
      text: 'cambio: pediatra es el jueves no el viernes',
      expected_intervene: true,
      expected_capture: { type: 'none' },
      expected_resolves_topic: null,
      notes: 'Cambio de plan sobre algo recién dicho → acuse',
    },
  ],
};
