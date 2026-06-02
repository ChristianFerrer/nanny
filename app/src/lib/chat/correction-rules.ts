/**
 * Cuando un padre corrige a Nanny ("yo soy papá no mamá", "no le digas Pau,
 * dile Paulina"), algunas correcciones son ONE-OFF (Nanny puso mal una hora,
 * un día) y otras son GENERALES — se aplican a futuras interacciones (rol del
 * padre, nombre preferido, asignación habitual).
 *
 * Este módulo destila las correcciones generales en una regla persistida en
 * `prompt_rules_state` (target='extractor') para que Nanny no vuelva a
 * cometer el mismo error.
 */

import OpenAI from 'openai';
import { addRule } from './prompt-rules';

const DISTILL_PROMPT = `Sos un destilador de correcciones del asistente familiar Nanny. Recibís el mensaje en el que un padre corrige a Nanny y devolvés JSON.

Decidí si la corrección es:
- GENERAL: aplica a futuras interacciones. Ejemplos:
  * "soy papá, no mamá" (rol del usuario)
  * "yo siempre llevo a Pau, no su mamá" (asignación habitual)
  * "decile Paulina, no Pau" (preferencia de nombre)
  * "Lucía es mi hija, no mi sobrina"
  * "vivimos en GMT-3 / Argentina" (zona horaria)
- ONE_OFF: corrección puntual de un dato concreto. Ejemplos:
  * "no es a las 3 sino a las 4"
  * "es el martes no el lunes"
  * "es Lucía no Pau" (cuando se trata de un evento puntual)

Si es GENERAL, devolvé una regla CORTA (≤20 palabras) en infinitivo o tercera persona, lista para guardar como recordatorio permanente. NO incluyas el contexto del mensaje, solo la regla destilada.

Formato de respuesta (JSON puro):
{
  "kind": "GENERAL" | "ONE_OFF",
  "rule": "string corta o vacía si ONE_OFF",
  "description": "qué se corrigió, en 1 frase para humanos"
}`;

export async function persistCorrectionIfGeneral(
  openai: OpenAI,
  correctionMessage: string,
  senderName: string,
  senderRole: 'mama' | 'papa'
): Promise<{ persisted: boolean; rule?: string }> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 150,
      temperature: 0.1,
      messages: [
        { role: 'system', content: DISTILL_PROMPT },
        { role: 'user', content: `MENSAJE DE ${senderName} (${senderRole}): ${correctionMessage}` },
      ],
    });
    const content = response.choices[0]?.message?.content?.trim() || '';
    let clean = content;
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    const parsed = JSON.parse(clean) as { kind?: string; rule?: string; description?: string };
    if (parsed.kind === 'GENERAL' && parsed.rule && parsed.rule.trim().length > 0) {
      await addRule('extractor', parsed.rule.trim(), parsed.description || 'Corrección persistida');
      return { persisted: true, rule: parsed.rule.trim() };
    }
    return { persisted: false };
  } catch (e) {
    console.warn('[correction-rules] failed to distill:', e);
    return { persisted: false };
  }
}
