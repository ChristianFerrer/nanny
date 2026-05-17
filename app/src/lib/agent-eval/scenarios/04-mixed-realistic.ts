import type { Scenario } from '../types';

/**
 * Escenario 4: Conversación realista mezclada.
 *
 * Mezcla cariño + logística + correcciones + desahogo, intercalados como
 * una conversación familiar de un día normal. Testea que Nanny mantiene
 * criterio cuando el contexto cambia rápido.
 */
export const scenario: Scenario = {
  id: 'mixed-realistic',
  name: 'Conversación realista mezclada',
  description: 'Día normal de familia: cariño, logística, correcciones, desahogo.',
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
    upcoming_events: [
      {
        id: 'e1',
        title: 'Pediatra Pau',
        date_start: '2026-05-20T10:30:00+02:00',
        date_end: null,
        location: 'Clínica del Carmen',
        assigned_to: 'p2',
        child_id: 'c1',
        status: 'confirmed',
      },
    ],
    pending_tasks: [],
    active_medications: [],
    patterns: [],
    preferences: [],
    learning_queue: [],
  },
  messages: [
    {
      sender_name: 'Delia',
      text: 'la profe de Pau cambió el horario de salida a las 16:30',
      expected_intervene: true,
      expected_capture: { type: 'learning_item' },
      expected_resolves_topic: null,
      notes: 'Info nueva → acuse + capture (cambio de horario relevante)',
    },
    {
      sender_name: 'Delia',
      text: 'ah y dile a Christian que yo no puedo ir',
      expected_intervene: false,
      expected_capture: { type: 'none' },
      expected_resolves_topic: null,
      notes: 'Mensaje dirigido al OTRO padre, no a Nanny → silencio',
    },
    {
      sender_name: 'Christian',
      text: 'ok yo lo recojo',
      expected_intervene: false,
      expected_capture: { type: 'none' },
      expected_resolves_topic: null,
      notes: 'Coordinación cerrada entre padres → silencio',
    },
    {
      sender_name: 'Delia',
      text: '¿podés recordarme el cumple de la abuela en septiembre?',
      expected_intervene: true,
      expected_capture: { type: 'learning_item' },
      expected_resolves_topic: null,
      notes: 'Pregunta directa a Nanny (instrucción) → acuse + learning item',
    },
    {
      sender_name: 'Delia',
      text: 'estoy agotada con esta semana',
      expected_intervene: false,
      expected_silence_reason_includes: ['emocional', 'desahogo', 'vulnerable', 'estrés', 'agotad'],
      expected_capture: { type: 'none' },
      expected_resolves_topic: null,
      notes: 'Desahogo → silencio (NO ack, NO comment)',
    },
    {
      sender_name: 'Christian',
      text: 'para Pau el desayuno es siempre yogur con cereales',
      expected_intervene: true,
      expected_capture: { type: 'learning_item' },
      expected_resolves_topic: null,
      notes: 'Enseñanza personal sobre el hijo → acuse + capture',
    },
  ],
};
