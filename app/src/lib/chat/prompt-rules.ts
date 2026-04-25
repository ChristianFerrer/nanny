/**
 * Sistema de reglas adicionales para los prompts del pipeline.
 *
 * Las reglas se persisten en la tabla `prompt_rules_state` de Supabase
 * (fila singleton id=1). Cada proceso serverless mantiene un cache
 * en memoria con TTL corto (10s) para evitar hacer fetch a Supabase
 * en cada mensaje del chat.
 *
 * Antes vivían solo en memoria, lo cual rompía el autopilot entre
 * invocaciones serverless (las reglas agregadas en `diagnosis` se perdían
 * en la fase `reeval` cuando corría en otra instancia).
 */
import { getSupabaseAdmin } from '@/lib/supabase';

export interface PromptRule {
  id: string;
  target: 'classifier' | 'extractor';
  rule: string;
  description: string;
  createdAt: string;
  version: number;
}

interface StateRow {
  active_rules: PromptRule[];
  snapshot: PromptRule[] | null;
  version_counter: number;
}

// ─── Cache en memoria ───
const CACHE_TTL_MS = 10_000;
let cached: StateRow | null = null;
let cachedAt = 0;

function invalidateCache() {
  cached = null;
  cachedAt = 0;
}

async function loadState(force = false): Promise<StateRow> {
  if (!force && cached && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('prompt_rules_state')
    .select('active_rules, snapshot, version_counter')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    // Tabla puede no existir todavía si la migración no corrió;
    // devolver estado vacío para no romper el chat.
    console.warn('[prompt-rules] loadState error:', error.message);
    const empty: StateRow = { active_rules: [], snapshot: null, version_counter: 0 };
    cached = empty;
    cachedAt = Date.now();
    return empty;
  }

  const state: StateRow = data
    ? {
        active_rules: (data.active_rules as PromptRule[]) || [],
        snapshot: (data.snapshot as PromptRule[] | null) ?? null,
        version_counter: (data.version_counter as number) || 0,
      }
    : { active_rules: [], snapshot: null, version_counter: 0 };

  cached = state;
  cachedAt = Date.now();
  return state;
}

async function saveState(state: StateRow): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from('prompt_rules_state')
    .upsert({
      id: 1,
      active_rules: state.active_rules,
      snapshot: state.snapshot,
      version_counter: state.version_counter,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error('[prompt-rules] saveState error:', error.message);
    throw new Error(`No se pudo persistir prompt_rules_state: ${error.message}`);
  }

  cached = state;
  cachedAt = Date.now();
}

// ─── API pública ───

/**
 * Obtiene todas las reglas activas para un target específico.
 */
export async function getRulesForTarget(target: 'classifier' | 'extractor'): Promise<PromptRule[]> {
  const state = await loadState();
  return state.active_rules.filter(r => r.target === target);
}

/**
 * Obtiene todas las reglas activas.
 */
export async function getAllRules(): Promise<PromptRule[]> {
  const state = await loadState();
  return [...state.active_rules];
}

/**
 * Agrega una nueva regla.
 */
const MAX_RULES_PER_TARGET = 5;

export async function addRule(
  target: 'classifier' | 'extractor',
  rule: string,
  description: string,
): Promise<PromptRule> {
  const state = await loadState(true);
  const nextVersion = state.version_counter + 1;
  const newRule: PromptRule = {
    id: `rule-${nextVersion}-${Date.now()}`,
    target,
    rule,
    description,
    createdAt: new Date().toISOString(),
    version: nextVersion,
  };

  let rules = [...state.active_rules, newRule];
  const targetRules = rules.filter(r => r.target === target);
  if (targetRules.length > MAX_RULES_PER_TARGET) {
    const oldest = targetRules.slice(0, targetRules.length - MAX_RULES_PER_TARGET);
    const oldIds = new Set(oldest.map(r => r.id));
    rules = rules.filter(r => !oldIds.has(r.id));
  }

  const nextState: StateRow = {
    active_rules: rules,
    snapshot: state.snapshot,
    version_counter: nextVersion,
  };
  await saveState(nextState);
  return newRule;
}

export async function removeRule(ruleId: string): Promise<boolean> {
  const state = await loadState(true);
  const before = state.active_rules.length;
  const nextState: StateRow = {
    active_rules: state.active_rules.filter(r => r.id !== ruleId),
    snapshot: state.snapshot,
    version_counter: state.version_counter,
  };
  if (nextState.active_rules.length === before) return false;
  await saveState(nextState);
  return true;
}

export async function replaceAllRules(rules: Array<{ target: 'classifier' | 'extractor'; rule: string; description: string }>): Promise<void> {
  const state = await loadState(true);
  let version = state.version_counter;
  const newRules: PromptRule[] = rules.map(r => {
    version++;
    return {
      id: `rule-${version}-${Date.now()}`,
      target: r.target,
      rule: r.rule,
      description: r.description,
      createdAt: new Date().toISOString(),
      version,
    };
  });
  await saveState({
    active_rules: newRules,
    snapshot: state.snapshot,
    version_counter: version,
  });
}

/**
 * Guarda un snapshot de las reglas actuales (para rollback).
 */
export async function saveSnapshot(): Promise<void> {
  const state = await loadState(true);
  await saveState({
    ...state,
    snapshot: [...state.active_rules],
  });
}

/**
 * Restaura el snapshot guardado (rollback).
 */
export async function rollbackToSnapshot(): Promise<boolean> {
  const state = await loadState(true);
  if (!state.snapshot) return false;
  await saveState({
    active_rules: [...state.snapshot],
    snapshot: null,
    version_counter: state.version_counter,
  });
  return true;
}

/**
 * Limpia todas las reglas.
 */
export async function clearAllRules(): Promise<void> {
  await saveState({
    active_rules: [],
    snapshot: null,
    version_counter: 0,
  });
}

/**
 * Genera el texto de reglas adicionales para inyectar en un prompt.
 */
export async function buildRulesText(target: 'classifier' | 'extractor'): Promise<string> {
  const rules = await getRulesForTarget(target);
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
export async function getStatus(): Promise<{
  totalRules: number;
  classifierRules: number;
  extractorRules: number;
  currentVersion: number;
  hasSnapshot: boolean;
}> {
  const state = await loadState();
  return {
    totalRules: state.active_rules.length,
    classifierRules: state.active_rules.filter(r => r.target === 'classifier').length,
    extractorRules: state.active_rules.filter(r => r.target === 'extractor').length,
    currentVersion: state.version_counter,
    hasSnapshot: state.snapshot !== null,
  };
}

/**
 * Fuerza invalidación del cache (para tests o después de modificaciones externas).
 */
export function invalidatePromptRulesCache(): void {
  invalidateCache();
}
