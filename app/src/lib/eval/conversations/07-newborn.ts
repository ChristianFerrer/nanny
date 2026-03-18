import type { SyntheticConversation } from '../types';

/**
 * Pareja Bebé Recién Nacido: Camila y Javier
 * Hijos: Emilio (2 meses, prematuro)
 * Escenario: Coordinan control mensual, vitaminas, y preocupaciones de salud del bebé.
 */
export const conversation: SyntheticConversation = {
  id: 'newborn-01',
  profileId: 'newborn',
  name: 'Coordinación médica de bebé prematuro',
  description: 'Camila y Javier coordinan control mensual de Emilio, vitamina D, y preocupaciones de peso.',
  topics: ['cita médica', 'medicación', 'síntomas salud', 'compras'],
  messages: [
    { sender: 'mama', text: 'Amor Emilio tiene control con la neonatóloga el lunes a las 9 en el Hospital Infantil', delayMinutes: 0 },
    { sender: 'papa', text: 'Voy contigo. Hay que preguntarle lo del peso, siento que no está subiendo bien', delayMinutes: 2 },
    { sender: 'mama', text: 'Sí yo también estoy preocupada. Pesó 3.2 kg la semana pasada', delayMinutes: 3 },
    { sender: 'papa', text: 'Y la vitamina D se la estamos dando bien? Cuántas gotas eran?', delayMinutes: 5 },
    { sender: 'mama', text: 'Son 3 gotas una vez al día, nos dijo que por 6 meses mínimo', delayMinutes: 6 },
    { sender: 'papa', text: 'Y a qué hora se la damos? En la mañana?', delayMinutes: 7 },
    { sender: 'mama', text: 'Sí, por la mañana con la primera toma, tipo 8am', delayMinutes: 8 },
    { sender: 'papa', text: 'Ok hay que ser más constantes con eso. Se nos ha olvidado algunos días', delayMinutes: 9 },
    { sender: 'mama', text: 'Sí por eso, necesitamos que Nanny nos recuerde. Ah y se está acabando el frasco, hay que comprar otro', delayMinutes: 10 },
    { sender: 'papa', text: 'Yo lo compro en la farmacia. Es la marca Ddrops verdad?', delayMinutes: 12 },
    { sender: 'mama', text: 'Sí esa. Y oye anoche tuvo mucho reflujo, vomitó dos veces', delayMinutes: 15 },
    { sender: 'papa', text: 'Hay que decirle a la doctora el lunes. Anotemos todo para no olvidar', delayMinutes: 16 },
  ],
  expectedDetections: [
    {
      type: 'event',
      intent: 'EVENT_MEDICAL',
      data: {
        title: 'Control neonatóloga Emilio',
        event_type: 'doctor',
        date_start: 'lunes 09:00',
        location: 'Hospital Infantil',
        child: 'Emilio',
      },
      ambiguousFields: ['assigned_to'],
      detectedAtMessage: 1,
    },
    {
      type: 'medication',
      intent: 'MEDICATION',
      data: {
        medication_name: 'Vitamina D (Ddrops)',
        frequency: 'una vez al día',
        duration_days: 180,
        schedule_times: ['08:00'],
        child: 'Emilio',
      },
      detectedAtMessage: 7,
    },
    {
      type: 'task',
      intent: 'TASK_SHOPPING',
      data: {
        title: 'Comprar vitamina D Ddrops',
        assigned_to: 'papa',
      },
      detectedAtMessage: 9,
    },
  ],
  expectedBehavior: {
    shouldUsePendingDetection: true,
    shouldDetectDelegation: false,
    idealResponseSummary: 'Nanny detecta control médico, arma medicación de vitamina D de info distribuida en 4 mensajes, registra compra, y detecta síntomas de reflujo como HEALTH_LOG.',
  },
};
