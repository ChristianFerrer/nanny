/**
 * Detector determinístico de rutinas semanales en mensajes de chat.
 *
 * El extractor LLM a veces falla en crear confirmation type=routine cuando
 * el mensaje describe claramente un horario fijo (clasifica como SCHEDULE_CHANGE
 * o EVENT_*). Este parser actúa como red de seguridad: si el regex matchea
 * un patrón claro de rutina, se fuerza la creación.
 *
 * Cubre patrones comunes en español rioplatense / latam:
 *  - "Pau tiene guarde de lunes a viernes de 9 a 4:30"
 *  - "Bru tiene guarde de 9 a 5 de lunes a viernes" (orden invertido)
 *  - "Lucía tiene fútbol los martes y jueves a las 18"
 *  - "Mateo va al cole L-V 8-13"
 *  - "Bru tiene natación los sábados y domingos a las 10"
 */

const ACTIVITY_KEYWORDS: Array<{ pattern: RegExp; name: string; type: string }> = [
  { pattern: /guarder[íi]a|\bguarde\b/i, name: 'Guardería', type: 'school' },
  { pattern: /\bcole\b|\bcolegio\b|\bescuela\b/i, name: 'Cole', type: 'school' },
  { pattern: /jard[íi]n\s+de\s+infantes|\bjard[íi]n\b/i, name: 'Jardín', type: 'school' },
  { pattern: /\bf[úu]tbol\b|\bfutbol\b/i, name: 'Fútbol', type: 'activity' },
  { pattern: /\bnataci[óo]n\b/i, name: 'Natación', type: 'activity' },
  { pattern: /\btenis\b|\btennis\b/i, name: 'Tenis', type: 'activity' },
  { pattern: /\bdanza\b|\bballet\b/i, name: 'Danza', type: 'activity' },
  { pattern: /\bm[úu]sica\b|\bpiano\b|\bguitarra\b/i, name: 'Música', type: 'activity' },
  { pattern: /\bingl[ée]s\b/i, name: 'Inglés', type: 'activity' },
];

// Patrones de día — tolerantes a plurales ("sábados", "domingos") y a la
// abreviación de una letra ("L"=lunes, "M"=martes/miércoles ambiguo, "X"=miércoles,
// "J"=jueves, "V"=viernes, "S"=sábado, "D"=domingo).
const DAY_NAMES: Array<{ pattern: RegExp; idx: number }> = [
  { pattern: /\blun(?:es)?s?\b/i, idx: 1 },
  { pattern: /\bmar(?:tes)?s?\b/i, idx: 2 },
  { pattern: /\bmi[ée]r(?:coles)?\b/i, idx: 3 },
  { pattern: /\bjue(?:ves)?s?\b/i, idx: 4 },
  { pattern: /\bvie(?:rnes)?s?\b/i, idx: 5 },
  { pattern: /\bs[áa]b(?:ado)?s?\b/i, idx: 6 },
  { pattern: /\bdom(?:ingo)?s?\b/i, idx: 0 },
];

// Para el regex de rango "de X a Y", X e Y deben ser PALABRAS de día (no números).
// Construimos la alternativa explícita para evitar matchear "de 9 a 5".
const DAY_WORD = '(?:lunes?|martes?|mi[ée]rcoles?|jueves?|viernes?|s[áa]bado?s?|dom(?:ingo)?s?)';
const DAY_RANGE_RE = new RegExp(`(?:de\\s+)?(${DAY_WORD})\\s+a\\s+(${DAY_WORD})`, 'i');

// Abreviación con hyphen obligatorio: "L-V", "S-D".
// NO usamos `[-a]` porque eso matchea "las" (l-a-s → falso positivo).
const DAY_ABBREV_RANGE_RE = /\b([lmxjvsd])\s*-\s*([lmxjvsd])\b/i;
const ABBREV_TO_IDX: Record<string, number> = {
  l: 1, m: 2, x: 3, j: 4, v: 5, s: 6, d: 0,
};

function dayNameToIdx(word: string): number | null {
  for (const dn of DAY_NAMES) {
    if (dn.pattern.test(word)) return dn.idx;
  }
  return null;
}

function expandRange(start: number, end: number): number[] {
  // Map domingo (0) al final para iterar lunes→domingo en orden semanal humano.
  const norm = (d: number) => (d === 0 ? 7 : d);
  const denorm = (d: number) => (d === 7 ? 0 : d);
  const startN = norm(start);
  const endN = norm(end);
  const days: number[] = [];
  let n = startN;
  while (true) {
    days.push(denorm(n));
    if (n === endN) break;
    n = n === 7 ? 1 : n + 1;
    if (days.length > 7) break;
  }
  return days;
}

function parseDays(text: string): number[] {
  const lowered = text.toLowerCase();

  // 1) "de lunes a viernes" / "lunes a viernes"
  const range = lowered.match(DAY_RANGE_RE);
  if (range) {
    const start = dayNameToIdx(range[1]);
    const end = dayNameToIdx(range[2]);
    if (start !== null && end !== null) return expandRange(start, end);
  }

  // 2) Abreviación: "L a V", "L-V", "S-D"
  const abbrev = lowered.match(DAY_ABBREV_RANGE_RE);
  if (abbrev) {
    const s = ABBREV_TO_IDX[abbrev[1].toLowerCase()];
    const e = ABBREV_TO_IDX[abbrev[2].toLowerCase()];
    if (s !== undefined && e !== undefined) return expandRange(s, e);
  }

  // 3) Lista: "los martes y jueves" / "lunes, miércoles y viernes" / "sábados y domingos"
  const found = new Set<number>();
  for (const dn of DAY_NAMES) {
    if (dn.pattern.test(lowered)) found.add(dn.idx);
  }
  return Array.from(found).sort((a, b) => a - b);
}

function parseTimes(text: string): { start: string; end: string | null } | null {
  const lowered = text.toLowerCase();

  // Rango: "de 9 a 4:30" / "9-17" / "9 a 17" / "9:00 a 17:00".
  // Requiere al menos un dígito de cada lado para evitar matchear "lunes a viernes".
  const range = lowered.match(/(?:de\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:a|-|hasta)\s*(\d{1,2})(?::(\d{2}))?\b/);
  if (range) {
    let h1 = parseInt(range[1], 10);
    const m1 = range[2] ? parseInt(range[2], 10) : 0;
    let h2 = parseInt(range[3], 10);
    const m2 = range[4] ? parseInt(range[4], 10) : 0;
    if (h1 < 0 || h1 > 23 || h2 < 0 || h2 > 23) return null;
    // Si la hora final es menor que la inicial (ej "9 a 4"), asumimos PM
    // implícito en la salida: 4:30 → 16:30, 5 → 17, etc.
    if (h2 < h1 && h2 < 12) h2 += 12;
    return {
      start: `${String(h1).padStart(2, '0')}:${String(m1).padStart(2, '0')}`,
      end: `${String(h2).padStart(2, '0')}:${String(m2).padStart(2, '0')}`,
    };
  }

  // Hora suelta: "a las 18" / "a las 17:30"
  const single = lowered.match(/a\s+las?\s+(\d{1,2})(?::(\d{2}))?/);
  if (single) {
    const h = parseInt(single[1], 10);
    const m = single[2] ? parseInt(single[2], 10) : 0;
    return {
      start: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      end: null,
    };
  }
  return null;
}

export interface DetectedRoutine {
  child_name: string;
  name: string;
  type: string;
  days_of_week: number[];
  time_start: string;
  time_end: string | null;
}

export function detectRoutineInMessage(message: string, childrenNames: string[]): DetectedRoutine | null {
  const lowered = message.toLowerCase();

  const child = childrenNames.find(c => {
    const re = new RegExp('\\b' + c.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    return re.test(lowered);
  });
  if (!child) return null;

  const activity = ACTIVITY_KEYWORDS.find(a => a.pattern.test(lowered));
  if (!activity) return null;

  // Heurística anti-cancelación: si el mensaje contiene una negación
  // ("no va", "no hay", "no tiene") cerca de la actividad, NO es creación de
  // rutina sino una excepción puntual. Dejamos que el LLM la maneje.
  if (/\bno\s+(?:va|hay|tiene|tendr[áa]|ir[áa])\b/i.test(lowered)) return null;

  const days = parseDays(lowered);
  if (days.length === 0) return null;

  const times = parseTimes(lowered);
  if (!times) return null;

  return {
    child_name: child,
    name: activity.name,
    type: activity.type,
    days_of_week: days,
    time_start: times.start,
    time_end: times.end,
  };
}
