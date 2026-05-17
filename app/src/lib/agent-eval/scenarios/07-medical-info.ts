import type { Scenario } from '../types';

/**
 * Escenario 7: Información médica (caso 1 fundacional).
 *
 * Padres reportan síntomas, medicación, dosis. Nanny:
 *   - Acuse breve (info que va a necesitar para follow-up)
 *   - Tono médico: cero emojis, frases cortas y precisas (barrera de estilo)
 *   - Captura el dato para poder hacer recordatorio o follow-up después
 *
 * NO testeamos el follow-up posterior (caso fundacional 1 termina con
 * Nanny diciendo "puede tomar otra dosis a las 14"). Eso requiere
 * scheduled trigger, no message trigger — fuera de scope de este runner.
 */
export const scenario: Scenario = {
  id: 'medical-info',
  name: 'Información médica',
  description: 'Síntomas, medicación, dosis. Acuse sobrio + captura para follow-up.',
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
      text: 'le di paracetamol a Pau a las 8, tenía 38',
      expected_intervene: false,
      expected_capture: { type: 'learning_item' },
      expected_resolves_topic: null,
      notes: 'Caso 1 fundacional EXACTO: silencio inmediato + captura interna. El follow-up llega a las 14h (scheduled, fuera de scope del runner).',
    },
    {
      sender_name: 'Delia',
      text: 'la pediatra recetó amoxicilina cada 8 horas por 7 días',
      expected_intervene: true,
      expected_capture: { type: 'learning_item' },
      expected_resolves_topic: null,
      notes: 'Tratamiento médico → acuse + captura para programar tomas',
      expected_message_excludes: ['💊', '🤒', '😊', '!'],
    },
    {
      sender_name: 'Christian',
      text: 'sigue con fiebre',
      expected_intervene: true,
      // Acepto captura porque puede haber follow-up útil
      expected_resolves_topic: null,
      notes: 'Update de síntoma — acuse mínimo, sin alarmar ni opinar',
      expected_message_excludes: ['preocup', 'urgente', 'corré', 'llamá', '!'],
    },
    {
      sender_name: 'Delia',
      text: 'le doy la siguiente dosis a las 16',
      expected_intervene: false,
      // Acepto captura del horario de la dosis como útil para follow-up
      expected_resolves_topic: null,
      notes: 'Coordinación entre padres ejecutando lo coordinado → silencio',
    },
  ],
};
