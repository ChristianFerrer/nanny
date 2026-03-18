import type { SyntheticConversation } from '../types';

/**
 * Pareja Cariñosa Desordenada: Lucía y Daniel
 * Hijos: Emilia (5)
 * Escenario: Info útil perdida entre mensajes de cariño, desordenados pero felices.
 */
export const conversation: SyntheticConversation = {
  id: 'loving-messy-01',
  profileId: 'loving-messy',
  name: 'Amor y caos: info perdida entre cariño',
  description: 'Lucía y Daniel mezclan info de natación, viaje y cumpleaños entre mensajes cariñosos.',
  topics: ['actividad extracurricular', 'viaje', 'cumpleaños', 'compras'],
  messages: [
    { sender: 'mama', text: 'Mi amor buenos días 💕 cómo dormiste?', delayMinutes: 0 },
    { sender: 'papa', text: 'Bien mi vida, te extrañé. Oye Emilia empieza natación el lunes no?', delayMinutes: 2 },
    { sender: 'mama', text: 'Ay sí se me olvidaba! Lunes y miércoles 3pm en la alberca del deportivo', delayMinutes: 3 },
    { sender: 'papa', text: 'Jaja siempre se nos olvida todo 😂 yo la llevo el lunes, tú el miércoles?', delayMinutes: 4 },
    { sender: 'mama', text: 'Sí perfecto mi amor. Te amo 💕 ah oye y el cumple de Emilia es en 2 semanas, hay que organizar la fiesta', delayMinutes: 5 },
    { sender: 'papa', text: 'Verdaad! Hay que buscar el salón. Y el pastel. Y las invitaciones 😅', delayMinutes: 7 },
    { sender: 'mama', text: 'Jaja somos un desastre. Yo busco el salón esta semana. Tú encárgate del pastel?', delayMinutes: 8 },
    { sender: 'papa', text: 'Dale! Le pregunto a Emilia qué tema quiere. Amor te quiero mucho ❤️', delayMinutes: 9 },
    { sender: 'mama', text: 'Yo más mi vida 💕 ah oye y para el viaje a la playa del mes que viene, ya compraste los boletos?', delayMinutes: 15 },
    { sender: 'papa', text: 'No se me ha pasado! Los compro hoy. Es del 15 al 18 verdad?', delayMinutes: 17 },
    { sender: 'mama', text: 'Sí del 15 al 18 a Cancún. Necesitamos comprar bloqueador para Emilia y su traje de baño nuevo', delayMinutes: 18 },
    { sender: 'papa', text: 'Sí el traje le queda chico. Lo compro con los boletos? Todo junto?', delayMinutes: 19 },
    { sender: 'mama', text: 'Sí amor tú ve todo eso, yo me enfoco en la fiesta. Somos un buen equipo 💕', delayMinutes: 20 },
    { sender: 'papa', text: 'El mejor equipo mi vida ❤️', delayMinutes: 21 },
  ],
  expectedDetections: [
    {
      type: 'event',
      intent: 'EVENT_ACTIVITY',
      data: {
        title: 'Natación Emilia',
        event_type: 'activity',
        date_start: 'lunes 15:00',
        location: 'alberca del deportivo',
        child: 'Emilia',
      },
      detectedAtMessage: 3,
    },
    {
      type: 'event',
      intent: 'MILESTONE',
      data: {
        title: 'Cumpleaños Emilia',
        date_start: 'en 2 semanas',
        child: 'Emilia',
      },
      detectedAtMessage: 4,
    },
    {
      type: 'task',
      intent: 'TASK_SHOPPING',
      data: {
        title: 'Buscar salón para fiesta',
        assigned_to: 'mama',
      },
      detectedAtMessage: 6,
    },
    {
      type: 'task',
      intent: 'TASK_SHOPPING',
      data: {
        title: 'Encargar pastel de cumpleaños',
        assigned_to: 'papa',
      },
      detectedAtMessage: 7,
    },
    {
      type: 'task',
      intent: 'TASK_SHOPPING',
      data: {
        title: 'Comprar boletos Cancún + bloqueador + traje de baño',
        assigned_to: 'papa',
      },
      detectedAtMessage: 11,
    },
  ],
  expectedBehavior: {
    shouldStaySilentAt: [0, 13],
    shouldDetectDelegation: true,
    idealResponseSummary: 'Nanny filtra los mensajes cariñosos y extrae: natación, cumpleaños, fiesta, viaje a Cancún. No interviene en los "te amo" pero sí cuando hay info accionable mezclada.',
  },
};
