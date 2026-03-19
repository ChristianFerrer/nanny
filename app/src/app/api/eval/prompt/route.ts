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

    let newContent: string;

    if (currentContent.includes(currentSection)) {
      // Match exacto encontrado
      newContent = currentContent.replace(currentSection, proposedChange);
    } else {
      // Fuzzy matching: buscar la sección más similar en el prompt
      const matchedSection = findBestMatch(currentContent, currentSection);
      if (matchedSection) {
        newContent = currentContent.replace(matchedSection, proposedChange);
      } else {
        // Si no hay match, agregar el cambio al final del prompt como nueva sección
        newContent = currentContent + '\n\n' + proposedChange;
      }
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
      matchType: currentContent.includes(currentSection) ? 'exact' : 'fuzzy',
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error aplicando ajuste' },
      { status: 500 }
    );
  }
}

/**
 * Busca la sección más similar en el contenido del prompt.
 * Compara líneas normalizadas para tolerar diferencias de espacios/puntuación.
 */
function findBestMatch(content: string, searchSection: string): string | null {
  // Normalizar para comparación: lowercase, quitar espacios extra
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const normalizedSearch = normalize(searchSection);

  // Si la sección normalizada está contenida en el contenido normalizado
  const normalizedContent = normalize(content);
  if (normalizedContent.includes(normalizedSearch)) {
    // Encontrar la posición en el original
    const searchWords = normalizedSearch.split(' ').slice(0, 5).join(' ');
    const contentWords = normalizedContent.split(' ');
    const searchWordsArr = searchWords.split(' ');

    for (let i = 0; i < contentWords.length; i++) {
      if (contentWords.slice(i, i + searchWordsArr.length).join(' ') === searchWordsArr.join(' ')) {
        // Encontramos el inicio aproximado, extraer del original
        const lines = content.split('\n');
        const searchLines = searchSection.split('\n').length;
        const normalizedLines = lines.map(l => normalize(l));
        const firstSearchLine = normalize(searchSection.split('\n')[0]);

        for (let j = 0; j < normalizedLines.length; j++) {
          if (normalizedLines[j].includes(firstSearchLine.substring(0, 30))) {
            return lines.slice(j, j + searchLines).join('\n');
          }
        }
      }
    }
  }

  // Fallback: buscar por primera línea significativa
  const searchFirstLine = normalize(searchSection.split('\n').find(l => l.trim().length > 10) || '');
  if (searchFirstLine.length > 10) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (normalize(lines[i]).includes(searchFirstLine.substring(0, Math.min(40, searchFirstLine.length)))) {
        const searchLineCount = searchSection.split('\n').length;
        return lines.slice(i, i + searchLineCount).join('\n');
      }
    }
  }

  return null;
}
