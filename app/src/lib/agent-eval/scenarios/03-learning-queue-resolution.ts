import type { Scenario } from '../types';

/**
 * Escenario 3: Resolución de learning queue.
 *
 * Testea que cuando el padre responde a algo que Nanny tenía encolado
 * (porque memory updater lo agregó o porque ella misma lo capturó), el
 * agente:
 *   1. Acusa el aterrizaje
 *   2. Marca el item como resolved (resolves_learning_topic en el JSON)
 *
 * Esto fue el bug del PR #7: el modelo veía la queue pero no marcaba
 * resolved → items quedaban pending para siempre.
 */
export const scenario: Scenario = {
  id: 'learning-queue-resolution',
  name: 'Resolución de learning queue',
  description: 'Nanny tiene items pendientes en la cola; el padre los resuelve.',
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
    learning_queue: [
      {
        topic: 'pediatra_followup_date',
        urgency: 'medium',
        question_text: '¿Cuándo es el próximo control con la pediatra?',
      },
      {
        topic: 'abuela_phone',
        urgency: 'low',
        question_text: 'No tengo el contacto de la abuela; ¿me lo pasan cuando puedan?',
      },
      {
        topic: 'colegio_email_contacto',
        urgency: 'low',
        question_text: '¿Cuál es el email del colegio para inscripciones?',
      },
    ],
  },
  messages: [
    {
      sender_name: 'Christian',
      text: 'ya volvimos del pediatra, dijo que en dos semanas hay control',
      expected_intervene: true,
      expected_capture: { type: 'learning_item' }, // puede capturar la fecha exacta como nuevo item, ok
      expected_resolves_topic: 'pediatra_followup_date',
      notes: 'Resuelve item de pediatra_followup_date',
    },
    {
      sender_name: 'Delia',
      text: 'el cumple de Pau es el 15 de junio',
      expected_intervene: true,
      expected_capture: { type: 'learning_item' },
      expected_resolves_topic: null,
      notes: 'Info nueva — no resuelve ningún item específico de la cola',
    },
    {
      sender_name: 'Christian',
      text: 'el teléfono de mi mamá es +34 600 123 456',
      expected_intervene: true,
      expected_capture: { type: 'learning_item' }, // puede capturar como support_contact_pending
      expected_resolves_topic: 'abuela_phone',
      notes: 'Resuelve item de abuela_phone',
    },
  ],
};
