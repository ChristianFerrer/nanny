// State management — all data goes through API routes (admin client, bypasses RLS)

import type { Family, Parent, Child, FamilyEvent, Task, Message, Routine, Medication, MedicationIntake, MedicationIntakeStatus } from './types';

// Track current family and parent
let _currentFamilyId: string | null = null;
let _currentParentId: string | null = null;
let _listeners: (() => void)[] = [];

// --- In-memory cache to avoid refetching on every page change ---
const _cache: Record<string, { data: unknown; ts: number }> = {};
const CACHE_TTL = 30_000; // 30 seconds — data stays fresh across tab switches

function getCached(key: string): unknown | null {
  const entry = _cache[key];
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}

function setCache(key: string, data: unknown) {
  _cache[key] = { data, ts: Date.now() };
}

function invalidateCache(table?: string) {
  if (table) {
    delete _cache[table];
  } else {
    Object.keys(_cache).forEach(k => delete _cache[k]);
  }
}

function notify() {
  _listeners.forEach(fn => fn());
}

export function subscribe(fn: () => void) {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter(l => l !== fn); };
}

// Tables that change too frequently to cache
const NO_CACHE_TABLES = new Set<string>();

// Fetch family data from server API (bypasses RLS)
async function fetchFamilyData(tables: string[]): Promise<Record<string, unknown>> {
  // Check cache for single-table requests (skip volatile tables)
  if (tables.length === 1 && !NO_CACHE_TABLES.has(tables[0])) {
    const cached = getCached(tables[0]);
    if (cached) return cached as Record<string, unknown>;
  }

  const res = await fetch(`/api/family-data?tables=${tables.join(',')}`);
  if (!res.ok) throw new Error('Failed to load family data');
  const data = await res.json();
  if (data.familyId) _currentFamilyId = data.familyId;
  if (data.currentParentId) _currentParentId = data.currentParentId;

  // Cache each table individually (except volatile ones)
  for (const table of tables) {
    if (!NO_CACHE_TABLES.has(table)) {
      setCache(table, data);
    }
  }
  return data;
}

// Write operation through server API (bypasses RLS)
async function writeData(table: string, operation: 'insert' | 'update' | 'delete', data?: Record<string, unknown>, id?: string) {
  const res = await fetch('/api/family-write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table, operation, data, id }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || 'Write failed');
  }
  // Invalidate cache for this table so next read fetches fresh data
  invalidateCache(table);
  return res.json();
}

async function getFamilyId(): Promise<string> {
  if (_currentFamilyId) return _currentFamilyId;
  const data = await fetchFamilyData(['family']);
  if (!data.familyId) throw new Error('No se encontró familia para el usuario');
  return data.familyId as string;
}

// Check if the current authenticated user has a family
export async function hasFamily(): Promise<boolean> {
  try {
    const res = await fetch('/api/check-family');
    if (res.ok) {
      const data = await res.json();
      return data.hasFamily;
    }
    return false;
  } catch {
    return false;
  }
}

// Get the current authenticated user's parent ID
export function getCurrentParentId(): string | null {
  return _currentParentId;
}

// Check if we already know the family (avoids redundant auth checks)
export function getCachedFamilyId(): string | null {
  return _currentFamilyId;
}

// Synchronous snapshot of cached data — used to initialize state without flash
export function getCachedSnapshot(): {
  family: Family | null;
  parents: Parent[];
  children: Child[];
  events: FamilyEvent[];
  tasks: Task[];
  medications: Medication[];
  messages: Message[];
  currentParentId: string | null;
} | null {
  if (!_currentFamilyId) return null;
  const fam = getCached('family') as Record<string, unknown> | null;
  const prts = getCached('parents') as Record<string, unknown> | null;
  const chld = getCached('children') as Record<string, unknown> | null;
  const evts = getCached('events') as Record<string, unknown> | null;
  const tsks = getCached('tasks') as Record<string, unknown> | null;
  const meds = getCached('medications') as Record<string, unknown> | null;
  const msgs = getCached('messages') as Record<string, unknown> | null;
  if (!fam) return null;
  return {
    family: (fam.family as Family) || null,
    parents: (prts?.parents as Parent[]) || [],
    children: (chld?.children as Child[]) || [],
    events: (evts?.events as FamilyEvent[]) || [],
    tasks: (tsks?.tasks as Task[]) || [],
    medications: (meds?.medications as Medication[]) || [],
    messages: (msgs?.messages as Message[]) || [],
    currentParentId: _currentParentId,
  };
}

// Reset cached family when user logs out or switches
export function resetFamilyCache() {
  _currentFamilyId = null;
  _currentParentId = null;
  invalidateCache();
}

export async function getFamily(): Promise<Family | null> {
  const data = await fetchFamilyData(['family']);
  return (data.family as Family) || null;
}

export async function getParents(): Promise<Parent[]> {
  const data = await fetchFamilyData(['parents']);
  return (data.parents as Parent[]) || [];
}

export async function getChildren(): Promise<Child[]> {
  const data = await fetchFamilyData(['children']);
  return (data.children as Child[]) || [];
}

export async function getChild(id: string): Promise<Child | null> {
  const children = await getChildren();
  return children.find(c => c.id === id) || null;
}

export async function getEvents(): Promise<FamilyEvent[]> {
  const data = await fetchFamilyData(['events']);
  return (data.events as FamilyEvent[]) || [];
}

export async function getTodayEvents(): Promise<FamilyEvent[]> {
  const events = await getEvents();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return events.filter(e => {
    const d = new Date(e.date_start);
    return d >= today && d < tomorrow;
  });
}

export async function getUpcomingEvents(days = 7): Promise<FamilyEvent[]> {
  const events = await getEvents();
  const now = new Date();
  const end = new Date();
  end.setDate(end.getDate() + days);
  return events.filter(e => {
    const d = new Date(e.date_start);
    return d >= now && d <= end;
  });
}

export async function getTasks(): Promise<Task[]> {
  const data = await fetchFamilyData(['tasks']);
  return (data.tasks as Task[]) || [];
}

export async function completeTask(taskId: string): Promise<void> {
  await writeData('tasks', 'update', { status: 'done', completed_at: new Date().toISOString() }, taskId);
  notify();
}

export async function uncompleteTask(taskId: string): Promise<void> {
  await writeData('tasks', 'update', { status: 'pending', completed_at: null }, taskId);
  notify();
}

export async function getMessages(): Promise<Message[]> {
  const data = await fetchFamilyData(['messages']);
  return (data.messages as Message[]) || [];
}

export async function getNewMessages(since: string): Promise<Message[]> {
  const res = await fetch(`/api/family-data?tables=messages&since=${encodeURIComponent(since)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.messages as Message[]) || [];
}

export async function addMessage(msg: Omit<Message, 'id' | 'created_at'>): Promise<Message> {
  const newMsg = {
    ...msg,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
  const result = await writeData('messages', 'insert', newMsg as unknown as Record<string, unknown>);
  notify();
  return (result.data || newMsg) as Message;
}

export async function addEvent(event: Omit<FamilyEvent, 'id' | 'created_at'>): Promise<FamilyEvent> {
  const newEvent = {
    ...event,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
  const result = await writeData('events', 'insert', newEvent as unknown as Record<string, unknown>);
  notify();
  return (result.data || newEvent) as FamilyEvent;
}

export async function addTask(task: Omit<Task, 'id' | 'created_at'>): Promise<Task> {
  const newTask = {
    ...task,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
  const result = await writeData('tasks', 'insert', newTask as unknown as Record<string, unknown>);
  notify();
  return (result.data || newTask) as Task;
}

export async function getMedications(): Promise<Medication[]> {
  const data = await fetchFamilyData(['medications']);
  return (data.medications as Medication[]) || [];
}

export async function addMedication(medication: Omit<Medication, 'id' | 'created_at'>): Promise<Medication> {
  const newMed = {
    ...medication,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
  const result = await writeData('medications', 'insert', newMed as unknown as Record<string, unknown>);
  notify();
  return (result.data || newMed) as Medication;
}

export async function updateMedication(medicationId: string, updates: Partial<Omit<Medication, 'id' | 'created_at'>>): Promise<void> {
  await writeData('medications', 'update', updates as Record<string, unknown>, medicationId);
  notify();
}

export async function getMedicationDetail(medicationId: string): Promise<{ medication: Medication; intakes: MedicationIntake[] } | null> {
  const res = await fetch(`/api/medication/${medicationId}`);
  if (!res.ok) return null;
  return res.json();
}

export async function upsertIntake(
  intake: { id?: string; medication_id: string; family_id: string; scheduled_at: string; status: MedicationIntakeStatus; taken_at?: string | null; recorded_by?: string | null; notes?: string | null }
): Promise<MedicationIntake> {
  const now = new Date().toISOString();
  if (intake.id) {
    await writeData('medication_intakes', 'update', { ...intake, updated_at: now } as unknown as Record<string, unknown>, intake.id);
    notify();
    return { ...intake, created_at: now, updated_at: now } as MedicationIntake;
  }
  const newIntake = {
    ...intake,
    id: crypto.randomUUID(),
    taken_at: intake.taken_at ?? null,
    recorded_by: intake.recorded_by ?? null,
    notes: intake.notes ?? null,
    created_at: now,
    updated_at: now,
  };
  const result = await writeData('medication_intakes', 'insert', newIntake as unknown as Record<string, unknown>);
  notify();
  return (result.data || newIntake) as MedicationIntake;
}

export async function getRoutines(childId: string): Promise<Routine[]> {
  const children = await getChildren();
  const child = children.find(c => c.id === childId);
  if (!child) return [];
  // TODO: add routines to family-data endpoint if needed
  return [];
}

export async function updateFamily(updates: Partial<Omit<Family, 'id' | 'created_at'>>): Promise<void> {
  const familyId = await getFamilyId();
  await writeData('families', 'update', updates as Record<string, unknown>, familyId);
  notify();
}

export async function updateParent(parentId: string, updates: Partial<Omit<Parent, 'id' | 'created_at'>>): Promise<void> {
  await writeData('parents', 'update', updates as Record<string, unknown>, parentId);
  notify();
}

export async function updateChild(childId: string, updates: Partial<Omit<Child, 'id' | 'created_at'>>): Promise<void> {
  await writeData('children', 'update', updates as Record<string, unknown>, childId);
  notify();
}

export async function addChild(child: Omit<Child, 'id' | 'created_at'>): Promise<Child> {
  const newChild = { ...child, id: crypto.randomUUID(), created_at: new Date().toISOString() };
  const result = await writeData('children', 'insert', newChild as unknown as Record<string, unknown>);
  notify();
  return (result.data || newChild) as Child;
}

export async function deleteEvent(eventId: string): Promise<void> {
  await writeData('events', 'delete', undefined, eventId);
  notify();
}

export async function deleteTask(taskId: string): Promise<void> {
  await writeData('tasks', 'delete', undefined, taskId);
  notify();
}

export async function deleteChild(childId: string): Promise<void> {
  await writeData('children', 'delete', undefined, childId);
  notify();
}
