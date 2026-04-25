/**
 * Paso 3 del pipeline: Post-procesamiento en código.
 *
 * 1. Corregir assigned_to (mapear de sender a mama/papa)
 * 2. Validar contra falsos positivos
 * 3. Deduplicar contra eventos/tareas existentes
 */

import type { ChatResponse } from './processChat';

interface PostProcessInput {
  response: ChatResponse;
  senderRole: 'mama' | 'papa';
  existingEvents: string;
  existingTasks: string;
  activeMedications: string;
}

/**
 * Post-procesa la respuesta del LLM para corregir errores comunes.
 */
export function postProcessResponse(input: PostProcessInput): ChatResponse {
  let response = { ...input.response };

  // 1. Fix assigned_to
  response = fixAssignedTo(response, input.senderRole);

  // 2. Fix relative dates to ISO
  response = fixDates(response);

  // 3. Validate against false positives
  response = validateConfirmation(response, input);

  // 4. Filter additional_confirmations through same quality checks, cap at 1
  response.additional_confirmations = filterAdditionalConfirmations(
    response.additional_confirmations || [],
    input,
  );

  return response;
}

/**
 * Corrige assigned_to para que sea "mama" o "papa".
 * El LLM a veces pone el nombre del padre, "sender", "other", etc.
 */
function fixAssignedTo(response: ChatResponse, senderRole: 'mama' | 'papa'): ChatResponse {
  if (!response.confirmation?.data) return response;

  const data = { ...response.confirmation.data };
  const assignedTo = data.assigned_to;

  if (assignedTo === undefined || assignedTo === null) return response;

  const assignedStr = String(assignedTo).toLowerCase().trim();
  const otherRole = senderRole === 'mama' ? 'papa' : 'mama';

  // Si ya es correcto, no hacer nada
  if (assignedStr === 'mama' || assignedStr === 'papa') {
    return response;
  }

  // Mapear variaciones comunes
  if (['sender', 'yo', 'quien escribe', 'el que escribe', 'la que escribe', 'yo lo hago', 'yo me encargo', 'me encargo'].includes(assignedStr)) {
    data.assigned_to = senderRole;
  } else if (['other', 'otro', 'otra', 'el otro', 'la otra', 'otro padre', 'otra madre', 'tú', 'tu', 'you'].includes(assignedStr)) {
    data.assigned_to = otherRole;
  } else if (['mamá', 'mama', 'madre', 'mami', 'mom', 'mother'].some(v => assignedStr.includes(v))) {
    data.assigned_to = 'mama';
  } else if (['papá', 'papa', 'padre', 'papi', 'dad', 'father'].some(v => assignedStr.includes(v))) {
    data.assigned_to = 'papa';
  } else if (['ambos', 'los dos', 'both', 'juntos'].some(v => assignedStr.includes(v))) {
    data.assigned_to = null;
  } else {
    data.assigned_to = null;
  }

  return {
    ...response,
    confirmation: {
      ...response.confirmation,
      data,
    },
  };
}

/**
 * Normaliza fechas relativas a ISO 8601.
 * El LLM a veces emite "mañana", "lunes", "en 2 semanas" en vez de ISO.
 */
function fixDates(response: ChatResponse): ChatResponse {
  if (!response.confirmation?.data) return response;

  const data = { ...response.confirmation.data };
  const dateFields = ['date_start', 'due_date'];

  for (const field of dateFields) {
    const val = data[field];
    if (!val || typeof val !== 'string') continue;
    const normalized = normalizeDate(val);
    if (normalized) data[field] = normalized;
  }

  return {
    ...response,
    confirmation: { ...response.confirmation, data },
  };
}

function normalizeDate(raw: string): string | null {
  const lower = raw.toLowerCase().trim();
  const now = new Date();

  // Already ISO format — leave as is
  if (/^\d{4}-\d{2}-\d{2}/.test(lower)) return null;

  const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  // Extract time component if present (e.g. "a las 10:00", "10am", "16:00")
  let time = '';
  const timeMatch = lower.match(/(\d{1,2}):(\d{2})/);
  const ampmMatch = lower.match(/(\d{1,2})\s*(am|pm)/i);
  if (timeMatch) {
    time = `T${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}:00`;
  } else if (ampmMatch) {
    let h = parseInt(ampmMatch[1]);
    if (ampmMatch[2].toLowerCase() === 'pm' && h < 12) h += 12;
    if (ampmMatch[2].toLowerCase() === 'am' && h === 12) h = 0;
    time = `T${String(h).padStart(2, '0')}:00:00`;
  }

  // "mañana"
  if (lower.includes('mañana') && !lower.includes('por la mañana')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0] + (time || 'T10:00:00');
  }

  // "pasado mañana"
  if (lower.includes('pasado mañana')) {
    const d = new Date(now);
    d.setDate(d.getDate() + 2);
    return d.toISOString().split('T')[0] + (time || 'T10:00:00');
  }

  // "en X semanas/días"
  const relMatch = lower.match(/en\s+(\d+)\s+(semana|día|dia|mes)/);
  if (relMatch) {
    const n = parseInt(relMatch[1]);
    const unit = relMatch[2];
    const d = new Date(now);
    if (unit.startsWith('semana')) d.setDate(d.getDate() + n * 7);
    else if (unit.startsWith('día') || unit.startsWith('dia')) d.setDate(d.getDate() + n);
    else if (unit.startsWith('mes')) d.setMonth(d.getMonth() + n);
    return d.toISOString().split('T')[0] + (time || 'T10:00:00');
  }

  // "el lunes", "este viernes", "próximo martes"
  const dayMatch = dayNames.findIndex(d => lower.includes(d));
  if (dayMatch >= 0) {
    const d = new Date(now);
    const currentDay = d.getDay();
    let diff = dayMatch - currentDay;
    if (diff <= 0) diff += 7;
    d.setDate(d.getDate() + diff);
    return d.toISOString().split('T')[0] + (time || 'T10:00:00');
  }

  // "hoy"
  if (lower === 'hoy' || lower.startsWith('hoy ')) {
    return now.toISOString().split('T')[0] + (time || 'T10:00:00');
  }

  return null;
}

/**
 * Valida que la confirmation no sea un falso positivo.
 * Retorna la response con confirmation=null si detecta FP.
 */
function validateConfirmation(response: ChatResponse, input: PostProcessInput): ChatResponse {
  if (!response.confirmation) return response;

  const conf = response.confirmation;
  const data = conf.data;

  // FP 1: Confirmation sin título
  if (conf.type === 'event' || conf.type === 'task') {
    if (!data.title || String(data.title).trim().length < 3) {
      return { ...response, confirmation: null };
    }
  }

  // FP 2: Medication sin nombre
  if (conf.type === 'medication') {
    if (!data.medication_name || String(data.medication_name).trim().length < 2) {
      return { ...response, confirmation: null };
    }
  }

  // FP 3: Event sin fecha
  if (conf.type === 'event') {
    if (!data.date_start) {
      // Convertir a pending_detection en vez de descartar
      return {
        ...response,
        confirmation: null,
        pending_detection: response.pending_detection || {
          type: 'event',
          partial_data: data,
          missing: ['date_start'],
          summary: String(data.title || 'Evento sin fecha'),
        },
      };
    }
  }

  // FP 4: Duplicado de evento existente
  if (conf.type === 'event' && data.title && input.existingEvents) {
    const titleWords = String(data.title).toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const existingLower = input.existingEvents.toLowerCase();
    const matchedWords = titleWords.filter(w => existingLower.includes(w));
    if (matchedWords.length >= Math.ceil(titleWords.length * 0.6)) {
      // Probably a duplicate
      return { ...response, confirmation: null, next_action: 'update_existing_event' };
    }
  }

  // FP 5: Duplicado de tarea existente
  if (conf.type === 'task' && data.title && input.existingTasks) {
    const titleWords = String(data.title).toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const existingLower = input.existingTasks.toLowerCase();
    const matchedWords = titleWords.filter(w => existingLower.includes(w));
    if (matchedWords.length >= Math.ceil(titleWords.length * 0.6)) {
      return { ...response, confirmation: null, next_action: 'update_existing_task' };
    }
  }

  // FP 6: HEALTH_LOG no debe tener confirmation
  if (response.intent === 'HEALTH_LOG') {
    return { ...response, confirmation: null };
  }

  // FP 7: Síntomas sin tratamiento/cita → no crear evento
  if (conf.type === 'event' && data.title) {
    const titleLower = String(data.title).toLowerCase();
    const symptomWords = ['fiebre', 'tos', 'vómito', 'vomito', 'diarrea', 'malestar', 'dolor de', 'gripe', 'resfriado', 'mocos', 'estornudo'];
    const isSymptom = symptomWords.some(w => titleLower.includes(w));
    const hasTreatmentOrAppt = data.date_start || data.location || (data.event_type && String(data.event_type).includes('medical'));
    if (isSymptom && !hasTreatmentOrAppt) {
      return { ...response, confirmation: null };
    }
  }

  // FP 8: Calidad mínima — requiere al menos 2 de 3 campos clave
  if (conf.type === 'event' || conf.type === 'task') {
    const hasDate = !!(data.date_start || data.due_date);
    const hasOwner = !!(data.assigned_to);
    const hasChild = !!(data.child);
    const keyFieldCount = [hasDate, hasOwner, hasChild].filter(Boolean).length;
    const titleWords = String(data.title || '').trim().split(/\s+/).filter(w => w.length > 2);
    if (titleWords.length < 2 && keyFieldCount < 2) {
      return { ...response, confirmation: null };
    }
  }

  return response;
}

function filterAdditionalConfirmations(
  confirmations: Array<{ type: string; data: Record<string, unknown> }>,
  input: PostProcessInput,
): Array<{ type: string; data: Record<string, unknown> }> {
  if (!confirmations || confirmations.length === 0) return [];

  const filtered = confirmations.filter(conf => {
    const data = conf.data;
    const title = String(data.title || '').trim();

    if ((conf.type === 'event' || conf.type === 'task') && title.length < 3) return false;
    if (conf.type === 'medication' && (!data.medication_name || String(data.medication_name).trim().length < 2)) return false;

    if (conf.type === 'event' && title) {
      const titleLower = title.toLowerCase();
      const symptomWords = ['fiebre', 'tos', 'vómito', 'vomito', 'diarrea', 'malestar', 'dolor de', 'gripe', 'resfriado', 'mocos'];
      const isSymptom = symptomWords.some(w => titleLower.includes(w));
      if (isSymptom && !data.date_start && !data.location) return false;
    }

    if (conf.type === 'event' || conf.type === 'task') {
      const hasDate = !!(data.date_start || data.due_date);
      const hasOwner = !!(data.assigned_to);
      const hasChild = !!(data.child);
      const keyFieldCount = [hasDate, hasOwner, hasChild].filter(Boolean).length;
      const titleWords = title.split(/\s+/).filter(w => w.length > 2);
      if (titleWords.length < 2 && keyFieldCount < 2) return false;
    }

    if (conf.type === 'event' && title && input.existingEvents) {
      const titleWords = title.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const existingLower = input.existingEvents.toLowerCase();
      const matchedWords = titleWords.filter(w => existingLower.includes(w));
      if (titleWords.length > 0 && matchedWords.length >= Math.ceil(titleWords.length * 0.6)) return false;
    }
    if (conf.type === 'task' && title && input.existingTasks) {
      const titleWords = title.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const existingLower = input.existingTasks.toLowerCase();
      const matchedWords = titleWords.filter(w => existingLower.includes(w));
      if (titleWords.length > 0 && matchedWords.length >= Math.ceil(titleWords.length * 0.6)) return false;
    }

    return true;
  });

  return filtered.slice(0, 1);
}
