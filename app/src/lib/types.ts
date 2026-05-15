export interface Database {
  public: {
    Tables: {
      families: {
        Row: Family;
        Insert: Omit<Family, 'id' | 'created_at'>;
        Update: Partial<Omit<Family, 'id'>>;
      };
      parents: {
        Row: Parent;
        Insert: Omit<Parent, 'id' | 'created_at'>;
        Update: Partial<Omit<Parent, 'id'>>;
      };
      children: {
        Row: Child;
        Insert: Omit<Child, 'id' | 'created_at'>;
        Update: Partial<Omit<Child, 'id'>>;
      };
      events: {
        Row: FamilyEvent;
        Insert: Omit<FamilyEvent, 'id' | 'created_at'>;
        Update: Partial<Omit<FamilyEvent, 'id'>>;
      };
      tasks: {
        Row: Task;
        Insert: Omit<Task, 'id' | 'created_at'>;
        Update: Partial<Omit<Task, 'id'>>;
      };
      messages: {
        Row: Message;
        Insert: Omit<Message, 'id' | 'created_at'>;
        Update: Partial<Omit<Message, 'id'>>;
      };
      medications: {
        Row: Medication;
        Insert: Omit<Medication, 'id' | 'created_at'>;
        Update: Partial<Omit<Medication, 'id'>>;
      };
      pending_confirmations: {
        Row: PendingConfirmation;
        Insert: Omit<PendingConfirmation, 'id' | 'created_at'>;
        Update: Partial<Omit<PendingConfirmation, 'id'>>;
      };
      routines: {
        Row: Routine;
        Insert: Omit<Routine, 'id' | 'created_at'>;
        Update: Partial<Omit<Routine, 'id'>>;
      };
      routine_exceptions: {
        Row: RoutineException;
        Insert: Omit<RoutineException, 'id' | 'created_at'>;
        Update: Partial<Omit<RoutineException, 'id'>>;
      };
      intervention_feedback: {
        Row: InterventionFeedback;
        Insert: Omit<InterventionFeedback, 'id' | 'created_at'>;
        Update: Partial<Omit<InterventionFeedback, 'id'>>;
      };
    };
  };
}

export interface Family {
  id: string;
  name: string;
  timezone: string;
  timezone_set_manually: boolean;
  created_at: string;
}

export interface Parent {
  id: string;
  family_id: string;
  name: string;
  role: 'mama' | 'papa';
  phone: string | null;
  email: string | null;
  avatar_emoji: string;
  auth_user_id: string | null;
  created_at: string;
}

export interface Child {
  id: string;
  family_id: string;
  name: string;
  birth_date: string | null;
  emoji: string;
  color: string | null;
  school: string | null;
  teacher: string | null;
  grade: string | null;
  allergies: string[];
  medical_notes: string | null;
  personality_notes: string | null;
  created_at: string;
}

export interface FamilyEvent {
  id: string;
  family_id: string;
  child_id: string | null;
  title: string;
  description: string | null;
  event_type: string;
  date_start: string;
  date_end: string | null;
  location: string | null;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  source: string;
  auto_detected: boolean;
  created_by: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  family_id: string;
  child_id: string | null;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  assigned_to: string | null;
  due_date: string | null;
  status: 'pending' | 'in_progress' | 'done' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  source: string;
  auto_detected: boolean;
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  family_id: string;
  sender_id: string | null;
  sender_type: 'parent' | 'nanny';
  content: string;
  message_type: 'text' | 'confirmation' | 'summary' | 'reminder';
  metadata: NannyMetadata;
  created_at: string;
}

export interface NannyMetadata {
  intent?: string;
  child?: string;
  event_type?: string;
  confirmation_id?: string;
  [key: string]: unknown;
}

export interface Medication {
  id: string;
  family_id: string;
  child_id: string | null;
  child_name: string;
  medication_name: string;
  duration_days: number | null;
  start_date: string;
  end_date: string | null;
  frequency: string | null;
  schedule_times: string[];
  status: 'active' | 'completed' | 'cancelled';
  source: string;
  auto_detected: boolean;
  created_by: string | null;
  created_at: string;
}

export type MedicationIntakeStatus = 'pending' | 'done' | 'missed' | 'skipped';

export interface MedicationIntake {
  id: string;
  medication_id: string;
  family_id: string;
  scheduled_at: string;
  status: MedicationIntakeStatus;
  taken_at: string | null;
  recorded_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PendingConfirmation {
  id: string;
  family_id: string;
  message_id: string | null;
  confirmation_type: 'event' | 'task' | 'update';
  data: Record<string, unknown>;
  status: 'pending' | 'confirmed' | 'rejected' | 'expired';
  responded_by: string | null;
  created_at: string;
  responded_at: string | null;
}

export interface Routine {
  id: string;
  child_id: string;
  type: string;
  name: string;
  description: string | null;
  days_of_week: number[];
  time_start: string | null;
  time_end: string | null;
  active: boolean;
  created_at: string;
}

export interface RoutineException {
  id: string;
  routine_id: string;
  date: string; // YYYY-MM-DD
  cancelled: boolean;
  time_start_override: string | null;
  time_end_override: string | null;
  reason: string | null;
  created_at: string;
}

export interface InterventionFeedback {
  id: string;
  message_id: string;
  parent_id: string;
  useful: boolean;
  created_at: string;
}

// Intent types - specific categories for better classification
export type NannyIntent =
  | 'EVENT_SCHOOL'        // Eventos escolares: excursiones, reuniones, festivales
  | 'EVENT_ACTIVITY'      // Actividades extracurriculares: fútbol, natación, clases
  | 'EVENT_MEDICAL'       // Citas médicas: pediatra, dentista, vacunas
  | 'TASK_SHOPPING'       // Compras: pañales, útiles, ropa
  | 'TASK_PAYMENT'        // Pagos: excursiones, colegiaturas, inscripciones
  | 'MEDICATION'          // Tratamientos médicos con dosis/horarios
  | 'LOGISTICS_PICKUP'    // Responsabilidad de recogida: "yo lo recojo"
  | 'LOGISTICS_TRANSPORT' // Transporte: "puedes llevar a Pau al fútbol?"
  | 'SCHEDULE_CHANGE'     // Cambios de horario: "lo movieron al jueves"
  | 'MILESTONE'           // Fechas importantes: cumpleaños, graduaciones
  | 'SUPPLY_LOW'          // Suministros bajos: "quedan pocos pañales"
  | 'HEALTH_LOG'          // Síntomas sin tratamiento
  | 'ROUTINE'             // Rutina semanal recurrente creada
  | 'CHAT'                // Conversación casual
  | 'INFO'                // Información general
  | 'IGNORE';             // No requiere intervención

// Next Best Action - what the system should do after classification
export type NextAction =
  | 'ask_for_missing_time'
  | 'ask_for_missing_responsible_parent'
  | 'confirm_event'
  | 'confirm_task'
  | 'confirm_medication'
  | 'confirm_routine'
  | 'cancel_routine_date'
  | 'offer_reminders'
  | 'update_existing_event'
  | 'update_existing_task'
  | 'stay_silent';

// OpenAI response types
export interface NannyResponse {
  reply: string;
  intent: NannyIntent;
  next_action: NextAction;
  child?: string;
  confirmation?: {
    type: 'event' | 'task' | 'medication';
    data: Record<string, unknown>;
  };
}

// ────────────────────────────────────────────────────────────
// AGENT REWRITE — nuevas entidades (Sprint 0)
// Ver AGENT-REWRITE-PLAN.md y NANNY-VISION.md
// ────────────────────────────────────────────────────────────

// 5.2 Patrones semánticos de la familia
export type PatternType =
  | 'parent_responsibility'   // "Christian suele llevar a Pau al pediatra"
  | 'child_preference'         // "Pau no quiere ir al dentista"
  | 'recurring_event'          // "Los miércoles hay fútbol"
  | 'time_window'              // "Mañana mejor después de las 10"
  | 'other';

export interface FamilyPattern {
  id: string;
  family_id: string;
  pattern_type: PatternType;
  description: string;
  confidence: number; // 0-1
  source_message_ids: string[];
  last_observed_at: string;
  created_at: string;
  updated_at: string;
}

// 5.3 Preferencias explícitas
export type PreferenceType =
  | 'topic_avoid'              // "No me hables del cumple"
  | 'time_window'              // "Avisame a las 8am no a las 7"
  | 'name_alias'               // "A Pau decile Pauli"
  | 'notification_preference'  // "Push o WhatsApp"
  | 'parent_role_assignment'   // "Lo médico siempre yo"
  | 'other';

export type PreferenceSource = 'explicit' | 'correction' | 'inferred';

export interface FamilyPreference {
  id: string;
  family_id: string;
  preference_type: PreferenceType;
  content: string;
  applies_to_child_id: string | null;
  applies_to_parent_id: string | null;
  source: PreferenceSource;
  active: boolean;
  set_at: string;
  last_applied_at: string | null;
  created_at: string;
  updated_at: string;
}

// 5.5 Learning queue
export type LearningQueueStatus = 'pending' | 'asked' | 'resolved' | 'cancelled';
export type LearningQueueUrgency = 'low' | 'medium' | 'high';

export interface LearningQueueItem {
  id: string;
  family_id: string;
  topic: string; // ej: "pediatra_name", "usual_pickup_pattern"
  urgency: LearningQueueUrgency;
  context_required: Record<string, unknown>;
  question_text: string | null;
  status: LearningQueueStatus;
  asked_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

// 7. Red de apoyo
export type SupportRelationship =
  | 'abuela_materna'
  | 'abuela_paterna'
  | 'abuelo_materno'
  | 'abuelo_paterno'
  | 'tia'
  | 'tio'
  | 'ninera'
  | 'pediatra'
  | 'otro';

export type ConsentStatus = 'pending' | 'active' | 'rejected' | 'paused';

export interface SupportContact {
  id: string;
  family_id: string;
  name: string;
  relationship: SupportRelationship;
  phone_whatsapp: string; // E.164
  applies_to_child_ids: string[];
  availability_notes: string | null;
  notes: string | null;
  consent_status: ConsentStatus;
  consent_message_sent_at: string | null;
  consent_response_at: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// 7.2 Conversaciones WhatsApp
export type WhatsAppDirection = 'outbound' | 'inbound';

export type WhatsAppIntent =
  | 'consent_request'
  | 'consent_accept'
  | 'consent_reject'
  | 'logistics_request'
  | 'logistics_confirm'
  | 'logistics_decline'
  | 'clarification'
  | 'other';

export interface WhatsAppParsedResponse {
  confirmed?: boolean;
  alternative?: string;
  wait_until?: string; // ISO timestamp
  needs_clarification?: boolean;
  free_text?: string;
}

export interface WhatsAppConversation {
  id: string;
  family_id: string;
  contact_id: string;
  direction: WhatsAppDirection;
  message_text: string;
  intent: WhatsAppIntent | null;
  parsed_response: WhatsAppParsedResponse | null;
  related_event_id: string | null;
  meta_message_id: string | null;
  delivered_at: string | null;
  read_at: string | null;
  replied_in_chat: boolean;
  created_at: string;
}

// Decision agent output (Sprint 1)
export interface DecisionAgentOutput {
  intervene: boolean;
  message: string | null;
  delivery: 'chat' | 'whatsapp_contact' | 'push' | null;
  delivery_target_contact_id: string | null; // si delivery=whatsapp_contact
  priority: 'low' | 'medium' | 'high' | null;
  reason: string; // audit trail interno (no se muestra al usuario)
}

// Trigger semántico que disparó al decision agent
export type DecisionAgentTriggerType = 'scheduled' | 'message' | 'manual';

// Momentos fijos del día (NANNY-VISION §6.1). Solo aplica cuando
// trigger_type='scheduled'.
export type DecisionAgentMoment = 'morning' | 'midday' | 'afternoon' | 'evening';

export interface DecisionAgentLog {
  id: string;
  family_id: string;
  trigger_type: DecisionAgentTriggerType;
  trigger_moment: DecisionAgentMoment | null;
  trigger_message_id: string | null;
  context_summary: Record<string, unknown>;
  decision: DecisionAgentOutput;
  model_response: Record<string, unknown> | null;
  cost_usd: number;
  latency_ms: number | null;
  created_at: string;
}
