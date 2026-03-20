import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { SYSTEM_PROMPT } from '@/lib/chat/processChat';

/**
 * DELETE: rollback al prompt anterior (reactiva el parent version).
 * Body: { targetVersionId?: string }
 * Si targetVersionId se proporciona, reactiva esa versión específica.
 * Si no, reactiva el parent del prompt activo actual.
 */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { targetVersionId } = body as { targetVersionId?: string };

    const supabase = getSupabaseAdmin();

    // Obtener prompt activo actual
    const { data: activePrompt } = await supabase
      .from('system_prompts')
      .select('*')
      .eq('is_active', true)
      .single();

    if (!activePrompt) {
      return NextResponse.json(
        { error: 'No hay prompt activo para hacer rollback' },
        { status: 400 }
      );
    }

    const rollbackToId = targetVersionId || activePrompt.parent_version_id;
    if (!rollbackToId) {
      return NextResponse.json(
        { error: 'No hay versión anterior para hacer rollback' },
        { status: 400 }
      );
    }

    // Desactivar el prompt actual
    await supabase
      .from('system_prompts')
      .update({ is_active: false })
      .eq('id', activePrompt.id);

    // Reactivar la versión target
    const { data: restored, error } = await supabase
      .from('system_prompts')
      .update({ is_active: true })
      .eq('id', rollbackToId)
      .select()
      .single();

    if (error) {
      // Reactivar el actual si falló
      await supabase
        .from('system_prompts')
        .update({ is_active: true })
        .eq('id', activePrompt.id);
      throw error;
    }

    return NextResponse.json({
      success: true,
      rolledBackFrom: activePrompt.version_label,
      restoredVersion: restored.version_label,
      restoredId: restored.id,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error en rollback' },
      { status: 500 }
    );
  }
}

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
 *
 * Estrategia de aplicación:
 * 1. Si currentSection se encuentra exacto en el prompt → reemplaza
 * 2. Si no → agrega proposedChange al final del prompt como regla adicional
 */
export async function POST(req: NextRequest) {
  try {
    const { currentSection, proposedChange, description } = await req.json();

    if (!proposedChange) {
      return NextResponse.json(
        { error: 'proposedChange es requerido' },
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

    let newContent: string;
    let matchType: 'exact' | 'appended';

    if (currentSection && currentContent.includes(currentSection)) {
      // Match exacto: reemplazar la sección
      newContent = currentContent.replace(currentSection, proposedChange);
      matchType = 'exact';
    } else {
      // Sin match exacto: agregar como regla adicional al final
      // Insertar antes del bloque de JSON de respuesta si existe, o al final
      const jsonBlockMarker = '## FORMATO DE RESPUESTA';
      const jsonBlockIdx = currentContent.indexOf(jsonBlockMarker);

      if (jsonBlockIdx > 0) {
        // Insertar la nueva regla justo antes del formato de respuesta
        newContent = currentContent.slice(0, jsonBlockIdx)
          + '\n' + proposedChange + '\n\n'
          + currentContent.slice(jsonBlockIdx);
      } else {
        newContent = currentContent + '\n\n' + proposedChange;
      }
      matchType = 'appended';
    }

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
      matchType,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error aplicando ajuste' },
      { status: 500 }
    );
  }
}
