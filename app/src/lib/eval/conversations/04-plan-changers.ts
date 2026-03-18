import type { SyntheticConversation } from '../types';

/**
 * Pareja Cambia Planes: Valentina y Roberto
 * Hijos: Martín (8), Isabella (5)
 * Escenario: Planean llevar a Martín al dentista, pero cambian la cita dos veces.
 */
export const conversation: SyntheticConversation = {
  id: 'plan-changers-01',
  profileId: 'plan-changers',
  name: 'Tres cambios de plan en una semana',
  description: 'Roberto y Valentina agendan, cambian y reagendan cita dentista y recogida de actividades.',
  topics: ['cita médica', 'cambio de planes', 'actividad extracurricular', 'logística'],
  messages: [
    { sender: 'mama', text: 'Martín tiene dentista el martes a las 3 en la clínica dental del centro', delayMinutes: 0 },
    { sender: 'papa', text: 'Ok yo lo llevo', delayMinutes: 2 },
    { sender: 'mama', text: 'Espera, me acaban de avisar que la doctora no puede el martes. Lo movieron al miércoles misma hora', delayMinutes: 30 },
    { sender: 'papa', text: 'Miércoles no puedo, tengo junta hasta las 4', delayMinutes: 32 },
    { sender: 'mama', text: 'Ok entonces lo llevo yo el miércoles', delayMinutes: 33 },
    { sender: 'mama', text: 'Ay no espera, el miércoles Isabella tiene festival en el jardín a las 2. No me da tiempo', delayMinutes: 45 },
    { sender: 'papa', text: 'Mejor cambio la junta. Yo llevo a Martín y tú vas al festival', delayMinutes: 47 },
    { sender: 'mama', text: 'Perfecto eso sí funciona. El festival es a las 2 en el jardín Mariposas', delayMinutes: 48 },
    { sender: 'papa', text: 'Listo. Y el karate de Martín el jueves sigue a las 5 verdad?', delayMinutes: 50 },
    { sender: 'mama', text: 'Sí, jueves 5pm en el dojo. Yo lo llevo y tú lo recoges a las 6?', delayMinutes: 52 },
    { sender: 'papa', text: 'Dale, a las 6 lo recojo', delayMinutes: 53 },
  ],
  expectedDetections: [
    {
      type: 'event',
      intent: 'EVENT_MEDICAL',
      data: {
        title: 'Dentista Martín',
        event_type: 'doctor',
        date_start: 'miércoles 15:00',
        location: 'clínica dental del centro',
        assigned_to: 'papa',
        child: 'Martín',
      },
      detectedAtMessage: 6,
    },
    {
      type: 'event',
      intent: 'EVENT_SCHOOL',
      data: {
        title: 'Festival Isabella',
        event_type: 'school',
        date_start: 'miércoles 14:00',
        location: 'jardín Mariposas',
        assigned_to: 'mama',
        child: 'Isabella',
      },
      detectedAtMessage: 7,
    },
    {
      type: 'event',
      intent: 'EVENT_ACTIVITY',
      data: {
        title: 'Karate Martín',
        event_type: 'activity',
        date_start: 'jueves 17:00',
        location: 'dojo',
        assigned_to: null,
        child: 'Martín',
      },
      ambiguousFields: ['assigned_to'],
      detectedAtMessage: 9,
    },
  ],
  expectedBehavior: {
    shouldUsePendingDetection: true,
    shouldDetectScheduleChange: true,
    shouldDetectDelegation: true,
    idealResponseSummary: 'Nanny maneja los cambios: martes→miércoles, mamá→papá para dentista. Registra el plan final correcto sin duplicar eventos cancelados.',
  },
};
