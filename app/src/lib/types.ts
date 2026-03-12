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
