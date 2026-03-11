// State management — connects to Supabase, falls back to local demo data

import type { Family, Parent, Child, FamilyEvent, Task, Message, Routine } from './types';
import {
  demoFamily, demoParents, demoChildren, demoEvents,
  demoTasks, demoMessages, demoRoutines,
  DEMO_FAMILY_ID, DEMO_MAMA_ID, DEMO_PAPA_ID,
} from './demo-data';

const isSupabaseConfigured = () => {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
};

// Track Supabase status and current family
let _supabaseWorking: boolean | null = null;
let _currentFamilyId: string | null = null;

async function trySupabase(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  if (_supabaseWorking !== null) return _supabaseWorking;
  try {
    const { getSupabase } = await import('./supabase');
    const supabase = getSupabase();
    const { error } = await supabase.from('families').select('id').limit(1);
    _supabaseWorking = !error;
    return _supabaseWorking;
  } catch {
    _supabaseWorking = false;
    return false;
  }
}

// Get family_id from the authenticated user's parent record
async function getFamilyId(): Promise<string> {
  if (_currentFamilyId) return _currentFamilyId;
  if (await trySupabase()) {
    const { getSupabase } = await import('./supabase');
    const supabase = getSupabase();

    // First try to get family via authenticated user
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

    // Fallback: first family in DB (for backwards compat)
    const { data } = await supabase.from('families').select('id').limit(1).single();
    if (data) {
      _currentFamilyId = data.id;
      return data.id;
    }
  }
  return DEMO_FAMILY_ID;
}

// Check if the current authenticated user has a family
export async function hasFamily(): Promise<boolean> {
  if (!(await trySupabase())) return false;
  const { getSupabase } = await import('./supabase');
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
  _supabaseWorking = null;
}

// In-memory store for demo mode
let _messages = [...demoMessages];
let _events = [...demoEvents];
let _tasks = [...demoTasks];
let _listeners: (() => void)[] = [];

function notify() {
  _listeners.forEach(fn => fn());
}

export function subscribe(fn: () => void) {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter(l => l !== fn); };
}

export async function getFamily(): Promise<Family> {
  if (await trySupabase()) {
    const familyId = await getFamilyId();
    const { getSupabase } = await import('./supabase');
    const supabase = getSupabase();
    const { data } = await supabase.from('families').select('*').eq('id', familyId).single();
    if (data) return data as Family;
  }
  return demoFamily;
}

export async function getParents(): Promise<Parent[]> {
  const familyId = await getFamilyId();
  if (await trySupabase()) {
    const { getSupabase } = await import('./supabase');
    const supabase = getSupabase();
    const { data } = await supabase.from('parents').select('*').eq('family_id', familyId);
    if (data?.length) return data as Parent[];
  }
  return demoParents;
}

export async function getChildren(): Promise<Child[]> {
  const familyId = await getFamilyId();
  if (await trySupabase()) {
    const { getSupabase } = await import('./supabase');
    const supabase = getSupabase();
    const { data } = await supabase.from('children').select('*').eq('family_id', familyId);
    if (data?.length) return data as Child[];
  }
  return demoChildren;
}

export async function getChild(id: string): Promise<Child | null> {
  if (await trySupabase()) {
    const familyId = await getFamilyId();
    const { getSupabase } = await import('./supabase');
    const supabase = getSupabase();
    const { data } = await supabase.from('children').select('*').eq('id', id).eq('family_id', familyId).single();
    if (data) return data as Child;
  }
  return demoChildren.find(c => c.id === id) || null;
}

export async function getEvents(): Promise<FamilyEvent[]> {
  const familyId = await getFamilyId();
  if (await trySupabase()) {
    const { getSupabase } = await import('./supabase');
    const supabase = getSupabase();
    const { data } = await supabase.from('events').select('*')
      .eq('family_id', familyId)
      .order('date_start', { ascending: true });
    if (data) return data as FamilyEvent[];
  }
  return _events.sort((a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime());
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
  if (await trySupabase()) {
    const { getSupabase } = await import('./supabase');
    const supabase = getSupabase();
    const { data } = await supabase.from('tasks').select('*')
      .eq('family_id', familyId)
      .in('status', ['pending', 'in_progress'])
      .order('due_date', { ascending: true });
    if (data) return data as Task[];
  }
  return _tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
}

export async function completeTask(taskId: string): Promise<void> {
  if (await trySupabase()) {
    const { getSupabase } = await import('./supabase');
    const supabase = getSupabase();
    await supabase.from('tasks').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', taskId);
  }
  _tasks = _tasks.map(t => t.id === taskId ? { ...t, status: 'done' as const, completed_at: new Date().toISOString() } : t);
  notify();
}

export async function getMessages(): Promise<Message[]> {
  const familyId = await getFamilyId();
  if (await trySupabase()) {
    const { getSupabase } = await import('./supabase');
    const supabase = getSupabase();
    const { data } = await supabase.from('messages').select('*')
      .eq('family_id', familyId)
      .order('created_at', { ascending: true })
      .limit(100);
    if (data) return data as Message[];
  }
  return _messages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export async function addMessage(msg: Omit<Message, 'id' | 'created_at'>): Promise<Message> {
  const newMsg: Message = {
    ...msg,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
  if (await trySupabase()) {
    try {
      const { getSupabase } = await import('./supabase');
    const supabase = getSupabase();
      const { data } = await supabase.from('messages').insert(newMsg).select().single();
      if (data) { notify(); return data as Message; }
    } catch {
      // Fall through to local store
    }
  }
  _messages.push(newMsg);
  notify();
  return newMsg;
}

export async function addEvent(event: Omit<FamilyEvent, 'id' | 'created_at'>): Promise<FamilyEvent> {
  const newEvent: FamilyEvent = {
    ...event,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
  if (await trySupabase()) {
    try {
      const { getSupabase } = await import('./supabase');
    const supabase = getSupabase();
      const { data } = await supabase.from('events').insert(newEvent).select().single();
      if (data) { notify(); return data as FamilyEvent; }
    } catch {
      // Fall through to local store
    }
  }
  _events.push(newEvent);
  notify();
  return newEvent;
}

export async function addTask(task: Omit<Task, 'id' | 'created_at'>): Promise<Task> {
  const newTask: Task = {
    ...task,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
  if (await trySupabase()) {
    try {
      const { getSupabase } = await import('./supabase');
    const supabase = getSupabase();
      const { data } = await supabase.from('tasks').insert(newTask).select().single();
      if (data) { notify(); return data as Task; }
    } catch {
      // Fall through to local store
    }
  }
  _tasks.push(newTask);
  notify();
  return newTask;
}

export async function getRoutines(childId: string): Promise<Routine[]> {
  if (await trySupabase()) {
    const { getSupabase } = await import('./supabase');
    const supabase = getSupabase();
    const { data } = await supabase.from('routines').select('*').eq('child_id', childId);
    if (data) return data as Routine[];
  }
  return demoRoutines.filter(r => r.child_id === childId);
}

export async function updateFamily(updates: Partial<Omit<Family, 'id' | 'created_at'>>): Promise<void> {
  const familyId = await getFamilyId();
  if (await trySupabase()) {
    const { getSupabase } = await import('./supabase');
    const supabase = getSupabase();
    await supabase.from('families').update(updates).eq('id', familyId);
  }
  notify();
}

export async function updateParent(parentId: string, updates: Partial<Omit<Parent, 'id' | 'created_at'>>): Promise<void> {
  if (await trySupabase()) {
    const { getSupabase } = await import('./supabase');
    const supabase = getSupabase();
    await supabase.from('parents').update(updates).eq('id', parentId);
  }
  notify();
}

export async function updateChild(childId: string, updates: Partial<Omit<Child, 'id' | 'created_at'>>): Promise<void> {
  if (await trySupabase()) {
    const { getSupabase } = await import('./supabase');
    const supabase = getSupabase();
    await supabase.from('children').update(updates).eq('id', childId);
  }
  notify();
}

export async function addChild(child: Omit<Child, 'id' | 'created_at'>): Promise<Child> {
  const newChild: Child = { ...child, id: crypto.randomUUID(), created_at: new Date().toISOString() };
  if (await trySupabase()) {
    const { getSupabase } = await import('./supabase');
    const supabase = getSupabase();
    const { data } = await supabase.from('children').insert(newChild).select().single();
    if (data) { notify(); return data as Child; }
  }
  notify();
  return newChild;
}

export async function deleteEvent(eventId: string): Promise<void> {
  if (await trySupabase()) {
    const { getSupabase } = await import('./supabase');
    const supabase = getSupabase();
    await supabase.from('events').delete().eq('id', eventId);
  }
  _events = _events.filter(e => e.id !== eventId);
  notify();
}

export async function deleteTask(taskId: string): Promise<void> {
  if (await trySupabase()) {
    const { getSupabase } = await import('./supabase');
    const supabase = getSupabase();
    await supabase.from('tasks').delete().eq('id', taskId);
  }
  _tasks = _tasks.filter(t => t.id !== taskId);
  notify();
}

export function getParentById(id: string): Parent | undefined {
  return demoParents.find(p => p.id === id);
}

export function getChildById(id: string): Child | undefined {
  return demoChildren.find(c => c.id === id);
}

export { DEMO_FAMILY_ID, DEMO_MAMA_ID, DEMO_PAPA_ID };
