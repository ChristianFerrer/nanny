import type { Family, Parent, Child, FamilyEvent, Task, Message, Medication } from '../../src/lib/types';

/**
 * Datos fijos de una familia mock para tests E2E.
 *
 * Diseño:
 * - 1 familia "Test Family" con 2 padres y 2 hijos
 * - Sin eventos, tareas ni medicaciones iniciales (cada test crea lo que necesita)
 * - Mensajes vacíos por defecto (cada test puede settear mensajes específicos via mocks)
 *
 * IDs predecibles para que los tests puedan referenciarlos.
 */

export const FAMILY_ID = 'fam-test-001';
export const MAMA_ID = 'parent-mama-001';
export const PAPA_ID = 'parent-papa-001';
export const PAU_ID = 'child-pau-001';
export const MIA_ID = 'child-mia-001';
export const AUTH_USER_ID = 'auth-user-001';

const NOW = '2026-04-26T00:00:00.000Z';

export const mockFamily: Family = {
  id: FAMILY_ID,
  name: 'Familia Test',
  timezone: 'America/Argentina/Buenos_Aires',
  timezone_set_manually: false,
  created_at: NOW,
};

export const mockParents: Parent[] = [
  {
    id: MAMA_ID,
    family_id: FAMILY_ID,
    name: 'Mamá Test',
    role: 'mama',
    phone: null,
    email: 'test@nanny.test',
    avatar_emoji: '👩',
    auth_user_id: AUTH_USER_ID,
    created_at: NOW,
  },
  {
    id: PAPA_ID,
    family_id: FAMILY_ID,
    name: 'Papá Test',
    role: 'papa',
    phone: null,
    email: null,
    avatar_emoji: '👨',
    auth_user_id: null,
    created_at: NOW,
  },
];

export const mockChildren: Child[] = [
  {
    id: PAU_ID,
    family_id: FAMILY_ID,
    name: 'Pau',
    birth_date: '2021-03-15',
    emoji: '🧒',
    color: '#7C3AED',
    school: 'Colegio Test',
    teacher: null,
    grade: '1° Preescolar',
    allergies: [],
    medical_notes: null,
    personality_notes: null,
    created_at: NOW,
  },
  {
    id: MIA_ID,
    family_id: FAMILY_ID,
    name: 'Mía',
    birth_date: '2023-08-20',
    emoji: '👧',
    color: '#3B82F6',
    school: null,
    teacher: null,
    grade: null,
    allergies: [],
    medical_notes: null,
    personality_notes: null,
    created_at: NOW,
  },
];

export const mockEvents: FamilyEvent[] = [];
export const mockTasks: Task[] = [];
export const mockMedications: Medication[] = [];
export const mockMessages: Message[] = [];

/**
 * Devuelve los datos para el endpoint `/api/family-data` según las tablas pedidas.
 */
export function getFamilyDataResponse(tables: string[]): Record<string, unknown> {
  const lookup: Record<string, unknown> = {
    family: mockFamily,
    parents: mockParents,
    children: mockChildren,
    events: mockEvents,
    tasks: mockTasks,
    medications: mockMedications,
    messages: mockMessages,
  };
  const result: Record<string, unknown> = {};
  for (const t of tables) {
    if (t in lookup) result[t] = lookup[t];
  }
  return result;
}
