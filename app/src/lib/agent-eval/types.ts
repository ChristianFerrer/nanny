/**
 * Tipos del eval del Decision Agent.
 *
 * Diferencia con el eval viejo (lib/eval/):
 * - El viejo medía precision/recall de extracción de eventos/tareas.
 * - Este mide DECISIÓN: cuándo Nanny acusa, cuándo calla, qué captura.
 *
 * Cada escenario define un setup (perfil + agenda + contexto) y una lista
 * de mensajes, cada uno con su comportamiento esperado.
 */

import type { DecisionAgentOutput } from '@/lib/types';

// ─── Setup del escenario ───

export interface ScenarioParent {
  id: string;
  name: string;
  role: 'mama' | 'papa';
}

export interface ScenarioChild {
  id: string;
  name: string;
  birth_date?: string | null;
  allergies?: string[];
  medical_notes?: string | null;
  personality_notes?: string | null;
}

export interface ScenarioSupportContact {
  id: string;
  name: string;
  relationship: string;
  consent_status: 'pending' | 'active' | 'rejected' | 'paused';
}

export interface ScenarioEvent {
  id: string;
  title: string;
  date_start: string; // ISO
  date_end?: string | null;
  location?: string | null;
  assigned_to?: string | null;
  child_id?: string | null;
  status?: string;
}

export interface ScenarioTask {
  id: string;
  title: string;
  due_date?: string | null;
  assigned_to?: string | null;
  priority?: string;
  child_id?: string | null;
  status?: string;
}

export interface ScenarioMedication {
  id: string;
  medication_name: string;
  child_name: string;
  schedule_times?: string[];
  frequency?: string | null;
  end_date?: string | null;
}

export interface ScenarioPattern {
  pattern_type: string;
  description: string;
  confidence: number;
}

export interface ScenarioPreference {
  preference_type: string;
  content: string;
  source: 'explicit' | 'correction' | 'inferred';
}

export interface ScenarioLearningItem {
  topic: string;
  urgency: 'low' | 'medium' | 'high';
  question_text?: string | null;
}

export interface ScenarioSetup {
  family_name: string;
  timezone: string;
  parents: ScenarioParent[];
  children: ScenarioChild[];
  support_contacts: ScenarioSupportContact[];
  upcoming_events: ScenarioEvent[];
  pending_tasks: ScenarioTask[];
  active_medications: ScenarioMedication[];
  patterns: ScenarioPattern[];
  preferences: ScenarioPreference[];
  learning_queue: ScenarioLearningItem[];
  emotional_signal_last_48h?: string | null;
}

// ─── Mensajes y expectativas ───

/**
 * Mensaje del padre + comportamiento esperado de Nanny.
 *
 * - expected_intervene: ¿debería responder? null si no nos importa este turno
 * - expected_silence_reason_includes: si esperamos silencio, fragmento de
 *   texto que la razón debería contener (validación cualitativa)
 * - expected_capture: si esperamos captura específica
 * - expected_resolves_topic: si el mensaje debería resolver un item de la cola
 *
 * Después del mensaje del padre, el "contexto siguiente" del escenario hereda
 * el mensaje + la respuesta de Nanny (si hubo) — así un escenario simula
 * conversación real.
 */
export interface ScenarioMessage {
  sender_name: string; // nombre del padre que escribe (debe matchear con setup.parents)
  text: string;
  // Expectativas
  expected_intervene: boolean | null;
  expected_silence_reason_includes?: string[];
  expected_message_includes?: string[];
  expected_message_excludes?: string[];
  expected_capture?: {
    type: 'preference' | 'learning_item' | 'none';
    preference_type?: string;
    source?: 'explicit' | 'correction' | 'inferred';
    topic_hint?: string; // substring esperado en el topic
  };
  expected_resolves_topic?: string | null;
  // Anotación libre para humanos
  notes?: string;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  setup: ScenarioSetup;
  messages: ScenarioMessage[];
}

// ─── Resultados ───

export interface MessageResult {
  scenario_id: string;
  message_index: number;
  text: string;
  expected: ScenarioMessage;
  actual: DecisionAgentOutput;
  cost_usd: number;
  latency_ms: number;
  // Veredictos por dimensión (true = pasó, false = falló, null = no aplica)
  ack_correct: boolean | null;
  silence_correct: boolean | null;
  capture_correct: boolean | null;
  resolves_correct: boolean | null;
  message_content_correct: boolean | null;
  // Diagnóstico para humanos
  notes: string[];
}

export interface ScenarioResult {
  scenario_id: string;
  name: string;
  messages: MessageResult[];
  // Métricas agregadas
  ack_rate: number; // % de mensajes que esperaban acuse y lo recibieron
  silence_rate: number; // % de mensajes que esperaban silencio y lo respetaron
  capture_precision: number; // 0-1
  resolves_correctness: number; // 0-1
  total_cost_usd: number;
  total_latency_ms: number;
  pass_count: number; // mensajes que pasaron TODAS las dimensiones aplicables
  fail_count: number;
}

export interface EvalRunResult {
  started_at: string;
  finished_at: string;
  scenarios: ScenarioResult[];
  // Métricas globales
  total_messages: number;
  total_pass: number;
  total_fail: number;
  global_ack_rate: number;
  global_silence_rate: number;
  global_capture_precision: number;
  global_resolves_correctness: number;
  total_cost_usd: number;
  avg_latency_ms: number;
}
