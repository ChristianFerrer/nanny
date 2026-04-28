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
 *  - "Pau va a la guarde lunes a viernes 9-17"
 *  - "Lucía hace fútbol los martes y jueves a las 18"
 *  - "Mateo tiene natación los miércoles 17:00"
 */

const ACTIVITY_KEYWORDS: Array<{ pattern: RegExp; name: string; type: string }> = [
  { pattern: /guarder[íi]a|guarde\b/i, name: 'Guardería', type: 'school' },
  { pattern: /\bcole\b|\bcolegio\b|\bescuela\b/i, name: 'Cole', type: 'school' },
  { pattern: /jard[íi]n\s+de\s+infantes|jard[íi]n\b/i, name: 'Jardín', type: 'school' },
  { pattern: /\bf[úu]tbol\b|\bfutbol\b/i, name: 'Fútbol', type: 'activity' },
  { pattern: /\bnataci[óo]n\b/i, name: 'Natación', type: 'activity' },
  { pattern: /\btenis\b|\btennis\b/i, name: 'Tenis', type: 'activity' },
  { pattern: /\bdanza\b|\bballet\b/i, name: 'Danza', type: 'activity' },
  { pattern: /\bm[úu]sica\b|\bpiano\b|\bguitarra\b/i, name: 'Música', type: 'activity' },
  { pattern: /\bingl[ée]s\b/i, name: 'Inglés', type: 'activity' },
];

const DAY_NAMES: Array<{ pattern: RegExp; idx: number }> = [
  { pattern: /\blun(es)?\b/i, idx: 1 },
  { pattern: /\bmar(tes)?\b/i, idx: 2 },
  { pattern: /\bmi[ée]r(coles)?\b/i, idx: 3 },
  { pattern: /\bjue(ves)?\b/i, idx: 4 },
  { pattern: /\bvie(rnes)?\b/i, idx: 5 },
  { pattern: /\bs[áa]b(ado)?\b/i, idx: 6 },
  { pattern: /\bdom(ingo)?\b/i, idx: 0 },
];

function parseDays(text: string): number[] {
  const lowered = text.toLowerCase();

  // "de lunes a viernes" / "lunes a viernes"
  const range = lowered.match(/de\s+(\w+)\s+a\s+(\w+)/);
  if (range) {
    const start = DAY_NAMES.find(d => d.pattern.test(range[1]));
    const end = DAY_NAMES.find(d => d.pattern.test(range[2]));
    if (start && end) {
      // Construir rango circular si end < start (raro, pero seguro)
      const days: number[] = [];
      let i = start.idx;
      // Map: 1..5 = L..V, 6 = S, 0 = D. Convertimos a 0-6 lineal con L=1.
      // Para iterar de forma simple usamos índice 1..7 con D=7.
      const norm = (d: number) => d === 0 ? 7 : d;
      const denorm = (d: number) => d === 7 ? 0 : d;
      const startN = norm(start.idx), endN = norm(end.idx);
      let n = startN;
      while (true) {
        days.push(denorm(n));
        if (n === endN) break;
        n = n === 7 ? 1 : n + 1;
        if (days.length > 7) break;
      }
      return days;
    }
  }

  // "los martes y jueves" / "martes y jueves" / "lunes, miércoles y viernes"
  const found = new Set<number>();
  for (const dn of DAY_NAMES) {
    if (dn.pattern.test(lowered)) found.add(dn.idx);
  }
  return Array.from(found).sort();
}

function parseTimes(text: string): { start: string; end: string | null } | null {
  const lowered = text.toLowerCase();

  // "de 9 a 4:30" / "de 9:00 a 17:00" / "9-17" / "9 a 17"
  // Acepta H, H:MM, H y media (no implementado), H pm
  const range = lowered.match(/(?:de\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:a|-|hasta)\s*(\d{1,2})(?::(\d{2}))?/);
  if (range) {
    let h1 = parseInt(range[1], 10);
    const m1 = range[2] ? parseInt(range[2], 10) : 0;
    let h2 = parseInt(range[3], 10);
    const m2 = range[4] ? parseInt(range[4], 10) : 0;
    // Si la hora final es menor que la inicial (ej "9 a 4"), asumimos PM
    // implícito: 4:30 → 16:30, 5 → 17, etc.
    if (h2 < h1 && h2 < 12) h2 += 12;
    if (h1 < 0 || h1 > 23 || h2 < 0 || h2 > 23) return null;
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
  // Necesitamos: hijo + actividad + días + horario
  const lowered = message.toLowerCase();

  const child = childrenNames.find(c => {
    const re = new RegExp('\\b' + c.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    return re.test(lowered);
  });
  if (!child) return null;

  const activity = ACTIVITY_KEYWORDS.find(a => a.pattern.test(lowered));
  if (!activity) return null;

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
