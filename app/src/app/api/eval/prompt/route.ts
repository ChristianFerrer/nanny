import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { SYSTEM_PROMPT } from '@/lib/chat/processChat';

/**
 * GET: obtiene el prompt activo (o el hardcoded si no hay ninguno en DB).
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const { data } = await supabase
      .from('system_prompts')
      .select('*')
      .eq('is_active', true)
      .single();

    if (data) {
      return NextResponse.json(data);
    }

    // No hay prompt en DB, devolver el hardcoded
    return NextResponse.json({
      id: null,
      version_label: 'hardcoded',
      content: SYSTEM_PROMPT,
      is_active: true,
      change_description: 'Prompt original hardcoded en el código',
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
 * POST: aplica un ajuste al prompt activo, creando una nueva versión.
 * Body: { currentSection: string, proposedChange: string, description: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { currentSection, proposedChange, description } = await req.json();

    if (!currentSection || !proposedChange) {
      return NextResponse.json(
        { error: 'currentSection y proposedChange son requeridos' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Obtener prompt activo actual
    const { data: activePrompt } = await supabase
      .from('system_prompts')
      .select('*')
      .eq('is_active', true)
      .single();

    const currentContent = activePrompt?.content || SYSTEM_PROMPT;
    const parentId = activePrompt?.id || null;

    // Verificar que la sección existe en el prompt actual
    if (!currentContent.includes(currentSection)) {
      return NextResponse.json(
        { error: 'La sección indicada no se encontró en el prompt actual. Puede que ya haya sido modificada.' },
        { status: 400 }
      );
    }

    // Aplicar el cambio
    const newContent = currentContent.replace(currentSection, proposedChange);

    // Generar label de versión
    const versionNum = activePrompt?.version_label
      ? parseInt(activePrompt.version_label.replace('v', '')) + 1
      : 1;
    const versionLabel = `v${versionNum}`;

    // Desactivar el prompt actual
    if (activePrompt?.id) {
      await supabase
        .from('system_prompts')
        .update({ is_active: false })
        .eq('id', activePrompt.id);
    }

    // Crear nueva versión activa
    const { data: newPrompt, error } = await supabase
      .from('system_prompts')
      .insert({
        version_label: versionLabel,
        content: newContent,
        is_active: true,
        parent_version_id: parentId,
        change_description: description || `Ajuste aplicado desde diagnóstico`,
      })
      .select()
      .single();

    if (error) {
      // Reactivar el anterior si falló
      if (activePrompt?.id) {
        await supabase
          .from('system_prompts')
          .update({ is_active: true })
          .eq('id', activePrompt.id);
      }
      throw error;
    }

    return NextResponse.json({
      success: true,
      version: newPrompt.version_label,
      id: newPrompt.id,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error aplicando ajuste' },
      { status: 500 }
    );
  }
}
