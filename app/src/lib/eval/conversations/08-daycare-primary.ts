import type { SyntheticConversation } from '../types';

/**
 * Pareja Guardería + Primaria: María y Pablo
 * Hijos: Sofía (7, ballet), Lucas (2, adaptación guardería)
 * Escenario: Logística compleja con dos horarios diferentes, ballet, y reunión escolar.
 */
export const conversation: SyntheticConversation = {
  id: 'daycare-primary-01',
  profileId: 'daycare-primary',
  name: 'Logística doble: primaria y guardería',
  description: 'María y Pablo coordinan recogidas distintas, ballet de Sofía, adaptación de Lucas y reunión escolar.',
  topics: ['logística recogida', 'actividad extracurricular', 'evento escolar', 'adaptación guardería'],
  messages: [
    { sender: 'mama', text: 'Oye mañana es la reunión de inicio de curso de Sofía a las 5 en el colegio. Puedes ir tú?', delayMinutes: 0 },
    { sender: 'papa', text: 'Sí pero quién recoge a Lucas de la guardería? Sale a las 5:30', delayMinutes: 2 },
    { sender: 'mama', text: 'Mi mamá puede recogerlo. Le digo que vaya a Ositos a las 5:30', delayMinutes: 4 },
    { sender: 'papa', text: 'Perfecto. Y el martes Sofía tiene ballet verdad?', delayMinutes: 5 },
    { sender: 'mama', text: 'Sí, martes y jueves de 4 a 5 en la academia. Yo la llevo el martes', delayMinutes: 7 },
    { sender: 'papa', text: 'Yo la recojo el martes a las 5 entonces. El jueves también?', delayMinutes: 8 },
    { sender: 'mama', text: 'El jueves mejor la llevas tú porque yo llevo a Lucas al pediatra a las 4:30', delayMinutes: 10 },
    { sender: 'papa', text: 'Lucas tiene pediatra el jueves? No sabía', delayMinutes: 11 },
    { sender: 'mama', text: 'Sí, es el control de los 2 años. En la clínica pediatrica de siempre', delayMinutes: 12 },
    { sender: 'papa', text: 'Ok. Y cómo va Lucas con la adaptación en la guardería?', delayMinutes: 15 },
    { sender: 'mama', text: 'Mejor, ya no llora. Pero la maestra dice que no quiere comer ahí. Hay que mandarle su comida', delayMinutes: 16 },
    { sender: 'papa', text: 'Le preparo su lunch mañana. Qué le mando?', delayMinutes: 17 },
    { sender: 'mama', text: 'Fruta picada, galletas y su agua. Nada de jugo que le cae mal', delayMinutes: 18 },
  ],
  expectedDetections: [
    {
      type: 'event',
      intent: 'EVENT_SCHOOL',
      data: {
        title: 'Reunión inicio de curso Sofía',
        event_type: 'school',
        date_start: 'mañana 17:00',
        location: 'colegio',
        assigned_to: 'papa',
        child: 'Sofía',
      },
      detectedAtMessage: 1,
    },
    {
      type: 'event',
      intent: 'EVENT_ACTIVITY',
      data: {
        title: 'Ballet Sofía',
        event_type: 'activity',
        date_start: 'martes 16:00',
        location: 'academia',
        child: 'Sofía',
      },
      detectedAtMessage: 4,
    },
    {
      type: 'event',
      intent: 'EVENT_MEDICAL',
      data: {
        title: 'Control 2 años Lucas',
        event_type: 'doctor',
        date_start: 'jueves 16:30',
        location: 'clínica pediátrica',
        assigned_to: 'mama',
        child: 'Lucas',
      },
      detectedAtMessage: 8,
    },
    {
      type: 'task',
      intent: 'TASK_SHOPPING',
      data: {
        title: 'Preparar lunch para Lucas (guardería)',
        assigned_to: 'papa',
      },
      ambiguousFields: ['assigned_to'],
      detectedAtMessage: 11,
    },
  ],
  expectedBehavior: {
    shouldUsePendingDetection: false,
    shouldDetectDelegation: true,
    idealResponseSummary: 'Nanny maneja logística paralela: dos hijos, dos escuelas, ballet, pediatra. Asigna responsables correctamente cuando hay conflictos de horario.',
  },
};
