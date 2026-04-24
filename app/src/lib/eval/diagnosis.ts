/**
 * Diagnóstico AI: analiza los fallos de una evaluación y propone ajustes
 * a los prompts del pipeline (classifier y extractor).
 *
 * Usa GPT-4o (no mini) para mayor capacidad analítica.
 */

import OpenAI from 'openai';
import type {
  ConversationResult,
  DiagnosisResult,
  FailurePattern,
  PromptAdjustment,
} from './types';

/**
 * Analiza los resultados de una evaluación y genera diagnóstico + propuestas.
 * Ahora recibe los prompts del pipeline (classifier + extractor) en vez del monolítico.
 */
export async function diagnoseResults(
  results: ConversationResult[],
  pipelinePrompts: { classifier: string; extractor: string },
  options?: { apiKey?: string }
): Promise<DiagnosisResult> {
  const apiKey = options?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY requerida para diagnóstico');

  const openai = new OpenAI({ apiKey, timeout: 40_000 });

  // Collect all failures
  const failures = collectFailures(results);

  if (failures.length === 0) {
    return {
      runId: '',
      timestamp: new Date().toISOString(),
      failurePatterns: [],
      proposedAdjustments: [],
      summary: 'Sin fallos detectados. Todas las conversaciones pasaron correctamente.',
    };
  }

  // Build diagnosis prompt
  const diagnosisPrompt = buildDiagnosisPrompt(failures, pipelinePrompts, results);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 4000,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: `Eres un experto en ingeniería de prompts para LLMs. Analizas fallos en un sistema de coordinación familiar llamado "Nanny".

ARQUITECTURA DE NANNY (pipeline multi-paso):
1. CLASSIFIER (gpt-4o-mini): Clasifica cada mensaje — ¿es accionable? ¿qué tipo? ¿para Nanny?
2. EXTRACTOR (gpt-4o-mini o gpt-4o): Extrae datos estructurados (título, fecha, assigned_to, etc.)
3. POST-PROCESO (código): Corrige assigned_to, valida falsos positivos

Los prompts del classifier y extractor se te proporcionan abajo. Tu trabajo:
1. Identificar PATRONES en los fallos
2. Proponer REGLAS ADICIONALES concretas para agregar al prompt del CLASSIFIER o del EXTRACTOR
3. Cada ajuste debe indicar a cuál prompt va dirigido (target)

IMPORTANTE sobre los ajustes propuestos:
- El campo "proposedChange" debe ser una REGLA NUEVA completa y auto-contenida
- El campo "target" debe ser "classifier" o "extractor" según a cuál prompt aplica:
  - "classifier": si el problema es que Nanny NO DETECTA algo (falso negativo) o detecta de más (falso positivo en clasificación)
  - "extractor": si el problema es que los CAMPOS EXTRAÍDOS son incorrectos (fecha, assigned_to, título, etc.)
- Escríbela como regla clara, ej: "REGLA: Cuando se mencionan dos actividades en un mensaje, detected_items_count debe ser 2"

Responde SIEMPRE en JSON válido con esta estructura:
{
  "patterns": [
    {
      "category": "nombre descriptivo del patrón",
      "description": "descripción clara del problema",
      "failureCount": número,
      "affectedConversations": ["id1", "id2"]
    }
  ],
  "adjustments": [
    {
      "pattern": "nombre del patrón que resuelve",
      "target": "classifier|extractor",
      "currentPromptSection": "área del prompt relacionada (descripción corta)",
      "proposedChange": "REGLA NUEVA COMPLETA a agregar al prompt.",
      "riskLevel": "bajo|medio|alto",
      "expectedImpact": "qué mejora esperamos"
    }
  ],
  "summary": "resumen ejecutivo en 2-3 oraciones"
}`,
      },
      { role: 'user', content: diagnosisPrompt },
    ],
  });

  const content = response.choices[0]?.message?.content || '';

  try {
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(cleanContent);

    const failurePatterns: FailurePattern[] = (parsed.patterns || []).map(
      (p: Record<string, unknown>) => ({
        category: String(p.category || ''),
        description: String(p.description || ''),
        affectedConversations: (p.affectedConversations as string[]) || [],
        failureCount: Number(p.failureCount || 0),
        examples: [],
      })
    );

    const proposedAdjustments: PromptAdjustment[] = (parsed.adjustments || []).map(
      (a: Record<string, unknown>) => ({
        pattern: String(a.pattern || ''),
        target: (['classifier', 'extractor'].includes(String(a.target)) ? a.target : 'extractor') as string,
        currentPromptSection: String(a.currentPromptSection || ''),
        proposedChange: String(a.proposedChange || ''),
        riskLevel: (['bajo', 'medio', 'alto'].includes(String(a.riskLevel))
          ? a.riskLevel
          : 'medio') as 'bajo' | 'medio' | 'alto',
        expectedImpact: String(a.expectedImpact || ''),
        affectedFailures: [],
      })
    );

    return {
      runId: '',
      timestamp: new Date().toISOString(),
      failurePatterns,
      proposedAdjustments,
      summary: String(parsed.summary || ''),
    };
  } catch {
    return {
      runId: '',
      timestamp: new Date().toISOString(),
      failurePatterns: [],
      proposedAdjustments: [],
      summary: `Error parseando diagnóstico. Respuesta raw: ${content.substring(0, 500)}`,
    };
  }
}

interface Failure {
  conversationId: string;
  conversationName: string;
  type: 'detection_missed' | 'detection_incorrect' | 'behavior_failed';
  description: string;
  messageIndex?: number;
  messageText?: string;
  expected: string;
  actual: string;
}

function collectFailures(results: ConversationResult[]): Failure[] {
  const failures: Failure[] = [];

  for (const r of results) {
    // Detection failures
    for (const dm of r.detectionMatches) {
      if (!dm.actual) {
        failures.push({
          conversationId: r.conversationId,
          conversationName: r.conversationName,
          type: 'detection_missed',
          description: `No se detectó ${dm.expected.type}: ${JSON.stringify(dm.expected.data).substring(0, 100)}`,
          expected: JSON.stringify(dm.expected.data),
          actual: 'null (no detectado)',
        });
      } else if (dm.score < 0.7) {
        failures.push({
          conversationId: r.conversationId,
          conversationName: r.conversationName,
          type: 'detection_incorrect',
          description: `Detección parcial (${Math.round(dm.score * 100)}%): campos incorrectos: ${dm.incorrectFields.map(f => f.field).join(', ')}`,
          expected: JSON.stringify(dm.expected.data),
          actual: JSON.stringify(dm.actual.data),
        });
      }
    }

    // Behavior failures
    for (const bm of r.behaviorMatches) {
      if (!bm.passed) {
        failures.push({
          conversationId: r.conversationId,
          conversationName: r.conversationName,
          type: 'behavior_failed',
          description: bm.check,
          expected: 'passed',
          actual: bm.details,
        });
      }
    }
  }

  return failures;
}

function buildDiagnosisPrompt(
  failures: Failure[],
  pipelinePrompts: { classifier: string; extractor: string },
  results: ConversationResult[]
): string {
  const failuresByConversation = new Map<string, Failure[]>();
  for (const f of failures) {
    const existing = failuresByConversation.get(f.conversationId) || [];
    existing.push(f);
    failuresByConversation.set(f.conversationId, existing);
  }

  let prompt = `## PROMPT DEL CLASSIFIER (paso 1 — clasifica si es accionable):
\`\`\`
${pipelinePrompts.classifier.substring(0, 2000)}
\`\`\`

## PROMPT DEL EXTRACTOR (paso 2 — extrae datos estructurados):
\`\`\`
${pipelinePrompts.extractor.substring(0, 3000)}
\`\`\`

## RESULTADOS DE EVALUACIÓN:
Total conversaciones: ${results.length}
Score global: ${Math.round(results.reduce((a, r) => a + r.scores.overall, 0) / results.length * 100)}%
Total fallos: ${failures.length}

## FALLOS POR CONVERSACIÓN:
`;

  for (const [convId, convFailures] of failuresByConversation) {
    const result = results.find(r => r.conversationId === convId);
    prompt += `\n### ${result?.conversationName || convId} (score: ${result?.scores.overall || 0})\n`;
    for (const f of convFailures) {
      prompt += `- [${f.type}] ${f.description}\n  Esperado: ${f.expected.substring(0, 150)}\n  Actual: ${f.actual.substring(0, 150)}\n`;
    }
  }

  prompt += `\n## CATEGORÍAS DE FALLOS:
- detection_missed: ${failures.filter(f => f.type === 'detection_missed').length} (→ ajustar CLASSIFIER para que detecte, o EXTRACTOR para que no descarte)
- detection_incorrect: ${failures.filter(f => f.type === 'detection_incorrect').length} (→ ajustar EXTRACTOR para mejorar campos)
- behavior_failed: ${failures.filter(f => f.type === 'behavior_failed').length} (→ ajustar CLASSIFIER para should_respond/pending)

Para cada ajuste, indica si va al CLASSIFIER o al EXTRACTOR.`;

  return prompt;
}
