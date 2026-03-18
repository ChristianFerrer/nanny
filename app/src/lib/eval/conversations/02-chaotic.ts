import type { SyntheticConversation } from '../types';

/**
 * Pareja Caótica: Laura y Diego
 * Hijos: Santiago (7), Valentina (4), Emma (1)
 * Escenario: Mañana caótica con info médica mezclada, olvidos, y cambios de tema.
 */
export const conversation: SyntheticConversation = {
  id: 'chaotic-01',
  profileId: 'chaotic',
  name: 'Mañana caótica con tres hijos',
  description: 'Laura y Diego intentan coordinar vacunas de Emma, recogida de Santiago, y fiebre de Valentina. Todo desordenado.',
  topics: ['vacunas', 'logística recogida', 'síntomas salud', 'medicación', 'compras'],
  messages: [
    { sender: 'mama', text: 'oye emma tiene vacunas mañana', delayMinutes: 0 },
    { sender: 'papa', text: 'a q hora?? y quien la lleva xq yo tengo q recoger a santi del futbol', delayMinutes: 1 },
    { sender: 'mama', text: 'a las 11 en el centro de salud. ah y valentina amaneció con fiebre', delayMinutes: 2 },
    { sender: 'papa', text: 'otra vez?? le diste algo?', delayMinutes: 3 },
    { sender: 'mama', text: 'ibuprofeno a las 7, le toca otra vez a las 3. ah oye y a santi a q hora lo recojo', delayMinutes: 4 },
    { sender: 'papa', text: 'no espera yo lo recojo del futbol a la 1. tú lleva a emma a vacunas', delayMinutes: 5 },
    { sender: 'mama', text: 'ok pero necesito q compres pañales para emma q se acabaron', delayMinutes: 7 },
    { sender: 'papa', text: 'no hay??? ok compro ahorita. y hay q comprar más ibuprofeno tmb?', delayMinutes: 8 },
    { sender: 'mama', text: 'si queda poco. ah y la reunión de padres de santi es el jueves a las 6 no se me olvide', delayMinutes: 10 },
    { sender: 'papa', text: 'jueves a las 6 ok. en la escuela verdad?', delayMinutes: 11 },
    { sender: 'mama', text: 'sii en la escuela. oye y valentina si tiene 38.5 la llevo al doctor o esperamos?', delayMinutes: 13 },
    { sender: 'papa', text: 'si no baja con el ibuprofeno llévala mañana', delayMinutes: 14 },
  ],
  expectedDetections: [
    {
      type: 'event',
      intent: 'EVENT_MEDICAL',
      data: {
        title: 'Vacunas Emma',
        event_type: 'doctor',
        date_start: 'mañana 11:00',
        location: 'centro de salud',
        assigned_to: 'mama',
        child: 'Emma',
      },
      detectedAtMessage: 5,
    },
    {
      type: 'event',
      intent: 'LOGISTICS_PICKUP',
      data: {
        title: 'Recoger Santiago del fútbol',
        date_start: 'mañana 13:00',
        assigned_to: 'papa',
        child: 'Santiago',
      },
      detectedAtMessage: 5,
    },
    {
      type: 'task',
      intent: 'TASK_SHOPPING',
      data: {
        title: 'Comprar pañales para Emma',
        assigned_to: 'papa',
      },
      detectedAtMessage: 7,
    },
    {
      type: 'task',
      intent: 'TASK_SHOPPING',
      data: {
        title: 'Comprar ibuprofeno',
        assigned_to: null,
      },
      ambiguousFields: ['assigned_to'],
      detectedAtMessage: 8,
    },
    {
      type: 'event',
      intent: 'EVENT_SCHOOL',
      data: {
        title: 'Reunión de padres Santiago',
        event_type: 'school',
        date_start: 'jueves 18:00',
        location: 'escuela',
        child: 'Santiago',
      },
      detectedAtMessage: 9,
    },
  ],
  expectedBehavior: {
    shouldAskForMissing: [],
    shouldUsePendingDetection: true,
    shouldDetectDelegation: true,
    shouldStaySilentAt: [3],
    idealResponseSummary: 'Nanny captura vacunas, recogida del fútbol, compras urgentes, y reunión escolar a pesar del desorden. Detecta síntomas de Valentina como HEALTH_LOG.',
  },
};
