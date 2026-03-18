import type { SyntheticConversation } from '../types';

/**
 * Pareja Organizada: Ana y Carlos
 * Hijos: Lucía (6), Mateo (3)
 * Escenario: Semana normal con cita médica, evento escolar y actividad extracurricular.
 * Todo claro, datos completos, confirman explícitamente.
 */
export const conversation: SyntheticConversation = {
  id: 'organized-01',
  profileId: 'organized',
  name: 'Semana organizada con múltiples eventos',
  description: 'Ana y Carlos coordinan cita pediatra de Mateo, excursión de Lucía y clase de ballet. Datos claros y completos.',
  topics: ['cita médica', 'evento escolar', 'actividad extracurricular', 'compras'],
  messages: [
    { sender: 'mama', text: 'Amor, recuerda que Mateo tiene pediatra el miércoles a las 10:30 en la clínica del Dr. Herrera', delayMinutes: 0 },
    { sender: 'papa', text: 'Sí, ya lo tengo anotado. Yo lo llevo, tú tienes la junta ¿verdad?', delayMinutes: 2 },
    { sender: 'mama', text: 'Exacto, gracias. También el viernes Lucía tiene excursión al museo de ciencias. Hay que pagar $350 antes del jueves', delayMinutes: 3 },
    { sender: 'papa', text: 'Ok yo pago mañana por la app del colegio. ¿Necesita llevar algo especial?', delayMinutes: 5 },
    { sender: 'mama', text: 'Lunch sin frutos secos por las alergias, y bloqueador solar', delayMinutes: 6 },
    { sender: 'papa', text: 'Anotado. Por cierto, Lucía empieza ballet el martes a las 4:30 en el estudio de danza Luna', delayMinutes: 10 },
    { sender: 'mama', text: 'Perfecto, yo la llevo los martes. ¿Y quién la recoge?', delayMinutes: 12 },
    { sender: 'papa', text: 'Yo la recojo a las 5:30 que sale de la clase', delayMinutes: 13 },
    { sender: 'mama', text: 'Genial. Ah y hay que comprar las zapatillas de ballet, ¿puedes pasar por la tienda?', delayMinutes: 15 },
    { sender: 'papa', text: 'Sí, las compro mañana en la tienda del centro', delayMinutes: 16 },
  ],
  expectedDetections: [
    {
      type: 'event',
      intent: 'EVENT_MEDICAL',
      data: {
        title: 'Pediatra Mateo',
        event_type: 'doctor',
        date_start: 'miércoles 10:30',
        location: 'clínica del Dr. Herrera',
        assigned_to: 'papa',
        child: 'Mateo',
      },
      detectedAtMessage: 1,
    },
    {
      type: 'event',
      intent: 'EVENT_SCHOOL',
      data: {
        title: 'Excursión museo de ciencias',
        event_type: 'school',
        date_start: 'viernes',
        child: 'Lucía',
      },
      detectedAtMessage: 2,
    },
    {
      type: 'task',
      intent: 'TASK_PAYMENT',
      data: {
        title: 'Pagar excursión Lucía',
        assigned_to: 'papa',
        due_date: 'jueves',
      },
      detectedAtMessage: 3,
    },
    {
      type: 'event',
      intent: 'EVENT_ACTIVITY',
      data: {
        title: 'Ballet Lucía',
        event_type: 'activity',
        date_start: 'martes 16:30',
        location: 'estudio de danza Luna',
        child: 'Lucía',
      },
      detectedAtMessage: 5,
    },
    {
      type: 'task',
      intent: 'TASK_SHOPPING',
      data: {
        title: 'Comprar zapatillas de ballet',
        assigned_to: 'papa',
      },
      detectedAtMessage: 9,
    },
  ],
  expectedBehavior: {
    shouldAskForMissing: [],
    shouldUsePendingDetection: false,
    shouldDetectDelegation: true,
    shouldStaySilentAt: [],
    idealResponseSummary: 'Nanny registra todos los eventos y tareas correctamente. Detecta que papá lleva a Mateo al pediatra y que mamá lleva a Lucía al ballet.',
  },
};
