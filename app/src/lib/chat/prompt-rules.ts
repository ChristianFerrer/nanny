/**
 * Sistema de reglas adicionales para los prompts del pipeline.
 *
 * Las reglas se almacenan en memoria durante la sesión del servidor.
 * El autopilot puede agregar/quitar reglas, y el pipeline las lee al procesar.
 *
 * En producción (Vercel), las reglas persisten mientras el serverless function
 * esté "warm". Se pierden en cold starts, lo cual es aceptable porque
 * los ajustes importantes se incorporan al código en el siguiente deploy.
 */

export interface PromptRule {
  id: string;
  target: 'classifier' | 'extractor';
  rule: string;
  description: string;
  createdAt: string;
  version: number;
}

// In-memory store — persiste mientras el serverless esté warm
let activeRules: PromptRule[] = [];
let versionCounter = 0;
let preAdjustmentSnapshot: PromptRule[] | null = null;

/**
 * Obtiene todas las reglas activas para un target específico.
 */
export function getRulesForTarget(target: 'classifier' | 'extractor'): PromptRule[] {
  return activeRules.filter(r => r.target === target);
}

/**
 * Obtiene todas las reglas activas.
 */
export function getAllRules(): PromptRule[] {
  return [...activeRules];
}

/**
 * Agrega una nueva regla.
 */
export function addRule(target: 'classifier' | 'extractor', rule: string, description: string): PromptRule {
  versionCounter++;
  const newRule: PromptRule = {
    id: `rule-${versionCounter}-${Date.now()}`,
    target,
    rule,
    description,
    createdAt: new Date().toISOString(),
    version: versionCounter,
  };
  activeRules.push(newRule);
  return newRule;
}

/**
 * Guarda un snapshot de las reglas actuales (para rollback).
 */
export function saveSnapshot(): void {
  preAdjustmentSnapshot = [...activeRules];
}

/**
 * Restaura el snapshot guardado (rollback).
 */
export function rollbackToSnapshot(): boolean {
  if (!preAdjustmentSnapshot) return false;
  activeRules = [...preAdjustmentSnapshot];
  preAdjustmentSnapshot = null;
  return true;
}

/**
 * Limpia todas las reglas.
 */
export function clearAllRules(): void {
  activeRules = [];
  versionCounter = 0;
}

/**
 * Genera el texto de reglas adicionales para inyectar en un prompt.
 */
export function buildRulesText(target: 'classifier' | 'extractor'): string {
  const rules = getRulesForTarget(target);
  if (rules.length === 0) return '';

  const rulesText = rules.map((r, i) => `${i + 1}. ${r.rule}`).join('\n');
  return `\n\n═══════════════════════════════════════
REGLAS ADICIONALES (aplicadas por diagnóstico):
═══════════════════════════════════════
${rulesText}`;
}

/**
 * Información del estado actual.
 */
export function getStatus(): {
  totalRules: number;
  classifierRules: number;
  extractorRules: number;
  currentVersion: number;
  hasSnapshot: boolean;
} {
  return {
    totalRules: activeRules.length,
    classifierRules: activeRules.filter(r => r.target === 'classifier').length,
    extractorRules: activeRules.filter(r => r.target === 'extractor').length,
    currentVersion: versionCounter,
    hasSnapshot: preAdjustmentSnapshot !== null,
  };
}
