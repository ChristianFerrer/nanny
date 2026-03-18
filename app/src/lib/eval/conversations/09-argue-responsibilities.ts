import type { SyntheticConversation } from '../types';

/**
 * Pareja Discute Responsabilidades: Patricia y Tomás
 * Hijos: Diego (6), Renata (4)
 * Escenario: Tensión sobre quién hace qué. Reclamos mezclados con logística real.
 */
export const conversation: SyntheticConversation = {
  id: 'argue-responsibilities-01',
  profileId: 'argue-responsibilities',
  name: 'Negociación tensa de responsabilidades',
  description: 'Patricia y Tomás discuten quién lleva al doctor, quién recoge, quién compra. Info útil mezclada con reclamos.',
  topics: ['cita médica', 'logística recogida', 'compras', 'discusión responsabilidades'],
  messages: [
    { sender: 'mama', text: 'Tomás, Diego tiene cita con el alergólogo mañana a las 11. Necesito que lo lleves tú porque yo siempre lo llevo', delayMinutes: 0 },
    { sender: 'papa', text: 'Siempre? La última vez fui yo', delayMinutes: 2 },
    { sender: 'mama', text: 'La última vez fue hace 3 meses y llegaste tarde. Es en la clínica alergias del sur, no se te olvide', delayMinutes: 3 },
    { sender: 'papa', text: 'Ok ok lo llevo. Necesita llevar algo?', delayMinutes: 5 },
    { sender: 'mama', text: 'Los resultados de las pruebas que están en el folder azul. Y hay que comprar el spray nasal que se acabó', delayMinutes: 6 },
    { sender: 'papa', text: 'Qué spray es? No me acuerdo', delayMinutes: 7 },
    { sender: 'mama', text: 'Nasonex, el que le recetaron. Ves? por eso digo que nunca pones atención', delayMinutes: 8 },
    { sender: 'papa', text: 'Ya ok lo compro. Y Renata? Quién la recoge de Los Olivos?', delayMinutes: 10 },
    { sender: 'mama', text: 'Yo la recojo a las 12:30 como siempre. Tú nunca puedes verdad?', delayMinutes: 11 },
    { sender: 'papa', text: 'Si puedo a veces! Mañana no porque estoy con Diego. El viernes la recojo yo, sale a las 12:30 también?', delayMinutes: 13 },
    { sender: 'mama', text: 'Sí 12:30. A ver si cumples. Y la inscripción de Renata al ballet hay que pagarla antes del viernes, son $500', delayMinutes: 15 },
    { sender: 'papa', text: 'Yo la pago mañana', delayMinutes: 16 },
  ],
  expectedDetections: [
    {
      type: 'event',
      intent: 'EVENT_MEDICAL',
      data: {
        title: 'Alergólogo Diego',
        event_type: 'doctor',
        date_start: 'mañana 11:00',
        location: 'clínica alergias del sur',
        assigned_to: 'papa',
        child: 'Diego',
      },
      detectedAtMessage: 3,
    },
    {
      type: 'task',
      intent: 'TASK_SHOPPING',
      data: {
        title: 'Comprar spray nasal Nasonex',
        assigned_to: 'papa',
        child: 'Diego',
      },
      detectedAtMessage: 7,
    },
    {
      type: 'event',
      intent: 'LOGISTICS_PICKUP',
      data: {
        title: 'Recoger Renata de Los Olivos',
        date_start: 'viernes 12:30',
        assigned_to: 'papa',
        child: 'Renata',
      },
      detectedAtMessage: 9,
    },
    {
      type: 'task',
      intent: 'TASK_PAYMENT',
      data: {
        title: 'Pagar inscripción ballet Renata',
        assigned_to: 'papa',
        due_date: 'viernes',
      },
      detectedAtMessage: 11,
    },
  ],
  expectedBehavior: {
    shouldUsePendingDetection: true,
    shouldDetectDelegation: true,
    shouldStaySilentAt: [1, 2, 8],
    idealResponseSummary: 'Nanny extrae info útil de conversación tensa sin involucrarse en la discusión. Detecta cita, compra de medicamento, recogida y pago. Ignora los reclamos.',
  },
};
