import { NextRequest, NextResponse } from 'next/server';
import {
  addRule,
  getAllRules,
  saveSnapshot,
  rollbackToSnapshot,
  clearAllRules,
  getStatus,
  buildRulesText,
} from '@/lib/chat/prompt-rules';

/**
 * DELETE: rollback al estado anterior de las reglas.
 */
export async function DELETE() {
  try {
    const restored = rollbackToSnapshot();
    if (!restored) {
      return NextResponse.json(
        { error: 'No hay snapshot para hacer rollback' },
        { status: 400 }
      );
    }

    const status = getStatus();
    return NextResponse.json({
      success: true,
      message: 'Rollback completado',
      rulesCount: status.totalRules,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET: obtiene el estado actual de los prompts del pipeline + reglas activas.
 */
export async function GET() {
  try {
    const status = getStatus();
    const rules = getAllRules();
    const classifierExtra = buildRulesText('classifier');
    const extractorExtra = buildRulesText('extractor');

    return NextResponse.json({
      id: null,
      version_label: `v${status.currentVersion}`,
      is_active: true,
      pipeline: true,
      status,
      rules,
      classifierExtraRules: classifierExtra,
      extractorExtraRules: extractorExtra,
      change_description: `Pipeline con ${status.totalRules} reglas adicionales (${status.classifierRules} classifier, ${status.extractorRules} extractor)`,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error' },
      { status: 500 }
    );
  }
}

/**
 * POST: aplica un ajuste al pipeline agregando una regla.
 * Body: { target: "classifier"|"extractor", proposedChange: string, description: string }
 *
 * Compatible con el formato anterior: si no hay target, asume "extractor".
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      target = 'extractor',
      proposedChange,
      currentSection,
      description,
    } = body;

    const ruleText = proposedChange || currentSection;
    if (!ruleText) {
      return NextResponse.json(
        { error: 'proposedChange es requerido' },
        { status: 400 }
      );
    }

    const validTarget = target === 'classifier' ? 'classifier' : 'extractor';
    const rule = addRule(
      validTarget as 'classifier' | 'extractor',
      ruleText,
      description || 'Ajuste desde diagnóstico'
    );

    return NextResponse.json({
      success: true,
      version: `v${rule.version}`,
      id: rule.id,
      matchType: 'appended',
      target: validTarget,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT: operaciones especiales (snapshot, clear).
 * Body: { action: "snapshot" | "clear" }
 */
export async function PUT(req: NextRequest) {
  try {
    const { action } = await req.json();

    if (action === 'snapshot') {
      saveSnapshot();
      return NextResponse.json({ success: true, message: 'Snapshot guardado' });
    }

    if (action === 'clear') {
      clearAllRules();
      return NextResponse.json({ success: true, message: 'Reglas limpiadas' });
    }

    return NextResponse.json(
      { error: `Acción desconocida: ${action}` },
      { status: 400 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
