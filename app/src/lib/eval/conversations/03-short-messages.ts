import type { SyntheticConversation } from '../types';

/**
 * Pareja Mensajes Cortos: Marta y Andrés
 * Hijos: Pablo (5)
 * Escenario: Coordinación con mensajes mínimos, mucha ambigüedad.
 */
export const conversation: SyntheticConversation = {
  id: 'short-messages-01',
  profileId: 'short-messages',
  name: 'Coordinación con mensajes telegráficos',
  description: 'Marta y Andrés coordinan dentista, recogida y cumpleaños con mensajes cortos y ambiguos.',
  topics: ['cita médica', 'logística recogida', 'cumpleaños', 'compras'],
  messages: [
    { sender: 'mama', text: 'dentista pablo viernes', delayMinutes: 0 },
    { sender: 'papa', text: 'hora?', delayMinutes: 1 },
    { sender: 'mama', text: '4', delayMinutes: 1 },
    { sender: 'papa', text: 'lo llevo yo', delayMinutes: 2 },
    { sender: 'mama', text: '👍', delayMinutes: 2 },
    { sender: 'mama', text: 'cumple marcos sábado', delayMinutes: 30 },
    { sender: 'papa', text: 'regalo?', delayMinutes: 31 },
    { sender: 'mama', text: 'si hay q comprar', delayMinutes: 32 },
    { sender: 'papa', text: 'yo veo', delayMinutes: 33 },
    { sender: 'mama', text: 'a las 3 en su casa', delayMinutes: 34 },
    { sender: 'papa', text: 'ok lo llevo', delayMinutes: 35 },
    { sender: 'mama', text: 'mañana recojo yo del jardín', delayMinutes: 60 },
    { sender: 'papa', text: 'va', delayMinutes: 61 },
  ],
  expectedDetections: [
    {
      type: 'event',
      intent: 'EVENT_MEDICAL',
      data: {
        title: 'Dentista Pablo',
        event_type: 'doctor',
        date_start: 'viernes 16:00',
        assigned_to: 'papa',
        child: 'Pablo',
      },
      detectedAtMessage: 3,
    },
    {
      type: 'event',
      intent: 'MILESTONE',
      data: {
        title: 'Cumpleaños Marcos',
        date_start: 'sábado 15:00',
        location: 'su casa',
      },
      ambiguousFields: ['child'],
      detectedAtMessage: 9,
    },
    {
      type: 'task',
      intent: 'TASK_SHOPPING',
      data: {
        title: 'Comprar regalo para Marcos',
        assigned_to: 'papa',
      },
      detectedAtMessage: 8,
    },
    {
      type: 'event',
      intent: 'LOGISTICS_PICKUP',
      data: {
        title: 'Recoger Pablo del jardín',
        date_start: 'mañana',
        assigned_to: 'mama',
        child: 'Pablo',
      },
      detectedAtMessage: 11,
    },
  ],
  expectedBehavior: {
    shouldAskForMissing: ['hora dentista'],
    shouldUsePendingDetection: true,
    shouldDetectDelegation: true,
    shouldStaySilentAt: [4, 12],
    idealResponseSummary: 'Nanny interpreta mensajes telegráficos: "4" = 16:00, "cumple marcos sábado" = cumpleaños. Conecta mensajes fragmentados para completar datos.',
  },
};
