import type { SyntheticConversation } from '../types';

/**
 * Pareja Carga Desigual: Sofía y Fernando
 * Hijos: Pau (4, intolerancia lactosa), Mía (2)
 * Escenario: Sofía organiza todo, Fernando solo confirma con monosílabos.
 */
export const conversation: SyntheticConversation = {
  id: 'unequal-load-01',
  profileId: 'unequal-load',
  name: 'Mamá organiza todo, papá ejecuta',
  description: 'Sofía coordina pediatra, guardería, medicación y compras. Fernando responde mínimo.',
  topics: ['cita médica', 'medicación', 'guardería', 'compras', 'logística'],
  messages: [
    { sender: 'mama', text: 'Fer, mañana Pau tiene cita con la gastro a las 9:30 en el Hospital Angeles por lo de la lactosa', delayMinutes: 0 },
    { sender: 'papa', text: 'ok', delayMinutes: 3 },
    { sender: 'mama', text: 'Puedes llevarlo tú? Yo tengo que llevar a Mía a su primer día en la guardería Sol', delayMinutes: 4 },
    { sender: 'papa', text: 'si yo lo llevo', delayMinutes: 5 },
    { sender: 'mama', text: 'Lleva los estudios que están en la mesa del comedor. Y el doctor dijo que empezara con las gotas de lactasa, 5 gotas antes de cada comida, 3 veces al día por 30 días', delayMinutes: 6 },
    { sender: 'papa', text: '5 gotas ok. a q horas?', delayMinutes: 8 },
    { sender: 'mama', text: 'Antes del desayuno, antes de la comida y antes de la cena. O sea como a las 8, 2 y 7', delayMinutes: 9 },
    { sender: 'papa', text: '👍', delayMinutes: 10 },
    { sender: 'mama', text: 'Y necesito que compres la leche deslactosada de Pau que se acabó, y pañales para Mía talla 4', delayMinutes: 15 },
    { sender: 'papa', text: 'paso al súper saliendo del hospital', delayMinutes: 17 },
    { sender: 'mama', text: 'Gracias amor. Ah y acuérdate que Mía tiene su vacuna de los 2 años el viernes a las 11 en el mismo hospital', delayMinutes: 20 },
    { sender: 'papa', text: 'viernes 11 anotado. quien la lleva?', delayMinutes: 22 },
    { sender: 'mama', text: 'Yo la llevo, tú quédate con Pau', delayMinutes: 23 },
  ],
  expectedDetections: [
    {
      type: 'event',
      intent: 'EVENT_MEDICAL',
      data: {
        title: 'Cita gastroenterólogo Pau',
        event_type: 'doctor',
        date_start: 'mañana 09:30',
        location: 'Hospital Angeles',
        assigned_to: 'papa',
        child: 'Pau',
      },
      detectedAtMessage: 3,
    },
    {
      type: 'medication',
      intent: 'MEDICATION',
      data: {
        medication_name: 'Gotas de lactasa',
        frequency: '3 veces al día',
        duration_days: 30,
        schedule_times: ['08:00', '14:00', '19:00'],
        child: 'Pau',
      },
      detectedAtMessage: 6,
    },
    {
      type: 'task',
      intent: 'TASK_SHOPPING',
      data: {
        title: 'Comprar leche deslactosada y pañales talla 4',
        assigned_to: 'papa',
      },
      detectedAtMessage: 9,
    },
    {
      type: 'event',
      intent: 'EVENT_MEDICAL',
      data: {
        title: 'Vacuna 2 años Mía',
        event_type: 'doctor',
        date_start: 'viernes 11:00',
        location: 'hospital',
        assigned_to: 'mama',
        child: 'Mía',
      },
      detectedAtMessage: 12,
    },
  ],
  expectedBehavior: {
    shouldUsePendingDetection: true,
    shouldDetectDelegation: true,
    shouldStaySilentAt: [1, 7],
    idealResponseSummary: 'Nanny detecta medicación distribuida en 3 mensajes (gotas lactasa + dosis + horarios), cita gastro, compras, y vacuna. Asigna responsables correctamente.',
  },
};
