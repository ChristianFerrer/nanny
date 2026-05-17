import type { Scenario } from '../types';

/**
 * Escenario 6: Conflicto emocional entre padres.
 *
 * Discusión cargada, quejas mutuas, tensión. Nanny debe quedarse afuera
 * completamente — no opinar, no mediar, no señalar. Principio 3.6 (no
 * juzga) + caso 4 fundacional + línea roja §8.3 (no analiza relación).
 *
 * Si se cuela info logística entre las quejas, ahí sí puede acusar — pero
 * solo la parte logística, sin tocar la dinámica.
 */
export const scenario: Scenario = {
  id: 'emotional-conflict',
  name: 'Conflicto emocional entre padres',
  description: 'Discusión cargada. Nanny calla completamente excepto info logística aislada.',
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
      text: 'siempre me toca a mí todo, vos no hacés nada',
      expected_intervene: false,
      expected_silence_reason_includes: ['conflicto', 'emocional', 'no me involucro', 'observo'],
      expected_capture: { type: 'none' },
      expected_resolves_topic: null,
      notes: 'Queja con tensión → silencio. NO opinar, NO mediar.',
    },
    {
      sender_name: 'Christian',
      text: 'no es verdad, ayer fui yo al pediatra y al super',
      expected_intervene: false,
      expected_capture: { type: 'none' },
      expected_resolves_topic: null,
      notes: 'Defensa en discusión → silencio. NO tomar partido.',
    },
    {
      sender_name: 'Delia',
      text: 'me siento sola en esto',
      expected_intervene: false,
      expected_silence_reason_includes: ['emocional', 'vulnerable', 'desahogo', 'momento'],
      expected_capture: { type: 'none' },
      expected_resolves_topic: null,
      notes: 'Vulnerabilidad emocional → silencio total',
    },
    {
      sender_name: 'Christian',
      text: 'perdón. Mañana hay reunión escolar a las 18',
      expected_intervene: true,
      expected_capture: { type: 'learning_item' },
      expected_resolves_topic: null,
      notes: 'Mensaje mixto: disculpa (no acusable) + info logística (acusable). Acuse SOLO de la parte logística, sin tocar la disculpa.',
      expected_message_excludes: ['perdón', 'discusión', 'pelea', 'tensión', 'siento'],
    },
    {
      sender_name: 'Delia',
      text: 'gracias por avisar, voy yo',
      expected_intervene: false,
      // Acepto captura: parent_role_assignment es info legítima
      expected_resolves_topic: null,
      notes: 'Coordinación cerrada entre padres → silencio (captura opcional)',
    },
  ],
};
