import type { SyntheticConversation } from '../types';

/**
 * Pareja Bilingüe: Sarah y Miguel
 * Hijos: Leo (3)
 * Escenario: Mezclan español e inglés al coordinar checkup, playdate y compras.
 */
export const conversation: SyntheticConversation = {
  id: 'bilingual-01',
  profileId: 'bilingual',
  name: 'Coordinación bilingüe español-inglés',
  description: 'Sarah y Miguel mezclan idiomas al coordinar checkup, playdate y swimming class de Leo.',
  topics: ['cita médica', 'actividad social', 'actividad extracurricular', 'compras'],
  messages: [
    { sender: 'mama', text: 'Hey amor, Leo tiene su checkup mañana at 10am con la Dra. Sánchez', delayMinutes: 0 },
    { sender: 'papa', text: 'Ok perfecto. Do you need me to take him o puedes tú?', delayMinutes: 2 },
    { sender: 'mama', text: 'Can you take him? I have a call at 10. It\'s at the pediatric clinic on Reforma', delayMinutes: 3 },
    { sender: 'papa', text: 'Sure, yo lo llevo. Hay que preguntarle lo del rash que tiene en el brazo', delayMinutes: 5 },
    { sender: 'mama', text: 'Yes! And also pregúntale sobre las vitaminas, if he still needs them', delayMinutes: 6 },
    { sender: 'papa', text: 'Anotado. Oye y el Saturday es el playdate con Mateo verdad?', delayMinutes: 15 },
    { sender: 'mama', text: 'Sí, at 11 en el parque de Chapultepec. His mom is bringing snacks', delayMinutes: 16 },
    { sender: 'papa', text: 'Cool. Y swimming class starts next Tuesday right?', delayMinutes: 20 },
    { sender: 'mama', text: 'Yes, martes y jueves 4pm en el club deportivo. I already paid la inscripción', delayMinutes: 22 },
    { sender: 'papa', text: 'Necesita goggles y traje de baño nuevo, el otro le queda chico', delayMinutes: 24 },
    { sender: 'mama', text: 'True, can you get those? Hay una tienda de deportes near your office', delayMinutes: 25 },
    { sender: 'papa', text: 'Sí, I\'ll get them tomorrow', delayMinutes: 26 },
  ],
  expectedDetections: [
    {
      type: 'event',
      intent: 'EVENT_MEDICAL',
      data: {
        title: 'Checkup Leo / Cita pediatra Leo',
        event_type: 'doctor',
        date_start: 'mañana 10:00',
        location: 'clínica pediátrica en Reforma',
        assigned_to: 'papa',
        child: 'Leo',
      },
      detectedAtMessage: 3,
    },
    {
      type: 'event',
      intent: 'EVENT_ACTIVITY',
      data: {
        title: 'Playdate con Mateo',
        date_start: 'sábado 11:00',
        location: 'parque de Chapultepec',
        child: 'Leo',
      },
      ambiguousFields: ['assigned_to'],
      detectedAtMessage: 6,
    },
    {
      type: 'event',
      intent: 'EVENT_ACTIVITY',
      data: {
        title: 'Clase de natación Leo',
        event_type: 'activity',
        date_start: 'martes 16:00',
        location: 'club deportivo',
        child: 'Leo',
      },
      detectedAtMessage: 8,
    },
    {
      type: 'task',
      intent: 'TASK_SHOPPING',
      data: {
        title: 'Comprar goggles y traje de baño',
        assigned_to: 'papa',
        child: 'Leo',
      },
      detectedAtMessage: 11,
    },
  ],
  expectedBehavior: {
    shouldUsePendingDetection: true,
    shouldDetectDelegation: true,
    idealResponseSummary: 'Nanny entiende mensajes bilingües: "checkup" = cita médica, "playdate" = evento social, "swimming class" = natación. Extrae datos correctamente sin importar el idioma.',
  },
};
