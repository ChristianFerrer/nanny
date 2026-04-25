/**
 * Scorer: compara las respuestas del API contra el ground truth.
 *
 * Calcula precision, recall, ambiguity handling y behavior score.
 */

import type {
  SyntheticConversation,
  MessageResult,
  DetectionMatch,
  BehaviorMatch,
  ExpectedDetection,
  FieldAccuracy,
} from './types';

interface ScoreResult {
  detectionMatches: DetectionMatch[];
  behaviorMatches: BehaviorMatch[];
  scores: {
    precision: number;
    recall: number;
    ambiguityHandling: number;
    behaviorScore: number;
    falsePositiveRate: number;
    fieldAccuracy: FieldAccuracy;
    overall: number;
  };
}

/**
 * Evalúa una conversación completa comparando respuestas vs ground truth.
 */
export function scoreConversation(
  conversation: SyntheticConversation,
  messageResults: MessageResult[]
): ScoreResult {
  const detectionMatches = scoreDetections(conversation, messageResults);
  const behaviorMatches = scoreBehavior(conversation, messageResults);

  // Calculate precision: of all confirmations emitted, how many match expected?
  const allConfirmations = messageResults.filter(
    mr => mr.response?.confirmation != null
  );
  const correctConfirmations = detectionMatches.filter(dm => dm.score >= 0.5);
  const precision = allConfirmations.length > 0
    ? correctConfirmations.length / allConfirmations.length
    : conversation.expectedDetections.length === 0 ? 1 : 0;

  // Calculate recall: of all expected detections, how many were found?
  const detectedCount = detectionMatches.filter(dm => dm.actual != null).length;
  const recall = conversation.expectedDetections.length > 0
    ? detectedCount / conversation.expectedDetections.length
    : 1;

  // Ambiguity handling: did Nanny handle ambiguous fields correctly?
  const ambiguousMatches = detectionMatches.filter(dm => dm.ambiguousFields.length > 0);
  const ambiguityHandling = ambiguousMatches.length > 0
    ? ambiguousMatches.filter(dm => dm.score >= 0.5).length / ambiguousMatches.length
    : 1;

  // Behavior score
  const behaviorPassed = behaviorMatches.filter(bm => bm.passed).length;
  const behaviorScore = behaviorMatches.length > 0
    ? behaviorPassed / behaviorMatches.length
    : 1;

  // FALSE POSITIVES: confirmaciones emitidas que no matchean ninguna detección esperada
  const falsePositives = scoreFalsePositives(conversation, messageResults, detectionMatches);

  // FIELD ACCURACY: precisión granular por campo (fecha, owner, tipo)
  const fieldAccuracy = scoreFieldAccuracy(detectionMatches);

  // Overall: incluye penalización por false positives
  // Pesos: precision 25%, recall 30%, ambiguity 10%, behavior 15%, FP penalty 10%, fields 10%
  const fpPenalty = 1 - falsePositives.rate; // 1 = sin FPs, 0 = todo son FPs
  const fieldAvg = (fieldAccuracy.dateAccuracy + fieldAccuracy.ownerAccuracy + fieldAccuracy.typeAccuracy) / 3;

  const overall = Math.round(
    (precision * 0.25 + recall * 0.30 + ambiguityHandling * 0.10 +
     behaviorScore * 0.15 + fpPenalty * 0.10 + fieldAvg * 0.10) * 100
  ) / 100;

  return {
    detectionMatches,
    behaviorMatches,
    scores: {
      precision: Math.round(precision * 100) / 100,
      recall: Math.round(recall * 100) / 100,
      ambiguityHandling: Math.round(ambiguityHandling * 100) / 100,
      behaviorScore: Math.round(behaviorScore * 100) / 100,
      falsePositiveRate: Math.round(falsePositives.rate * 100) / 100,
      fieldAccuracy: {
        dateAccuracy: Math.round(fieldAccuracy.dateAccuracy * 100) / 100,
        ownerAccuracy: Math.round(fieldAccuracy.ownerAccuracy * 100) / 100,
        typeAccuracy: Math.round(fieldAccuracy.typeAccuracy * 100) / 100,
      },
      overall,
    },
  };
}

/**
 * Compara detecciones esperadas contra confirmaciones reales.
 */
function scoreDetections(
  conversation: SyntheticConversation,
  messageResults: MessageResult[]
): DetectionMatch[] {
  // Collect all confirmations from responses
  const actualDetections: { type: string; data: Record<string, unknown>; messageIndex: number }[] = [];

  for (const mr of messageResults) {
    if (mr.response?.confirmation) {
      actualDetections.push({
        type: mr.response.confirmation.type,
        data: mr.response.confirmation.data,
        messageIndex: mr.messageIndex,
      });
    }
  }

  // Also check pending_detections that were never completed (partial credit)
  const lastPending = messageResults
    .filter(mr => mr.response?.pending_detection != null)
    .pop();

  return conversation.expectedDetections.map(expected => {
    // Find best matching actual detection
    let bestMatch: { type: string; data: Record<string, unknown> } | null = null;
    let bestScore = 0;
    let bestCorrectFields: string[] = [];
    let bestIncorrectFields: { field: string; expected: unknown; actual: unknown }[] = [];

    for (const actual of actualDetections) {
      if (actual.type !== expected.type) continue;

      const { score, correctFields, incorrectFields } = compareDetection(expected, actual.data);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = { type: actual.type, data: actual.data };
        bestCorrectFields = correctFields;
        bestIncorrectFields = incorrectFields;
      }
    }

    // If no confirmation found, check if it was at least detected as pending
    if (!bestMatch && lastPending?.response?.pending_detection) {
      const pd = lastPending.response.pending_detection;
      if (pd.type === expected.type) {
        const { score, correctFields, incorrectFields } = compareDetection(
          expected,
          pd.partial_data
        );
        bestScore = score * 0.5; // Partial credit for pending
        bestMatch = { type: pd.type, data: pd.partial_data };
        bestCorrectFields = correctFields;
        bestIncorrectFields = incorrectFields;
      }
    }

    return {
      expected,
      actual: bestMatch,
      score: Math.round(bestScore * 100) / 100,
      correctFields: bestCorrectFields,
      incorrectFields: bestIncorrectFields,
      ambiguousFields: expected.ambiguousFields || [],
    };
  });
}

/**
 * Compara una detección esperada contra datos reales campo por campo.
 */
function compareDetection(
  expected: ExpectedDetection,
  actualData: Record<string, unknown>
): {
  score: number;
  correctFields: string[];
  incorrectFields: { field: string; expected: unknown; actual: unknown }[];
} {
  const correctFields: string[] = [];
  const incorrectFields: { field: string; expected: unknown; actual: unknown }[] = [];
  const ambiguous = expected.ambiguousFields || [];

  const fieldsToCheck = Object.keys(expected.data).filter(
    k => !ambiguous.includes(k)
  );

  for (const field of fieldsToCheck) {
    const expectedVal = expected.data[field];
    const actualVal = actualData[field];

    if (fieldMatches(field, expectedVal, actualVal)) {
      correctFields.push(field);
    } else if (ambiguous.includes(field) && (actualVal === null || actualVal === undefined)) {
      // Ambiguous field left as null — don't penalize, count as correct
      correctFields.push(field);
    } else {
      incorrectFields.push({ field, expected: expectedVal, actual: actualVal });
    }
  }

  // Give partial credit for ambiguous fields that were explicitly marked
  for (const field of ambiguous) {
    if (field in expected.data && !fieldsToCheck.includes(field)) {
      correctFields.push(field);
    }
  }

  const totalFields = fieldsToCheck.length;
  const score = totalFields > 0 ? correctFields.length / totalFields : 0;

  return { score, correctFields, incorrectFields };
}

/**
 * Compara valores de un campo con lógica fuzzy.
 */
function fieldMatches(field: string, expected: unknown, actual: unknown): boolean {
  if (expected === null || expected === undefined) return true; // No check needed
  if (actual === null || actual === undefined) return false;

  const expStr = String(expected).toLowerCase().trim();
  const actStr = String(actual).toLowerCase().trim();

  // Title matching: fuzzy - check if key words are present
  if (field === 'title') {
    const expWords = expStr.split(/\s+/).filter(w => w.length > 2);
    const matchedWords = expWords.filter(w => actStr.includes(w));
    return matchedWords.length >= Math.ceil(expWords.length * 0.5);
  }

  // Assigned_to: exact match
  if (field === 'assigned_to') {
    return expStr === actStr;
  }

  // Child: fuzzy name match
  if (field === 'child') {
    return actStr.includes(expStr) || expStr.includes(actStr);
  }

  // Location: fuzzy
  if (field === 'location') {
    const expWords = expStr.split(/\s+/).filter(w => w.length > 2);
    const matchedWords = expWords.filter(w => actStr.includes(w));
    return matchedWords.length >= Math.ceil(expWords.length * 0.4);
  }

  // Date/time: check key components
  if (field === 'date_start' || field === 'due_date') {
    // Extract time from ISO format (after 'T') or from natural language (HH:MM pattern)
    const extractTime = (s: string): string | null => {
      // ISO format: look for T followed by time
      const isoMatch = s.match(/t(\d{2}):(\d{2})/);
      if (isoMatch) return `${isoMatch[1]}:${isoMatch[2]}`;
      // Natural language: look for HH:MM but not inside a date like 2026-03
      const timeMatch = s.match(/(?:^|\s)(\d{1,2}):(\d{2})(?:\s|$)/);
      if (timeMatch) return `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
      // Just hour: "a las 11", "18:00" already covered, standalone number
      const hourMatch = s.match(/(?:^|\s)(\d{1,2})(?::00)?(?:\s|$)/);
      if (hourMatch) {
        const h = parseInt(hourMatch[1]);
        if (h >= 0 && h <= 23) return `${String(h).padStart(2, '0')}:00`;
      }
      return null;
    };

    // Map ISO date to day of week
    const getDayOfWeek = (s: string): string | null => {
      const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
      // Check if already contains a day name
      const namedDay = days.find(d => s.includes(d));
      if (namedDay) return namedDay;
      // Try parsing as ISO date
      const isoMatch = s.match(/(\d{4}-\d{2}-\d{2})/);
      if (isoMatch) {
        const date = new Date(isoMatch[1] + 'T12:00:00');
        if (!isNaN(date.getTime())) return days[date.getDay()];
      }
      return null;
    };

    // Check "mañana" - if expected says "mañana", check if actual date is tomorrow
    const isMañana = expStr.includes('mañana');
    if (isMañana) {
      const isoMatch = actStr.match(/(\d{4}-\d{2}-\d{2})/);
      if (isoMatch) {
        // Accept if it's within a day or two (mañana is relative to eval time)
        // Just check that time matches if both have time
        const expTime = extractTime(expStr);
        const actTime = extractTime(actStr);
        if (expTime && actTime) {
          return expTime.split(':')[0] === actTime.split(':')[0]; // Same hour
        }
        return true; // "mañana" matched to a date, accept if no time to compare
      }
      return actStr.includes('mañana');
    }

    // Compare times
    const expTime = extractTime(expStr);
    const actTime = extractTime(actStr);
    const expDow = getDayOfWeek(expStr);
    const actDow = getDayOfWeek(actStr);

    // If both have day of week AND time, both must match
    if (expDow && actDow && expTime && actTime) {
      return expDow === actDow && expTime.split(':')[0] === actTime.split(':')[0];
    }
    // If both have day of week, compare
    if (expDow && actDow) return expDow === actDow;
    // If both have time, compare hours
    if (expTime && actTime) {
      return expTime.split(':')[0] === actTime.split(':')[0];
    }
    // Fallback: substring
    return actStr.includes(expStr) || expStr.includes(actStr);
  }

  // Event type
  if (field === 'event_type') {
    return expStr === actStr;
  }

  // Medication fields
  if (field === 'medication_name') {
    const expWords = expStr.split(/\s+/).filter(w => w.length > 2);
    return expWords.some(w => actStr.includes(w));
  }

  if (field === 'duration_days') {
    return Number(expected) === Number(actual);
  }

  if (field === 'frequency') {
    return actStr.includes(expStr) || expStr.includes(actStr);
  }

  if (field === 'schedule_times') {
    const expTimes = Array.isArray(expected) ? expected : [];
    const actTimes = Array.isArray(actual) ? actual : [];
    if (expTimes.length === 0) return true;
    const matched = expTimes.filter((t: string) =>
      actTimes.some((at: string) => at === t)
    );
    return matched.length >= Math.ceil(expTimes.length * 0.6);
  }

  // Default: substring match
  return actStr.includes(expStr) || expStr.includes(actStr);
}

/**
 * Calcula falsos positivos: confirmaciones que no matchean ninguna detección esperada.
 * Un falso positivo es cuando Nanny "inventa" un evento/tarea que no existe en la conversación.
 */
function scoreFalsePositives(
  conversation: SyntheticConversation,
  messageResults: MessageResult[],
  detectionMatches: DetectionMatch[]
): { count: number; total: number; rate: number } {
  const allConfirmations = messageResults.filter(
    mr => mr.response?.confirmation != null
  );

  if (allConfirmations.length === 0) {
    return { count: 0, total: 0, rate: 0 };
  }

  const matchedActuals = new Set<string>();
  for (const dm of detectionMatches) {
    if (dm.actual && dm.score >= 0.5) {
      // Crear key única para esta confirmación
      matchedActuals.add(JSON.stringify(dm.actual.data));
    }
  }

  // Confirmaciones que no matchean ninguna detección esperada = falsos positivos
  let fpCount = 0;
  for (const mr of allConfirmations) {
    const confKey = JSON.stringify(mr.response!.confirmation!.data);
    if (!matchedActuals.has(confKey)) {
      fpCount++;
    }
  }

  return {
    count: fpCount,
    total: allConfirmations.length,
    rate: fpCount / allConfirmations.length,
  };
}

/**
 * Calcula precisión por campo específico entre las detecciones que sí matchearon.
 * - dateAccuracy: precisión en date_start, due_date
 * - ownerAccuracy: precisión en assigned_to
 * - typeAccuracy: precisión en event_type, intent
 */
function scoreFieldAccuracy(detectionMatches: DetectionMatch[]): {
  dateAccuracy: number;
  ownerAccuracy: number;
  typeAccuracy: number;
} {
  const matched = detectionMatches.filter(dm => dm.actual != null);

  if (matched.length === 0) {
    return { dateAccuracy: 1, ownerAccuracy: 1, typeAccuracy: 1 };
  }

  let dateTotal = 0, dateCorrect = 0;
  let ownerTotal = 0, ownerCorrect = 0;
  let typeTotal = 0, typeCorrect = 0;

  for (const dm of matched) {
    const dateFields = ['date_start', 'due_date'];
    const ownerFields = ['assigned_to'];
    const typeFields = ['event_type'];
    const ambiguous = dm.ambiguousFields || [];

    for (const field of dateFields) {
      if (field in dm.expected.data && !ambiguous.includes(field)) {
        dateTotal++;
        if (dm.correctFields.includes(field)) dateCorrect++;
      }
    }

    for (const field of ownerFields) {
      if (field in dm.expected.data && !ambiguous.includes(field)) {
        ownerTotal++;
        if (dm.correctFields.includes(field)) ownerCorrect++;
      }
    }

    for (const field of typeFields) {
      if (field in dm.expected.data && !ambiguous.includes(field)) {
        typeTotal++;
        if (dm.correctFields.includes(field)) typeCorrect++;
      }
    }
  }

  return {
    dateAccuracy: dateTotal > 0 ? dateCorrect / dateTotal : 1,
    ownerAccuracy: ownerTotal > 0 ? ownerCorrect / ownerTotal : 1,
    typeAccuracy: typeTotal > 0 ? typeCorrect / typeTotal : 1,
  };
}

/**
 * Evalúa el comportamiento general de Nanny en la conversación.
 */
function scoreBehavior(
  conversation: SyntheticConversation,
  messageResults: MessageResult[]
): BehaviorMatch[] {
  const matches: BehaviorMatch[] = [];
  const behavior = conversation.expectedBehavior;

  // Check should_stay_silent
  if (behavior.shouldStaySilentAt && behavior.shouldStaySilentAt.length > 0) {
    for (const idx of behavior.shouldStaySilentAt) {
      const mr = messageResults[idx];
      if (mr?.response) {
        const wasSilent = !mr.response.should_respond ||
          mr.response.intent === 'IGNORE' ||
          mr.response.intent === 'CHAT';
        matches.push({
          check: `Silencio en mensaje ${idx}: "${mr.messageText.substring(0, 40)}..."`,
          passed: wasSilent,
          details: wasSilent
            ? 'Nanny permaneció callada correctamente'
            : `Nanny respondió con intent=${mr.response.intent}: "${mr.response.reply?.substring(0, 50)}"`,
        });
      }
    }
  }

  // Check pending detection usage
  if (behavior.shouldUsePendingDetection) {
    const usedPending = messageResults.some(
      mr => mr.response?.pending_detection != null
    );
    matches.push({
      check: 'Uso de pending_detection para info incompleta',
      passed: usedPending,
      details: usedPending
        ? 'Nanny usó pending_detection correctamente'
        : 'Nanny nunca usó pending_detection (esperado que lo usara)',
    });
  }

  // Check delegation detection
  if (behavior.shouldDetectDelegation) {
    const detectedDelegation = messageResults.some(mr => {
      const conf = mr.response?.confirmation;
      return conf?.data?.assigned_to != null;
    });
    matches.push({
      check: 'Detección de delegación de responsabilidad',
      passed: detectedDelegation,
      details: detectedDelegation
        ? 'Nanny detectó quién se hace responsable'
        : 'Nanny no asignó responsable en ninguna detección',
    });
  }

  // Check schedule change detection
  if (behavior.shouldDetectScheduleChange) {
    const detectedChange = messageResults.some(
      mr => mr.response?.intent === 'SCHEDULE_CHANGE' ||
        mr.response?.next_action === 'update_existing_event'
    );
    matches.push({
      check: 'Detección de cambio de planes',
      passed: detectedChange,
      details: detectedChange
        ? 'Nanny detectó el cambio de horario/plan'
        : 'Nanny no detectó cambios de plan (SCHEDULE_CHANGE no emitido)',
    });
  }

  // Check asking for missing info
  if (behavior.shouldAskForMissing && behavior.shouldAskForMissing.length > 0) {
    const askedForMissing = messageResults.some(
      mr => mr.response?.next_action === 'ask_for_missing_time' ||
        mr.response?.next_action === 'ask_for_missing_responsible_parent'
    );
    matches.push({
      check: `Preguntó por info faltante: ${behavior.shouldAskForMissing.join(', ')}`,
      passed: askedForMissing,
      details: askedForMissing
        ? 'Nanny preguntó por la información que faltaba'
        : 'Nanny no preguntó por info faltante (debería haberlo hecho)',
    });
  }

  // Check no errors
  const hasErrors = messageResults.some(mr => mr.error != null);
  matches.push({
    check: 'Sin errores de API',
    passed: !hasErrors,
    details: hasErrors
      ? `Errores: ${messageResults.filter(mr => mr.error).map(mr => mr.error).join(', ')}`
      : 'Todas las llamadas exitosas',
  });

  return matches;
}
