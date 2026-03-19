/**
 * Diagnóstico AI: analiza los fallos de una evaluación y propone ajustes al prompt.
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
 */
export async function diagnoseResults(
  results: ConversationResult[],
  systemPromptSnippet: string,
  options?: { apiKey?: string }
): Promise<DiagnosisResult> {
  const apiKey = options?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY requerida para diagnóstico');

  const openai = new OpenAI({ apiKey });

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
  const diagnosisPrompt = buildDiagnosisPrompt(failures, systemPromptSnippet, results);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 4000,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: `Eres un experto en ingeniería de prompts para LLMs. Analizas fallos en un sistema de detección de intents para una app de coordinación familiar llamada "Nanny".

Tu trabajo:
1. Identificar PATRONES en los fallos (no listar cada fallo individual)
2. Proponer INSTRUCCIONES ADICIONALES concretas que se agregarán al system prompt para resolver esos patrones
3. Evaluar el RIESGO de cada cambio

IMPORTANTE sobre los ajustes propuestos:
- El campo "proposedChange" debe ser una INSTRUCCIÓN NUEVA completa y auto-contenida que se agregará al prompt
- Escríbela como una regla clara que Nanny debe seguir, por ejemplo: "REGLA: Cuando un padre menciona una fecha futura con actividad, SIEMPRE detectar como evento aunque no use palabras como 'cita' o 'evento'"
- NO intentes citar o referenciar secciones existentes del prompt - solo propón texto nuevo a agregar
- El campo "currentPromptSection" debe ser una descripción corta de QUÉ ÁREA del prompt está relacionada (ej: "detección de eventos", "manejo de ambigüedad")

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
      "pattern": "nombre descriptivo del patrón que resuelve",
      "currentPromptSection": "área del prompt relacionada (descripción corta)",
      "proposedChange": "REGLA NUEVA COMPLETA a agregar al prompt. Debe ser auto-contenida y clara.",
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
  systemPromptSnippet: string,
  results: ConversationResult[]
): string {
  const failuresByConversation = new Map<string, Failure[]>();
  for (const f of failures) {
    const existing = failuresByConversation.get(f.conversationId) || [];
    existing.push(f);
    failuresByConversation.set(f.conversationId, existing);
  }

  let prompt = `## SYSTEM PROMPT ACTUAL DE NANNY (primeras 200 líneas relevantes):
\`\`\`
${systemPromptSnippet.substring(0, 4000)}
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
- detection_missed: ${failures.filter(f => f.type === 'detection_missed').length}
- detection_incorrect: ${failures.filter(f => f.type === 'detection_incorrect').length}
- behavior_failed: ${failures.filter(f => f.type === 'behavior_failed').length}

Analiza los patrones y propón ajustes específicos al system prompt.`;

  return prompt;
}
