// Demo data for when Supabase is not connected
// Uses the same IDs as the seed data in supabase-schema.sql

import type { Family, Parent, Child, FamilyEvent, Task, Message, Routine } from './types';

const FAMILY_ID = '00000000-0000-0000-0000-000000000001';
const MAMA_ID = '00000000-0000-0000-0000-000000000010';
const PAPA_ID = '00000000-0000-0000-0000-000000000011';
const PAU_ID = '00000000-0000-0000-0000-000000000020';
const MIA_ID = '00000000-0000-0000-0000-000000000021';

export const DEMO_FAMILY_ID = FAMILY_ID;
export const DEMO_MAMA_ID = MAMA_ID;
export const DEMO_PAPA_ID = PAPA_ID;

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function todayAt(hour: number, min = 0): string {
  const d = new Date();
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
}

export const demoFamily: Family = {
  id: FAMILY_ID,
  name: 'Familia Demo',
  timezone: 'America/Argentina/Buenos_Aires',
  created_at: new Date().toISOString(),
};

export const demoParents: Parent[] = [
  {
    id: MAMA_ID, family_id: FAMILY_ID, name: 'Mamá', role: 'mama',
    phone: null, email: null, avatar_emoji: '👩', auth_user_id: null,
    created_at: new Date().toISOString(),
  },
  {
    id: PAPA_ID, family_id: FAMILY_ID, name: 'Papá', role: 'papa',
    phone: null, email: null, avatar_emoji: '👨', auth_user_id: null,
    created_at: new Date().toISOString(),
  },
];

export const demoChildren: Child[] = [
  {
    id: PAU_ID, family_id: FAMILY_ID, name: 'Pau', birth_date: '2021-03-15',
    emoji: '🧒', color: null, school: 'Colegio San José', teacher: 'Miss Ana',
    grade: '1° Preescolar', allergies: ['Cacahuate'], medical_notes: 'Alergia leve al cacahuate',
    personality_notes: 'Muy sociable, le gusta dibujar', created_at: new Date().toISOString(),
  },
  {
    id: MIA_ID, family_id: FAMILY_ID, name: 'Mía', birth_date: '2023-08-20',
    emoji: '👧', color: null, school: null, teacher: null, grade: null, allergies: [],
    medical_notes: null, personality_notes: 'Muy curiosa, empezando a hablar',
    created_at: new Date().toISOString(),
  },
];

export const demoEvents: FamilyEvent[] = [
  {
    id: 'evt-1', family_id: FAMILY_ID, child_id: PAU_ID,
    title: 'Cita pediatra - revisión anual', description: null,
    event_type: 'doctor', date_start: daysFromNow(2), date_end: null,
    location: 'Dr. Rodríguez, Consultorio 305', status: 'confirmed',
    source: 'chat', auto_detected: true, created_by: MAMA_ID,
    created_at: new Date().toISOString(),
  },
  {
    id: 'evt-2', family_id: FAMILY_ID, child_id: PAU_ID,
    title: 'Festival del colegio', description: 'Llevar disfraz de animal',
    event_type: 'school', date_start: daysFromNow(5), date_end: null,
    location: 'Colegio San José', status: 'confirmed',
    source: 'chat', auto_detected: true, created_by: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'evt-3', family_id: FAMILY_ID, child_id: null,
    title: 'Cumpleaños abuela', description: null,
    event_type: 'birthday', date_start: daysFromNow(8), date_end: null,
    location: 'Casa de la abuela', status: 'confirmed',
    source: 'manual', auto_detected: false, created_by: PAPA_ID,
    created_at: new Date().toISOString(),
  },
  {
    id: 'evt-4', family_id: FAMILY_ID, child_id: PAU_ID,
    title: 'Clase de natación', description: null,
    event_type: 'activity', date_start: todayAt(16, 0), date_end: todayAt(17, 0),
    location: 'Club Deportivo', status: 'confirmed',
    source: 'chat', auto_detected: true, created_by: MAMA_ID,
    created_at: new Date().toISOString(),
  },
  {
    id: 'evt-5', family_id: FAMILY_ID, child_id: MIA_ID,
    title: 'Vacunas 18 meses', description: null,
    event_type: 'doctor', date_start: daysFromNow(1), date_end: null,
    location: 'Centro de Salud', status: 'confirmed',
    source: 'chat', auto_detected: true, created_by: MAMA_ID,
    created_at: new Date().toISOString(),
  },
];

export const demoTasks: Task[] = [
  {
    id: 'task-1', family_id: FAMILY_ID, child_id: PAU_ID,
    title: 'Comprar uniforme nuevo', description: 'Talla 6, el anterior ya le queda chico',
    assigned_to: MAMA_ID, due_date: daysFromNow(3), status: 'pending',
    priority: 'normal', source: 'chat', auto_detected: true, created_by: null,
    completed_at: null, created_at: new Date().toISOString(),
  },
  {
    id: 'task-2', family_id: FAMILY_ID, child_id: PAU_ID,
    title: 'Llevar documentos al colegio', description: 'Constancia de salud actualizada',
    assigned_to: PAPA_ID, due_date: daysFromNow(1), status: 'pending',
    priority: 'high', source: 'chat', auto_detected: true, created_by: null,
    completed_at: null, created_at: new Date().toISOString(),
  },
  {
    id: 'task-3', family_id: FAMILY_ID, child_id: MIA_ID,
    title: 'Agendar vacunas Mía', description: 'Vacunas de los 18 meses',
    assigned_to: MAMA_ID, due_date: daysFromNow(7), status: 'pending',
    priority: 'high', source: 'chat', auto_detected: true, created_by: null,
    completed_at: null, created_at: new Date().toISOString(),
  },
  {
    id: 'task-4', family_id: FAMILY_ID, child_id: null,
    title: 'Comprar regalo abuela', description: 'Para su cumpleaños',
    assigned_to: PAPA_ID, due_date: daysFromNow(7), status: 'pending',
    priority: 'normal', source: 'chat', auto_detected: true, created_by: MAMA_ID,
    completed_at: null, created_at: new Date().toISOString(),
  },
];

export const demoRoutines: Routine[] = [
  { id: 'r-1', child_id: PAU_ID, type: 'morning', name: 'Despertar y desayuno', description: null, days_of_week: [1,2,3,4,5], time_start: '07:00', time_end: '08:00', active: true, created_at: '' },
  { id: 'r-2', child_id: PAU_ID, type: 'morning', name: 'Ir al colegio', description: null, days_of_week: [1,2,3,4,5], time_start: '08:00', time_end: '08:30', active: true, created_at: '' },
  { id: 'r-3', child_id: PAU_ID, type: 'afternoon', name: 'Recoger del colegio', description: null, days_of_week: [1,2,3,4,5], time_start: '14:00', time_end: '14:30', active: true, created_at: '' },
  { id: 'r-4', child_id: PAU_ID, type: 'night', name: 'Baño y cena', description: null, days_of_week: [1,2,3,4,5,6,0], time_start: '19:00', time_end: '20:00', active: true, created_at: '' },
  { id: 'r-5', child_id: PAU_ID, type: 'night', name: 'Cuento y dormir', description: null, days_of_week: [1,2,3,4,5,6,0], time_start: '20:00', time_end: '20:30', active: true, created_at: '' },
];

export const demoMessages: Message[] = [
  {
    id: 'msg-1', family_id: FAMILY_ID, sender_id: MAMA_ID, sender_type: 'parent',
    content: 'Pau tiene cita con el pediatra el jueves', message_type: 'text',
    metadata: {}, created_at: new Date(Date.now() - 3600000 * 3).toISOString(),
  },
  {
    id: 'msg-2', family_id: FAMILY_ID, sender_id: null, sender_type: 'nanny',
    content: '📅 Entendido! Agendé la cita con el pediatra para Pau este jueves. ¿A qué hora es y en qué consultorio?',
    message_type: 'confirmation', metadata: { intent: 'EVENT', child: 'Pau' },
    created_at: new Date(Date.now() - 3600000 * 3 + 5000).toISOString(),
  },
  {
    id: 'msg-3', family_id: FAMILY_ID, sender_id: MAMA_ID, sender_type: 'parent',
    content: 'A las 10am con el Dr. Rodríguez, consultorio 305', message_type: 'text',
    metadata: {}, created_at: new Date(Date.now() - 3600000 * 2.5).toISOString(),
  },
  {
    id: 'msg-4', family_id: FAMILY_ID, sender_id: null, sender_type: 'nanny',
    content: '✅ Perfecto, actualicé la cita:\n\n🧒 Pau - Pediatra\n📅 Jueves 10:00 AM\n📍 Dr. Rodríguez, Consultorio 305\n\n¿Quién lo lleva?',
    message_type: 'confirmation', metadata: { intent: 'EVENT', child: 'Pau' },
    created_at: new Date(Date.now() - 3600000 * 2.5 + 5000).toISOString(),
  },
  {
    id: 'msg-5', family_id: FAMILY_ID, sender_id: PAPA_ID, sender_type: 'parent',
    content: 'Yo lo llevo', message_type: 'text',
    metadata: {}, created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: 'msg-6', family_id: FAMILY_ID, sender_id: null, sender_type: 'nanny',
    content: '👨 Listo, Papá lleva a Pau al pediatra el jueves. Les recuerdo el miércoles en la noche.',
    message_type: 'text', metadata: { intent: 'TASK', child: 'Pau' },
    created_at: new Date(Date.now() - 3600000 * 2 + 5000).toISOString(),
  },
  {
    id: 'msg-7', family_id: FAMILY_ID, sender_id: MAMA_ID, sender_type: 'parent',
    content: 'Ah y hay que comprarle uniforme nuevo a Pau, ya le queda chico el que tiene. Talla 6.',
    message_type: 'text', metadata: {},
    created_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'msg-8', family_id: FAMILY_ID, sender_id: null, sender_type: 'nanny',
    content: '🛍️ Anoté: Comprar uniforme nuevo para Pau (talla 6). ¿Quién se encarga? ¿Para cuándo lo necesitan?',
    message_type: 'text', metadata: { intent: 'TASK', child: 'Pau' },
    created_at: new Date(Date.now() - 3600000 + 5000).toISOString(),
  },
];
