import type { Scenario } from '../types';

/**
 * Escenario 1: Correcciones y enseñanzas.
 *
 * Christian le enseña a Nanny preferencias y la corrige. El target: TODO
 * mensaje dirigido a Nanny debería recibir un acuse en su voz, y el sistema
 * debería capturar las preferences/learning items.
 *
 * Este escenario testea el refactor de §3.2 (PR #9): el principio nuevo es
 * "Cerrá el loop comunicativo".
 */
export const scenario: Scenario = {
  id: 'corrections-and-teachings',
  name: 'Correcciones y enseñanzas',
  description: 'Christian enseña aliases, corrige a Nanny, y le pasa info que Nanny tiene que recordar más adelante.',
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
      sender_name: 'Christian',
      text: 'no me hables del cumple de Pau, lo manejo yo',
      expected_intervene: true,
      expected_capture: { type: 'preference', preference_type: 'topic_avoid', source: 'explicit' },
      expected_resolves_topic: null,
      notes: 'Enseñanza explícita → acuse obligatorio + capture',
    },
    {
      sender_name: 'Christian',
      text: 'a Pau decile Pauli, le gusta más',
      expected_intervene: true,
      expected_capture: { type: 'preference', preference_type: 'name_alias', source: 'explicit' },
      expected_resolves_topic: null,
      notes: 'Enseñanza de alias → acuse + capture',
    },
    {
      sender_name: 'Christian',
      text: 'mejor decile Pau, no Pauli',
      expected_intervene: true,
      expected_capture: { type: 'preference', preference_type: 'name_alias', source: 'correction' },
      expected_resolves_topic: null,
      notes: 'Corrección del turno anterior → acuse + capture con source=correction',
    },
    {
      sender_name: 'Christian',
      text: 'la pediatra dijo que volvamos en dos semanas',
      expected_intervene: true,
      expected_capture: { type: 'learning_item', topic_hint: 'pediatra' },
      expected_resolves_topic: null,
      notes: 'Info a recordar → acuse + learning item',
    },
    {
      sender_name: 'Christian',
      text: 'los miércoles a Pau lo recoge la abuela del cole',
      expected_intervene: true,
      expected_capture: { type: 'learning_item', topic_hint: 'abuela' },
      expected_resolves_topic: null,
      notes: 'Patrón implícito con persona no en contactos → acuse + learning item',
    },
  ],
};
