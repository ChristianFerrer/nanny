/**
 * Tipos para el sistema de evaluación automatizada de Nanny.
 *
 * Flujo: Perfiles → Conversaciones → Runner → Scorer → Diagnóstico
 */

// ─── Perfiles Familiares ───

export interface FamilyProfile {
  id: string;
  name: string;
  mamaName: string;
  papaName: string;
  children: ProfileChild[];
  communicationStyle: string;
  organizationLevel: 'alta' | 'media' | 'baja';
  stressLevel: 'alto' | 'medio' | 'bajo';
  coordinationPattern: string;
  frequentConflicts: string[];
  specialContext?: string;
}

export interface ProfileChild {
  name: string;
  age: string; // "2 años", "6 meses", etc.
  emoji: string;
  school?: string;
  allergies?: string[];
  medicalNotes?: string;
}

// ─── Conversaciones Sintéticas ───

export interface SyntheticMessage {
  sender: 'mama' | 'papa';
  text: string;
  /** Tiempo simulado desde inicio de conversación (minutos) */
  delayMinutes?: number;
}

export interface ExpectedDetection {
  type: 'event' | 'task' | 'medication';
  intent: string;
  data: Record<string, unknown>;
  /** Campos que son ambiguos y Nanny podría interpretar diferente */
  ambiguousFields?: string[];
  /** Mensaje(s) donde debería detectarse (índice 0-based) */
  detectedAtMessage?: number;
}

export interface ExpectedBehavior {
  /** Nanny debería preguntar por info faltante */
  shouldAskForMissing?: string[];
  /** Nanny debería guardar pending_detection */
  shouldUsePendingDetection?: boolean;
  /** Nanny debería detectar delegación de responsabilidad */
  shouldDetectDelegation?: boolean;
  /** Nanny debería permanecer callada en ciertos mensajes */
  shouldStaySilentAt?: number[];
  /** Nanny debería detectar cambio de planes */
  shouldDetectScheduleChange?: boolean;
  /** Respuesta ideal resumida */
  idealResponseSummary?: string;
}

export interface SyntheticConversation {
  id: string;
  profileId: string;
  name: string;
  description: string;
  /** Temas cubiertos en la conversación */
  topics: string[];
  messages: SyntheticMessage[];
  expectedDetections: ExpectedDetection[];
  expectedBehavior: ExpectedBehavior;
}

// ─── Resultados de Evaluación ───

export interface MessageResult {
  messageIndex: number;
  senderName: string;
  messageText: string;
  response: {
    should_respond: boolean;
    reply: string;
    intent: string;
    next_action: string;
    child: string | null;
    confirmation: { type: string; data: Record<string, unknown> } | null;
    pending_detection: { type: string; partial_data: Record<string, unknown>; missing: string[]; summary: string } | null;
  } | null;
  /** Tiempo de respuesta en ms */
  responseTimeMs: number;
  error?: string;
}

export interface DetectionMatch {
  expected: ExpectedDetection;
  /** La detección encontrada que matchea, o null si no se encontró */
  actual: { type: string; data: Record<string, unknown> } | null;
  /** Score 0-1 de qué tan bien matchea */
  score: number;
  /** Campos correctos */
  correctFields: string[];
  /** Campos incorrectos con detalles */
  incorrectFields: { field: string; expected: unknown; actual: unknown }[];
  /** Campos que se consideraron ambiguos */
  ambiguousFields: string[];
}

export interface BehaviorMatch {
  check: string;
  passed: boolean;
  details: string;
}

export interface ConversationResult {
  conversationId: string;
  conversationName: string;
  profileId: string;
  messageResults: MessageResult[];
  detectionMatches: DetectionMatch[];
  behaviorMatches: BehaviorMatch[];
  scores: {
    /** De lo detectado, cuánto era correcto */
    precision: number;
    /** De lo esperado, cuánto se detectó */
    recall: number;
    /** Manejo de campos ambiguos */
    ambiguityHandling: number;
    /** Comportamiento general (should_respond, pending, etc.) */
    behaviorScore: number;
    /** Score compuesto */
    overall: number;
  };
  /** Tiempo total de evaluación en ms */
  totalTimeMs: number;
}

export interface EvaluationRun {
  id: string;
  timestamp: string;
  promptVersion: string;
  model: string;
  conversationResults: ConversationResult[];
  aggregateScores: {
    precision: number;
    recall: number;
    ambiguityHandling: number;
    behaviorScore: number;
    overall: number;
  };
  totalConversations: number;
  perfectConversations: number;
  partialConversations: number;
  failedConversations: number;
  totalTimeMs: number;
}

// ─── Diagnóstico AI ───

export interface FailurePattern {
  category: string;
  description: string;
  affectedConversations: string[];
  failureCount: number;
  examples: {
    conversationId: string;
    messageIndex: number;
    expected: string;
    actual: string;
  }[];
}

export interface PromptAdjustment {
  pattern: string;
  currentPromptSection: string;
  proposedChange: string;
  riskLevel: 'bajo' | 'medio' | 'alto';
  expectedImpact: string;
  affectedFailures: string[];
}

export interface DiagnosisResult {
  runId: string;
  timestamp: string;
  failurePatterns: FailurePattern[];
  proposedAdjustments: PromptAdjustment[];
  summary: string;
}
