/**
 * Scorer del decision agent.
 *
 * Compara la decisión real del agente contra las expectativas del escenario
 * a 4 dimensiones independientes:
 *   - ack_correct: ¿si esperaba acuse, lo dio? (solo si expected_intervene=true)
 *   - silence_correct: ¿si esperaba silencio, calló? (solo si expected_intervene=false)
 *   - capture_correct: ¿la captura coincide con expected_capture?
 *   - resolves_correct: ¿marcó el topic correcto como resuelto?
 *   - message_content_correct: ¿el reply incluye / excluye los fragmentos esperados?
 *
 * Cada dimensión es independiente — un mensaje puede acusar correctamente
 * pero fallar la captura, eso se contabiliza por separado.
 */

import type { DecisionAgentOutput } from '@/lib/types';
import type {
  MessageResult,
  Scenario,
  ScenarioMessage,
  ScenarioResult,
  EvalRunResult,
} from './types';

export interface ScoreMessageInput {
  scenario_id: string;
  message_index: number;
  message: ScenarioMessage;
  actual: DecisionAgentOutput;
  cost_usd: number;
  latency_ms: number;
}

export function scoreMessage(input: ScoreMessageInput): MessageResult {
  const { scenario_id, message_index, message, actual, cost_usd, latency_ms } = input;
  const notes: string[] = [];

  // ─── ack_correct: solo aplica si expected_intervene=true ───
  let ack_correct: boolean | null = null;
  if (message.expected_intervene === true) {
    ack_correct = actual.intervene === true && !!actual.message;
    if (!ack_correct) {
      notes.push(`ack expected, got intervene=${actual.intervene}, message=${actual.message ? `"${actual.message.slice(0, 50)}"` : 'null'}, reason="${actual.reason}"`);
    }
  }

  // ─── silence_correct: solo aplica si expected_intervene=false ───
  let silence_correct: boolean | null = null;
  if (message.expected_intervene === false) {
    silence_correct = actual.intervene === false;
    if (!silence_correct) {
      notes.push(`silence expected, got intervene=true with message="${actual.message?.slice(0, 50)}"`);
    } else if (message.expected_silence_reason_includes && message.expected_silence_reason_includes.length > 0) {
      // Validar que la razón mencione un keyword esperado
      const reason = (actual.reason || '').toLowerCase();
      const hit = message.expected_silence_reason_includes.some(kw => reason.includes(kw.toLowerCase()));
      if (!hit) {
        notes.push(`silence reason mismatch: expected mention of [${message.expected_silence_reason_includes.join('|')}], got "${actual.reason}"`);
        // Esto no falla el silence_correct (silencio es correcto), solo lo anota
      }
    }
  }

  // ─── capture_correct: depende de expected_capture.type ───
  let capture_correct: boolean | null = null;
  if (message.expected_capture) {
    const { type } = message.expected_capture;
    if (type === 'none') {
      capture_correct =
        actual.captured_preference === null && actual.captured_learning_item === null;
      if (!capture_correct) {
        notes.push(`no capture expected, got pref=${actual.captured_preference?.preference_type ?? 'null'}, learn=${actual.captured_learning_item?.topic ?? 'null'}`);
      }
    } else if (type === 'preference') {
      const cp = actual.captured_preference;
      if (!cp) {
        capture_correct = false;
        notes.push(`preference capture expected, got null`);
      } else {
        let ok = true;
        if (message.expected_capture.preference_type && cp.preference_type !== message.expected_capture.preference_type) {
          ok = false;
          notes.push(`preference_type mismatch: expected ${message.expected_capture.preference_type}, got ${cp.preference_type}`);
        }
        if (message.expected_capture.source && cp.source !== message.expected_capture.source) {
          ok = false;
          notes.push(`source mismatch: expected ${message.expected_capture.source}, got ${cp.source}`);
        }
        capture_correct = ok;
      }
    } else if (type === 'learning_item') {
      const li = actual.captured_learning_item;
      if (!li) {
        capture_correct = false;
        notes.push(`learning_item expected, got null`);
      } else {
        let ok = true;
        if (message.expected_capture.topic_hint) {
          const topic = li.topic.toLowerCase();
          if (!topic.includes(message.expected_capture.topic_hint.toLowerCase())) {
            ok = false;
            notes.push(`topic hint mismatch: expected to include "${message.expected_capture.topic_hint}", got "${li.topic}"`);
          }
        }
        capture_correct = ok;
      }
    }
  }

  // ─── resolves_correct: depende de expected_resolves_topic ───
  let resolves_correct: boolean | null = null;
  if (message.expected_resolves_topic !== undefined) {
    if (message.expected_resolves_topic === null) {
      resolves_correct = actual.resolves_learning_topic === null;
      if (!resolves_correct) {
        notes.push(`no resolve expected, got resolves_learning_topic="${actual.resolves_learning_topic}"`);
      }
    } else {
      resolves_correct = actual.resolves_learning_topic === message.expected_resolves_topic;
      if (!resolves_correct) {
        notes.push(`resolve expected="${message.expected_resolves_topic}", got "${actual.resolves_learning_topic}"`);
      }
    }
  }

  // ─── message_content_correct: include/exclude checks sobre actual.message ───
  let message_content_correct: boolean | null = null;
  if ((message.expected_message_includes && message.expected_message_includes.length > 0) ||
      (message.expected_message_excludes && message.expected_message_excludes.length > 0)) {
    const txt = (actual.message || '').toLowerCase();
    let ok = true;
    for (const kw of message.expected_message_includes || []) {
      if (!txt.includes(kw.toLowerCase())) {
        ok = false;
        notes.push(`message should include "${kw}", got "${actual.message}"`);
      }
    }
    for (const kw of message.expected_message_excludes || []) {
      if (txt.includes(kw.toLowerCase())) {
        ok = false;
        notes.push(`message should NOT include "${kw}", got "${actual.message}"`);
      }
    }
    message_content_correct = ok;
  }

  return {
    scenario_id,
    message_index,
    text: message.text,
    expected: message,
    actual,
    cost_usd,
    latency_ms,
    ack_correct,
    silence_correct,
    capture_correct,
    resolves_correct,
    message_content_correct,
    notes,
  };
}

export function aggregateScenario(scenario: Scenario, results: MessageResult[]): ScenarioResult {
  let ackPass = 0, ackTotal = 0;
  let silencePass = 0, silenceTotal = 0;
  let capturePass = 0, captureTotal = 0;
  let resolvesPass = 0, resolvesTotal = 0;
  let pass = 0, fail = 0;
  let cost = 0, latency = 0;

  for (const r of results) {
    if (r.ack_correct !== null) { ackTotal++; if (r.ack_correct) ackPass++; }
    if (r.silence_correct !== null) { silenceTotal++; if (r.silence_correct) silencePass++; }
    if (r.capture_correct !== null) { captureTotal++; if (r.capture_correct) capturePass++; }
    if (r.resolves_correct !== null) { resolvesTotal++; if (r.resolves_correct) resolvesPass++; }

    const dims = [r.ack_correct, r.silence_correct, r.capture_correct, r.resolves_correct, r.message_content_correct]
      .filter(v => v !== null);
    const allPassed = dims.length > 0 && dims.every(v => v === true);
    if (allPassed) pass++; else if (dims.length > 0) fail++;

    cost += r.cost_usd;
    latency += r.latency_ms;
  }

  return {
    scenario_id: scenario.id,
    name: scenario.name,
    messages: results,
    ack_rate: ackTotal > 0 ? ackPass / ackTotal : 0,
    silence_rate: silenceTotal > 0 ? silencePass / silenceTotal : 0,
    capture_precision: captureTotal > 0 ? capturePass / captureTotal : 0,
    resolves_correctness: resolvesTotal > 0 ? resolvesPass / resolvesTotal : 0,
    total_cost_usd: Math.round(cost * 1_000_000) / 1_000_000,
    total_latency_ms: latency,
    pass_count: pass,
    fail_count: fail,
  };
}

export function aggregateRun(scenarios: ScenarioResult[]): EvalRunResult {
  let totalMessages = 0, totalPass = 0, totalFail = 0;
  let ackPass = 0, ackTotal = 0;
  let silencePass = 0, silenceTotal = 0;
  let capturePass = 0, captureTotal = 0;
  let resolvesPass = 0, resolvesTotal = 0;
  let cost = 0, latency = 0;

  for (const s of scenarios) {
    totalMessages += s.messages.length;
    totalPass += s.pass_count;
    totalFail += s.fail_count;
    cost += s.total_cost_usd;
    latency += s.total_latency_ms;

    for (const r of s.messages) {
      if (r.ack_correct !== null) { ackTotal++; if (r.ack_correct) ackPass++; }
      if (r.silence_correct !== null) { silenceTotal++; if (r.silence_correct) silencePass++; }
      if (r.capture_correct !== null) { captureTotal++; if (r.capture_correct) capturePass++; }
      if (r.resolves_correct !== null) { resolvesTotal++; if (r.resolves_correct) resolvesPass++; }
    }
  }

  return {
    started_at: '',
    finished_at: '',
    scenarios,
    total_messages: totalMessages,
    total_pass: totalPass,
    total_fail: totalFail,
    global_ack_rate: ackTotal > 0 ? ackPass / ackTotal : 0,
    global_silence_rate: silenceTotal > 0 ? silencePass / silenceTotal : 0,
    global_capture_precision: captureTotal > 0 ? capturePass / captureTotal : 0,
    global_resolves_correctness: resolvesTotal > 0 ? resolvesPass / resolvesTotal : 0,
    total_cost_usd: Math.round(cost * 1_000_000) / 1_000_000,
    avg_latency_ms: totalMessages > 0 ? Math.round(latency / totalMessages) : 0,
  };
}
