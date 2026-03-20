// State management — all data goes through API routes (admin client, bypasses RLS)

import type { Family, Parent, Child, FamilyEvent, Task, Message, Routine, Medication } from './types';

// Track current family and parent
let _currentFamilyId: string | null = null;
let _currentParentId: string | null = null;
let _listeners: (() => void)[] = [];

function notify() {
  _listeners.forEach(fn => fn());
}

export function subscribe(fn: () => void) {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter(l => l !== fn); };
}

// Fetch family data from server API (bypasses RLS)
async function fetchFamilyData(tables: string[]): Promise<Record<string, unknown>> {
  const res = await fetch(`/api/family-data?tables=${tables.join(',')}`);
  if (!res.ok) throw new Error('Failed to load family data');
  const data = await res.json();
  if (data.familyId) _currentFamilyId = data.familyId;
  if (data.currentParentId) _currentParentId = data.currentParentId;
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

// Reset cached family when user logs out or switches
export function resetFamilyCache() {
  _currentFamilyId = null;
  _currentParentId = null;
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
