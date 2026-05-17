import type { Scenario } from '../types';

/**
 * Escenario 2: Casos de silencio correcto.
 *
 * Mensajes donde Nanny DEBE callar según los principios + casos
 * fundacionales: cariño puro, desahogo emocional, coordinación pura
 * entre padres, conversación trivial.
 *
 * Este escenario testea que el cambio de §3.2 NO rompió los silencios
 * correctos. Si después del refactor Nanny empieza a "acusar todo", este
 * escenario lo detecta.
 */
export const scenario: Scenario = {
  id: 'silence-cases',
  name: 'Casos de silencio correcto',
  description: 'Mensajes donde Nanny debe callar: cariño, desahogo, coordinación entre padres, trivialidad.',
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
      text: 'te amo',
      expected_intervene: false,
      expected_silence_reason_includes: ['cariño', 'íntimo', 'amor'],
      expected_capture: { type: 'none' },
      expected_resolves_topic: null,
      notes: 'Mensaje íntimo entre padres → silencio total',
    },
    {
      sender_name: 'Christian',
      text: 'qué linda foto',
      expected_intervene: false,
      expected_capture: { type: 'none' },
      expected_resolves_topic: null,
      notes: 'Conversación trivial entre padres → silencio',
    },
    {
      sender_name: 'Delia',
      text: 'no doy más esta semana',
      expected_intervene: false,
      expected_silence_reason_includes: ['emocional', 'desahogo', 'vulnerable', 'no doy más', 'estrés'],
      expected_capture: { type: 'none' },
      expected_resolves_topic: null,
      notes: 'Caso 4 fundacional. Desahogo emocional → silencio + ajustar tono al día siguiente (no testeable acá)',
    },
    {
      sender_name: 'Christian',
      text: 'yo lo recojo hoy',
      expected_intervene: false,
      expected_capture: { type: 'none' },
      expected_resolves_topic: null,
      notes: 'Coordinación entre padres sin ambigüedad → silencio',
    },
    {
      sender_name: 'Delia',
      text: 'ok, gracias',
      expected_intervene: false,
      expected_capture: { type: 'none' },
      expected_resolves_topic: null,
      notes: 'Confirmación entre padres → silencio',
    },
  ],
};
