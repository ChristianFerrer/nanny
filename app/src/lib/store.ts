// State management — Supabase only (no demo fallbacks)

import type { Family, Parent, Child, FamilyEvent, Task, Message, Routine } from './types';
import { getSupabase } from './supabase';

// Track current family
let _currentFamilyId: string | null = null;
let _listeners: (() => void)[] = [];

function notify() {
  _listeners.forEach(fn => fn());
}

export function subscribe(fn: () => void) {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter(l => l !== fn); };
}

// Get family_id from the authenticated user's parent record
async function getFamilyId(): Promise<string> {
  if (_currentFamilyId) return _currentFamilyId;

  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: parent } = await supabase
      .from('parents')
      .select('family_id')
      .eq('auth_user_id', user.id)
      .limit(1)
      .single();
    if (parent) {
      _currentFamilyId = parent.family_id;
      return parent.family_id;
    }
  }

  throw new Error('No se encontró familia para el usuario');
}

// Check if the current authenticated user has a family
export async function hasFamily(): Promise<boolean> {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: parent } = await supabase
      .from('parents')
      .select('family_id')
      .eq('auth_user_id', user.id)
      .limit(1)
      .single();
    return !!parent;
  }
  return false;
}

// Reset cached family when user logs out or switches
export function resetFamilyCache() {
  _currentFamilyId = null;
}

export async function getFamily(): Promise<Family> {
  const familyId = await getFamilyId();
  const supabase = getSupabase();
  const { data } = await supabase.from('families').select('*').eq('id', familyId).single();
  return data as Family;
}

export async function getParents(): Promise<Parent[]> {
  const familyId = await getFamilyId();
  const supabase = getSupabase();
  const { data } = await supabase.from('parents').select('*').eq('family_id', familyId);
  return (data || []) as Parent[];
}

export async function getChildren(): Promise<Child[]> {
  const familyId = await getFamilyId();
  const supabase = getSupabase();
  const { data } = await supabase.from('children').select('*').eq('family_id', familyId);
  return (data || []) as Child[];
}

export async function getChild(id: string): Promise<Child | null> {
  const familyId = await getFamilyId();
  const supabase = getSupabase();
  const { data } = await supabase.from('children').select('*').eq('id', id).eq('family_id', familyId).single();
  return (data as Child) || null;
}

export async function getEvents(): Promise<FamilyEvent[]> {
  const familyId = await getFamilyId();
  const supabase = getSupabase();
  const { data } = await supabase.from('events').select('*')
    .eq('family_id', familyId)
    .order('date_start', { ascending: true });
  return (data || []) as FamilyEvent[];
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
  const familyId = await getFamilyId();
  const supabase = getSupabase();
  const { data } = await supabase.from('tasks').select('*')
    .eq('family_id', familyId)
    .in('status', ['pending', 'in_progress'])
    .order('due_date', { ascending: true });
  return (data || []) as Task[];
}

export async function completeTask(taskId: string): Promise<void> {
  const supabase = getSupabase();
  await supabase.from('tasks').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', taskId);
  notify();
}

export async function getMessages(): Promise<Message[]> {
  const familyId = await getFamilyId();
  const supabase = getSupabase();
  const { data } = await supabase.from('messages').select('*')
    .eq('family_id', familyId)
    .order('created_at', { ascending: true })
    .limit(100);
  return (data || []) as Message[];
}

export async function addMessage(msg: Omit<Message, 'id' | 'created_at'>): Promise<Message> {
  const supabase = getSupabase();
  const newMsg = {
    ...msg,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
  const { data } = await supabase.from('messages').insert(newMsg).select().single();
  notify();
  return (data || newMsg) as Message;
}

export async function addEvent(event: Omit<FamilyEvent, 'id' | 'created_at'>): Promise<FamilyEvent> {
  const supabase = getSupabase();
  const newEvent = {
    ...event,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
  const { data } = await supabase.from('events').insert(newEvent).select().single();
  notify();
  return (data || newEvent) as FamilyEvent;
}

export async function addTask(task: Omit<Task, 'id' | 'created_at'>): Promise<Task> {
  const supabase = getSupabase();
  const newTask = {
    ...task,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
  const { data } = await supabase.from('tasks').insert(newTask).select().single();
  notify();
  return (data || newTask) as Task;
}

export async function getRoutines(childId: string): Promise<Routine[]> {
  const supabase = getSupabase();
  const { data } = await supabase.from('routines').select('*').eq('child_id', childId);
  return (data || []) as Routine[];
}

export async function updateFamily(updates: Partial<Omit<Family, 'id' | 'created_at'>>): Promise<void> {
  const familyId = await getFamilyId();
  const supabase = getSupabase();
  await supabase.from('families').update(updates).eq('id', familyId);
  notify();
}

export async function updateParent(parentId: string, updates: Partial<Omit<Parent, 'id' | 'created_at'>>): Promise<void> {
  const supabase = getSupabase();
  await supabase.from('parents').update(updates).eq('id', parentId);
  notify();
}

export async function updateChild(childId: string, updates: Partial<Omit<Child, 'id' | 'created_at'>>): Promise<void> {
  const supabase = getSupabase();
  await supabase.from('children').update(updates).eq('id', childId);
  notify();
}

export async function addChild(child: Omit<Child, 'id' | 'created_at'>): Promise<Child> {
  const supabase = getSupabase();
  const newChild = { ...child, id: crypto.randomUUID(), created_at: new Date().toISOString() };
  const { data } = await supabase.from('children').insert(newChild).select().single();
  notify();
  return (data || newChild) as Child;
}

export async function deleteEvent(eventId: string): Promise<void> {
  const supabase = getSupabase();
  await supabase.from('events').delete().eq('id', eventId);
  notify();
}

export async function deleteTask(taskId: string): Promise<void> {
  const supabase = getSupabase();
  await supabase.from('tasks').delete().eq('id', taskId);
  notify();
}
