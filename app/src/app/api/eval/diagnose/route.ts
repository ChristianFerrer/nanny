import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { diagnoseResults } from '@/lib/eval/diagnosis';
import { CLASSIFIER_PROMPT_TEXT, EXTRACTOR_PROMPT_TEXT } from '../prompt/prompt-texts';
import { saveSnapshot } from '@/lib/chat/prompt-rules';

export const maxDuration = 60;

/**
 * POST: ejecuta diagnóstico AI sobre un run de evaluación.
 * Body: { runId: string }
 *
 * Envía los prompts del pipeline (classifier + extractor) al diagnóstico
 * para que proponga ajustes dirigidos al paso correcto.
 */
export async function POST(req: NextRequest) {
  try {
    const { runId } = await req.json();

    if (!runId) {
      return NextResponse.json({ error: 'runId requerido' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Supabase no configurado' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: run, error } = await supabase
      .from('evaluation_runs')
      .select('*')
      .eq('id', runId)
      .single();

    if (error || !run) {
      return NextResponse.json({ error: 'Run no encontrado' }, { status: 404 });
    }

    // Guardar snapshot antes de diagnosticar (para posible rollback)
    saveSnapshot();

    const results = run.conversation_results;
    const diagnosis = await diagnoseResults(results, {
      classifier: CLASSIFIER_PROMPT_TEXT,
      extractor: EXTRACTOR_PROMPT_TEXT,
    });
    diagnosis.runId = runId;

    return NextResponse.json(diagnosis);
  } catch (e) {
    console.error('Diagnosis error:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}
