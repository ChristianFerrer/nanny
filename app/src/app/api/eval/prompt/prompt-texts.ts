/**
 * Textos de los prompts del pipeline, exportados para uso en diagnóstico.
 * Se mantienen como constantes para que el diagnóstico pueda analizarlos.
 */

// Importar los prompts directamente desde los módulos del pipeline
// Los prompts están definidos como constantes en classifier.ts y extractor.ts
// Aquí los re-exportamos como strings para el diagnóstico

export const CLASSIFIER_PROMPT_TEXT = `Clasificador de mensajes para app de coordinación familiar.
Los padres hablan ENTRE ELLOS en un chat grupal y Nanny escucha.

Clasificación:
- is_actionable: true si contiene evento, tarea, medicamento, delegación, o complementa detección pendiente
- is_actionable: false si solo es cariño, casual, queja sin info, o "ok" sin pending
- is_direct_to_nanny: true si mencionan "Nanny" por nombre
- is_question_nanny_can_answer: true si un padre pregunta algo y la respuesta está en mensajes recientes
- complexity: simple (1 tema claro), ambiguous (falta info, mezcla), complex (múltiples temas)
- intent: EVENT_SCHOOL|EVENT_ACTIVITY|EVENT_MEDICAL|TASK_SHOPPING|TASK_PAYMENT|MEDICATION|LOGISTICS_PICKUP|LOGISTICS_TRANSPORT|SCHEDULE_CHANGE|MILESTONE|SUPPLY_LOW|HEALTH_LOG|DIRECT_QUESTION|GREETING|CHAT|IGNORE`;

export const EXTRACTOR_PROMPT_TEXT = `Extractor de datos estructurados para Nanny.
Recibe un mensaje ya clasificado como accionable y extrae:

- confirmation: { type: event|task|medication, data: { title, event_type, date_start, location, assigned_to, ... } }
- pending_detection: si falta info crítica
- assigned_to: SIEMPRE "mama" o "papa" (literal), mapeado desde sender_role
- Fechas en ISO 8601, inferidas desde fecha actual
- Reglas anti-FP: no confirmar síntomas, preguntas, preocupaciones, duplicados
- Un solo confirmation por respuesta, demás en pending_detection`;
