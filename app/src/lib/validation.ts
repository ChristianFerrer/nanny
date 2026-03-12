/**
 * Capa de validación de negocio entre las propuestas del LLM y la persistencia en BD.
 *
 * Flujo: mensaje → clasificación (LLM) → extracción (LLM) → VALIDACIÓN (aquí) → persistencia
 *
 * El LLM propone acciones, pero el backend decide si son válidas.
 */

import type { FamilyEvent, Task, Medication } from './types';
import type { NannyIntent, NextAction } from './types';

// ─── Validation Result Types ───

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedData?: Record<string, unknown>;
}

// ─── Intent Validation ───

const VALID_INTENTS: NannyIntent[] = [
  'EVENT_SCHOOL', 'EVENT_ACTIVITY', 'EVENT_MEDICAL',
  'TASK_SHOPPING', 'TASK_PAYMENT',
  'MEDICATION',
  'LOGISTICS_PICKUP', 'LOGISTICS_TRANSPORT',
  'SCHEDULE_CHANGE', 'MILESTONE', 'SUPPLY_LOW',
  'HEALTH_LOG', 'CHAT', 'INFO', 'IGNORE',
];

const VALID_NEXT_ACTIONS: NextAction[] = [
  'ask_for_missing_time', 'ask_for_missing_responsible_parent',
  'confirm_event', 'confirm_task', 'confirm_medication',
  'offer_reminders', 'update_existing_event', 'update_existing_task',
  'stay_silent',
];

// Map old intents to new ones for backward compatibility
const INTENT_MIGRATION: Record<string, NannyIntent> = {
  'EVENT': 'EVENT_SCHOOL',
  'TASK': 'TASK_SHOPPING',
  'UPDATE': 'SCHEDULE_CHANGE',
  'REMINDER': 'INFO',
};

export function normalizeIntent(intent: string): NannyIntent {
  if (VALID_INTENTS.includes(intent as NannyIntent)) {
    return intent as NannyIntent;
  }
  if (intent in INTENT_MIGRATION) {
    return INTENT_MIGRATION[intent];
  }
  return 'CHAT';
}

export function normalizeNextAction(nextAction: string | undefined): NextAction {
  if (nextAction && VALID_NEXT_ACTIONS.includes(nextAction as NextAction)) {
    return nextAction as NextAction;
  }
  return 'stay_silent';
}

// ─── Event Validation ───

export function validateEventData(
  data: Record<string, unknown>,
  existingEvents: FamilyEvent[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  const title = data.title as string;
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    errors.push('El evento necesita un título');
  }

  // Date validation
  const dateStart = data.date_start as string;
  if (!dateStart) {
    errors.push('El evento necesita una fecha de inicio');
  } else {
    const parsed = new Date(dateStart);
    if (isNaN(parsed.getTime())) {
      errors.push(`Fecha inválida: ${dateStart}`);
    }
    // Warn if date is more than 1 year in the future
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    if (parsed > oneYearFromNow) {
      warnings.push(`La fecha ${dateStart} es más de 1 año en el futuro`);
    }
    // Warn if date is in the past (but allow today)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 59, 59);
    if (parsed < yesterday) {
      warnings.push(`La fecha ${dateStart} ya pasó`);
    }
  }

  // Event type validation
  const validEventTypes = ['doctor', 'school', 'birthday', 'activity', 'travel', 'other'];
  const eventType = data.event_type as string;
  if (eventType && !validEventTypes.includes(eventType)) {
    warnings.push(`Tipo de evento desconocido: ${eventType}, usando "other"`);
    data.event_type = 'other';
  }

  // Assigned_to validation
  const assignedTo = data.assigned_to as string;
  if (assignedTo && !['mama', 'papa'].includes(assignedTo)) {
    warnings.push(`assigned_to "${assignedTo}" no es válido, ignorando`);
    data.assigned_to = null;
  }

  // Deduplication check
  if (title && dateStart) {
    const newDay = dateStart.split('T')[0];
    const isDuplicate = existingEvents.some(e =>
      e.title.toLowerCase() === title.toLowerCase() &&
      e.date_start.split('T')[0] === newDay
    );
    if (isDuplicate) {
      errors.push(`Ya existe un evento "${title}" para ese día`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sanitizedData: errors.length === 0 ? {
      title: (title || '').trim(),
      event_type: (data.event_type as string) || 'other',
      date_start: dateStart,
      date_description: (data.date_description as string) || null,
      location: (data.location as string) || null,
      assigned_to: (data.assigned_to as string) || null,
    } : undefined,
  };
}

// ─── Task Validation ───

export function validateTaskData(
  data: Record<string, unknown>,
  existingTasks: Task[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  const title = data.title as string;
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    errors.push('La tarea necesita un título');
  }

  // Due date validation (optional)
  const dueDate = data.due_date as string;
  if (dueDate) {
    const parsed = new Date(dueDate);
    if (isNaN(parsed.getTime())) {
      warnings.push(`Fecha de vencimiento inválida: ${dueDate}, ignorando`);
      data.due_date = null;
    }
  }

  // Assigned_to validation
  const assignedTo = data.assigned_to as string;
  if (assignedTo && !['mama', 'papa'].includes(assignedTo)) {
    warnings.push(`assigned_to "${assignedTo}" no es válido, ignorando`);
    data.assigned_to = null;
  }

  // Deduplication check
  if (title) {
    const isDuplicate = existingTasks.some(t =>
      t.title.toLowerCase() === title.toLowerCase() && t.status !== 'done'
    );
    if (isDuplicate) {
      errors.push(`Ya existe una tarea pendiente "${title}"`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sanitizedData: errors.length === 0 ? {
      title: (title || '').trim(),
      assigned_to: (data.assigned_to as string) || null,
      due_date: (data.due_date as string) || null,
    } : undefined,
  };
}

// ─── Medication Validation ───

export function validateMedicationData(
  data: Record<string, unknown>,
  existingMedications: Medication[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  const medName = data.medication_name as string;
  if (!medName || typeof medName !== 'string' || medName.trim().length === 0) {
    errors.push('El medicamento necesita un nombre');
  }

  // Frequency or schedule_times required
  const frequency = data.frequency as string;
  const scheduleTimes = data.schedule_times as string[];
  if (!frequency && (!scheduleTimes || scheduleTimes.length === 0)) {
    errors.push('Se necesita frecuencia u horarios del medicamento');
  }

  // Validate schedule_times format (HH:MM)
  if (scheduleTimes && Array.isArray(scheduleTimes)) {
    const timeRegex = /^\d{2}:\d{2}$/;
    const validTimes = scheduleTimes.filter(t => timeRegex.test(t));
    if (validTimes.length !== scheduleTimes.length) {
      warnings.push('Algunos horarios tienen formato inválido, se corrigieron');
      data.schedule_times = validTimes.length > 0 ? validTimes : ['08:00'];
    }
  }

  // Duration validation
  const durationDays = data.duration_days as number;
  if (durationDays !== null && durationDays !== undefined) {
    if (typeof durationDays !== 'number' || durationDays < 1 || durationDays > 365) {
      warnings.push(`Duración ${durationDays} días parece inusual`);
      if (durationDays > 365) data.duration_days = 365;
      if (durationDays < 1) data.duration_days = 1;
    }
  }

  // Start date validation
  const startDate = data.start_date as string;
  if (startDate) {
    const parsed = new Date(startDate);
    if (isNaN(parsed.getTime())) {
      warnings.push(`Fecha de inicio inválida: ${startDate}, usando hoy`);
      data.start_date = new Date().toISOString();
    }
  } else {
    data.start_date = new Date().toISOString();
  }

  // End date: calculate if missing
  if (!data.end_date && data.start_date && durationDays) {
    const start = new Date(data.start_date as string);
    start.setDate(start.getDate() + (durationDays as number));
    data.end_date = start.toISOString();
  }

  // Deduplication: check if same medication already active for same child
  if (medName) {
    const isDuplicate = existingMedications.some(m =>
      m.medication_name.toLowerCase() === medName.toLowerCase() &&
      m.status === 'active'
    );
    if (isDuplicate) {
      warnings.push(`Ya existe un tratamiento activo de "${medName}"`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sanitizedData: errors.length === 0 ? {
      medication_name: (medName || '').trim(),
      duration_days: (data.duration_days as number) || null,
      start_date: data.start_date as string,
      end_date: (data.end_date as string) || null,
      frequency: (frequency || '').trim() || null,
      schedule_times: (data.schedule_times as string[]) || [],
    } : undefined,
  };
}

// ─── Full Response Validation ───

export interface ValidatedNannyResponse {
  should_respond: boolean;
  reply: string;
  intent: NannyIntent;
  next_action: NextAction;
  child: string | null;
  confirmation: {
    type: 'event' | 'task' | 'medication';
    data: Record<string, unknown>;
  } | null;
  pending_detection: {
    type: string;
    partial_data: Record<string, unknown>;
    missing: string[];
    summary: string;
  } | null;
  validation_warnings: string[];
}

export function validateNannyResponse(
  raw: Record<string, unknown>,
  existingEvents: FamilyEvent[],
  existingTasks: Task[],
  existingMedications: Medication[]
): ValidatedNannyResponse {
  const allWarnings: string[] = [];

  // Normalize intent and next_action
  const intent = normalizeIntent((raw.intent as string) || 'CHAT');
  const nextAction = normalizeNextAction(raw.next_action as string);

  // Validate confirmation data if present
  let confirmation = raw.confirmation as { type: string; data: Record<string, unknown> } | null;

  if (confirmation && confirmation.data) {
    let validationResult: ValidationResult;

    switch (confirmation.type) {
      case 'event': {
        validationResult = validateEventData(confirmation.data, existingEvents);
        if (!validationResult.valid) {
          // Invalid event data — drop confirmation, keep as pending
          allWarnings.push(...validationResult.errors);
          confirmation = null;
        } else {
          allWarnings.push(...validationResult.warnings);
          confirmation = { type: 'event', data: validationResult.sanitizedData! };
        }
        break;
      }
      case 'task': {
        validationResult = validateTaskData(confirmation.data, existingTasks);
        if (!validationResult.valid) {
          allWarnings.push(...validationResult.errors);
          confirmation = null;
        } else {
          allWarnings.push(...validationResult.warnings);
          confirmation = { type: 'task', data: validationResult.sanitizedData! };
        }
        break;
      }
      case 'medication': {
        validationResult = validateMedicationData(confirmation.data, existingMedications);
        if (!validationResult.valid) {
          allWarnings.push(...validationResult.errors);
          confirmation = null;
        } else {
          allWarnings.push(...validationResult.warnings);
          confirmation = { type: 'medication', data: validationResult.sanitizedData! };
        }
        break;
      }
      default:
        allWarnings.push(`Tipo de confirmation desconocido: ${confirmation.type}`);
        confirmation = null;
    }
  }

  return {
    should_respond: raw.should_respond !== false,
    reply: (raw.reply as string) || '',
    intent,
    next_action: nextAction,
    child: (raw.child as string) || null,
    confirmation: confirmation as ValidatedNannyResponse['confirmation'],
    pending_detection: (raw.pending_detection as ValidatedNannyResponse['pending_detection']) || null,
    validation_warnings: allWarnings,
  };
}
