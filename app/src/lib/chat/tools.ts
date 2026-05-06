/**
 * Tools del extractor (function calling).
 *
 * Cada tool representa una acción accionable que Nanny puede tomar al procesar
 * un mensaje del chat. El modelo invoca una o varias tools en paralelo según el
 * contenido del mensaje; el extractor mapea cada tool call al shape de
 * `ExtractorOutput` (ver `extractor.ts`).
 *
 * Las 9 tools cubren:
 *   1. create_event              — eventos puntuales (cita, excursión, cumpleaños, etc.)
 *   2. create_task               — tareas/compras/pagos (con o sin fecha, status pending|done)
 *   3. create_medication         — tratamientos médicos
 *   4. create_routine            — horarios fijos recurrentes (guardería, fútbol semanal, etc.)
 *   5. create_routine_exception  — cancelación/cambio puntual de un día de una rutina
 *   6. update_existing_event     — modificar evento ya creado
 *   7. update_existing_task      — modificar tarea ya creada
 *   8. ask_for_missing_info      — pedir info faltante (reemplaza pending_detection)
 *   9. stay_silent               — no hay acción que tomar (saludo, info trivial)
 *
 * `create_task` acepta `parent_title` + `parent_child_name` opcionales para
 * agrupar varias tareas hijas bajo una tarea paraguas (cumpleaños, viaje, etc.).
 * Todas las tool calls del mismo turno con el mismo `parent_title` se
 * consolidan en un único task_group del lado del pipeline.
 */

import type OpenAI from 'openai';

type ToolDef = OpenAI.Chat.Completions.ChatCompletionTool;

export const EXTRACTOR_TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'create_event',
      description:
        'Crea un evento puntual con fecha y hora: cita médica, excursión escolar, cumpleaños, actividad de un día. NO uses esta tool para horarios fijos recurrentes (eso es create_routine). Si falta la fecha o asignación crítica, usá ask_for_missing_info en lugar de create_event.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Título corto y claro del evento. Ej: "Cita pediatra", "Excursión Pau", "Cumpleaños Lucía".',
          },
          event_type: {
            type: 'string',
            enum: ['doctor', 'school', 'birthday', 'activity', 'travel', 'other'],
            description: 'Categoría del evento.',
          },
          date_start: {
            type: 'string',
            description: 'Fecha y hora de inicio en ISO 8601 (YYYY-MM-DDTHH:mm:ss). Si no se mencionó hora, usá defaults: médico 10:00, escolar 08:00, actividad tarde 16:00.',
          },
          date_end: {
            type: 'string',
            description: 'Fecha y hora de fin en ISO 8601, si aplica. Opcional.',
          },
          date_description: {
            type: 'string',
            description: 'Descripción legible para humanos. Ej: "viernes 14 de marzo, 3:00 PM".',
          },
          location: {
            type: 'string',
            description: 'Lugar del evento si se mencionó.',
          },
          child: {
            type: 'string',
            description: 'Nombre del hijo al que aplica el evento, si se mencionó.',
          },
          assigned_to: {
            type: 'string',
            enum: ['mama', 'papa'],
            description: 'Padre responsable. Omitir si no se asignó explícitamente.',
          },
        },
        required: ['title', 'event_type', 'date_start'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'create_task',
      description:
        'Crea una tarea, compra o pago. Status="pending" para acciones futuras ("hay que comprar X"), status="done" para acciones pasadas reportadas ("ya compré X") — pero solo creá done si forma parte de un task_group con tareas pendientes. Si hay varias actividades del mismo topic paraguas (cumpleaños, viaje, mudanza), invocá create_task una vez por cada una con el mismo parent_title.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Título corto y claro. Ej: "Comprar pañales", "Pagar excursión Pau".',
          },
          status: {
            type: 'string',
            enum: ['pending', 'done'],
            description: 'pending si la tarea queda por hacer; done si ya fue completada (solo dentro de task_group).',
          },
          due_date: {
            type: 'string',
            description: 'Fecha límite ISO 8601 si se mencionó.',
          },
          completed_at: {
            type: 'string',
            description: 'Fecha en la que se completó (ISO 8601). Solo para status="done".',
          },
          assigned_to: {
            type: 'string',
            enum: ['mama', 'papa'],
            description: 'Padre responsable. Omitir si no se asignó explícitamente.',
          },
          child: {
            type: 'string',
            description: 'Nombre del hijo al que aplica la tarea, si aplica.',
          },
          parent_title: {
            type: 'string',
            description: 'Título del topic paraguas si esta tarea es sub-actividad de algo más grande. Ej: "Cumpleaños Pau", "Viaje Bariloche". Todas las create_task del mismo turno con el mismo parent_title se agrupan bajo una tarea padre única.',
          },
          parent_child_name: {
            type: 'string',
            description: 'Nombre del hijo del topic paraguas, si aplica. Solo se usa cuando parent_title está presente.',
          },
        },
        required: ['title', 'status'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'create_medication',
      description:
        'Registra un tratamiento médico con dosis, frecuencia y duración. Usá esta tool cuando el mensaje describa medicación con horarios concretos (ej. "antibiótico cada 8 horas por 10 días"). Si falta nombre o frecuencia, usá ask_for_missing_info.',
      parameters: {
        type: 'object',
        properties: {
          medication_name: {
            type: 'string',
            description: 'Nombre del medicamento. Ej: "Antibiótico", "Amoxicilina", "Ibuprofeno".',
          },
          frequency: {
            type: 'string',
            description: 'Descripción de frecuencia. Ej: "cada 8 horas", "3 veces al día".',
          },
          schedule_times: {
            type: 'array',
            items: { type: 'string' },
            description: 'Horarios concretos de toma en HH:MM. Ej: ["08:00", "16:00", "00:00"].',
          },
          duration_days: {
            type: 'number',
            description: 'Duración del tratamiento en días.',
          },
          start_date: {
            type: 'string',
            description: 'Fecha de inicio del tratamiento (ISO 8601).',
          },
          end_date: {
            type: 'string',
            description: 'Fecha de fin del tratamiento (ISO 8601). Calcula start_date + duration_days.',
          },
          child: {
            type: 'string',
            description: 'Nombre del hijo al que aplica el tratamiento.',
          },
        },
        required: ['medication_name'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'create_routine',
      description:
        'Crea una RUTINA SEMANAL: horario fijo y recurrente (guardería, colegio, fútbol semanal, natación los martes y jueves). NO uses esta tool para eventos puntuales — eso es create_event. Si el padre describe un horario repetido por días de la semana, esto es create_routine independientemente del intent del classifier.',
      parameters: {
        type: 'object',
        properties: {
          child_name: {
            type: 'string',
            description: 'Nombre del hijo al que pertenece la rutina.',
          },
          name: {
            type: 'string',
            description: 'Nombre corto de la actividad. Ej: "Guardería", "Fútbol", "Cole".',
          },
          type: {
            type: 'string',
            enum: ['school', 'activity', 'meal', 'morning', 'afternoon', 'night', 'custom'],
            description: 'Categoría de la rutina.',
          },
          days_of_week: {
            type: 'array',
            items: { type: 'integer', minimum: 0, maximum: 6 },
            description: 'Días de la semana en que ocurre. 0=domingo, 1=lunes, 2=martes, 3=miércoles, 4=jueves, 5=viernes, 6=sábado. Ej: [1,2,3,4,5] = lunes a viernes.',
          },
          time_start: {
            type: 'string',
            description: 'Hora de inicio en HH:MM 24h. Ej: "09:00".',
          },
          time_end: {
            type: 'string',
            description: 'Hora de fin en HH:MM 24h. Opcional. Si la hora final es menor que la inicial en formato corto (ej "9 a 4:30"), asumí PM implícito y normalizá: "9 a 4:30" = "09:00"–"16:30".',
          },
        },
        required: ['child_name', 'name', 'type', 'days_of_week', 'time_start'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'create_routine_exception',
      description:
        'Cancela o modifica UN día específico de una rutina ya existente (ej. "el viernes no hay guardería", "este martes Lucía no va a fútbol"). Buscá la rutina coincidente en RUTINAS SEMANALES por hijo + tipo de actividad y usá su id. Si no existe rutina coincidente, NO inventes — usá ask_for_missing_info en su lugar.',
      parameters: {
        type: 'object',
        properties: {
          routine_id: {
            type: 'string',
            description: 'Id literal de la rutina existente del listado RUTINAS SEMANALES.',
          },
          date: {
            type: 'string',
            description: 'Fecha de la excepción en formato YYYY-MM-DD.',
          },
          cancelled: {
            type: 'boolean',
            description: 'true para cancelar el día. false si en algún momento agregamos cambios de horario.',
          },
          reason: {
            type: 'string',
            description: 'Motivo de la cancelación si se mencionó. Ej: "se queda en casa", "feriado".',
          },
        },
        required: ['routine_id', 'date', 'cancelled'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'update_existing_event',
      description:
        'Modifica un evento ya creado (cambio de horario, asignación, lugar). Usá el id del listado EVENTOS AGENDADOS. Solo poné en updates los campos que cambian.',
      parameters: {
        type: 'object',
        properties: {
          event_id: {
            type: 'string',
            description: 'Id del evento existente a modificar.',
          },
          updates: {
            type: 'object',
            description: 'Campos a actualizar. Mismas keys que create_event (title, event_type, date_start, date_end, date_description, location, child, assigned_to). Solo incluí los que cambian.',
            properties: {
              title: { type: 'string' },
              event_type: { type: 'string', enum: ['doctor', 'school', 'birthday', 'activity', 'travel', 'other'] },
              date_start: { type: 'string' },
              date_end: { type: 'string' },
              date_description: { type: 'string' },
              location: { type: 'string' },
              child: { type: 'string' },
              assigned_to: { type: 'string', enum: ['mama', 'papa'] },
            },
          },
        },
        required: ['event_id', 'updates'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'update_existing_task',
      description:
        'Modifica una tarea ya creada (cambio de estado, asignación, fecha). Usá el id del listado TAREAS PENDIENTES. Solo poné en updates los campos que cambian.',
      parameters: {
        type: 'object',
        properties: {
          task_id: {
            type: 'string',
            description: 'Id de la tarea existente a modificar.',
          },
          updates: {
            type: 'object',
            description: 'Campos a actualizar. Mismas keys que create_task (title, status, due_date, completed_at, assigned_to, child).',
            properties: {
              title: { type: 'string' },
              status: { type: 'string', enum: ['pending', 'done'] },
              due_date: { type: 'string' },
              completed_at: { type: 'string' },
              assigned_to: { type: 'string', enum: ['mama', 'papa'] },
              child: { type: 'string' },
            },
          },
        },
        required: ['task_id', 'updates'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'ask_for_missing_info',
      description:
        'Indica que detectaste algo accionable pero falta info crítica para crearlo. El sistema mantendrá los datos parciales como pending_detection y los completará cuando el padre responda. Reemplaza por completo el patrón "emitir confirmation incompleta y rezar". Usalo cuando: faltan fecha+hora de un evento, falta nombre+frecuencia de una medicación, falta hijo claro de una rutina, etc. NO lo uses para tareas (las tareas se crean inmediatamente con status=pending y assigned_to=null si falta dueño).',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['event', 'task', 'medication', 'routine'],
            description: 'Tipo de cosa que se intentaba detectar.',
          },
          partial_data: {
            type: 'object',
            description: 'Los datos que sí pudiste extraer. Mismas keys que la tool create_X correspondiente.',
            additionalProperties: true,
          },
          missing: {
            type: 'array',
            items: { type: 'string' },
            description: 'Lista de campos que faltan para completar la detección. Ej: ["date_start", "assigned_to"].',
          },
          summary: {
            type: 'string',
            description: 'Descripción breve de lo que se detectó parcialmente, en una frase. Ej: "Cita pediatra mañana sin hora".',
          },
        },
        required: ['type', 'partial_data', 'missing', 'summary'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'stay_silent',
      description:
        'No hay acción accionable que tomar. Usalo para saludos, agradecimientos, info trivial, mensajes cariñosos sin contenido útil. El reply textual lo da el responder, no el extractor — esta tool solo señaliza "no hay nada que extraer".',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
];
