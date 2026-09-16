/**
 * Profile notes and todos: Supabase when configured and tables exist, else localStorage per user.
 * All functions require userId (from useAuth().user?.uid).
 * If Supabase is configured but profile_notes/profile_todos tables are missing (e.g. migration not run),
 * we fall back to localStorage for the session so the app keeps working.
 */
import { supabase, hasSupabase } from '../lib/supabase';
import { logAction, buildAgentMeta } from './auditLogBackend';

const NOTES_STORAGE_KEY = (uid) => `orch_profile_notes_${uid}`;
const TODOS_STORAGE_KEY = (uid) => `orch_profile_todos_${uid}`;

function isTableMissingError(error) {
  const msg = (error?.message || '').toLowerCase();
  // Only match actual table/relation missing errors, NOT column-level errors
  if (msg.includes('column') || msg.includes('archived')) return false;
  return (
    msg.includes('profile_notes') ||
    msg.includes('profile_todos') ||
    msg.includes('schema cache') ||
    msg.includes('does not exist') ||
    msg.includes('relation')
  );
}

function isColumnMissingError(error) {
  const msg = (error?.message || '').toLowerCase();
  return msg.includes('column') || (msg.includes('archived') && msg.includes('does not exist'));
}

let useLocalStorageForProfile = false;

function shouldUseSupabaseForProfile() {
  return hasSupabase() && !useLocalStorageForProfile;
}

// Reset the localStorage fallback flag (e.g. after page reload or if it was erroneously set)
export function resetProfileStorageFlag() {
  useLocalStorageForProfile = false;
}

function loadNotesFromLocal(userId) {
  try {
    const raw = localStorage.getItem(NOTES_STORAGE_KEY(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadTodosFromLocal(userId) {
  try {
    const raw = localStorage.getItem(TODOS_STORAGE_KEY(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ---------- Notes ----------

export async function loadNotes(userId) {
  if (!userId) return [];
  if (shouldUseSupabaseForProfile()) {
    // Try to select archived column, but if it doesn't exist, fall back to basic select
    let result = await supabase
      .from('profile_notes')
      .select('id, text, created_at, archived')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    // If archived column doesn't exist, try without it (column error, NOT table error)
    if (
      result.error &&
      (isColumnMissingError(result.error) ||
        result.error.message?.includes('archived') ||
        result.error.message?.includes('column'))
    ) {
      console.warn(
        '[profileDataBackend] archived column not found on profile_notes, retrying without it'
      );
      result = await supabase
        .from('profile_notes')
        .select('id, text, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
    }

    if (result.error) {
      if (isTableMissingError(result.error)) {
        useLocalStorageForProfile = true;
        return loadNotesFromLocal(userId);
      }
      console.error('[profileDataBackend] loadNotes error:', result.error);
      throw result.error;
    }
    return (result.data || [])
      .filter((r) => r.archived !== true) // Only filter out if explicitly archived=true, so existing data without archived field still shows
      .map((r) => ({
        id: r.id,
        text: r.text ?? '',
        createdAt: r.created_at,
        archived: !!r.archived,
      }));
  }
  return loadNotesFromLocal(userId).filter((n) => n.archived !== true);
}

export async function addNote(userId, text, agentContext = null) {
  if (!userId) throw new Error('User required');
  if (shouldUseSupabaseForProfile()) {
    // Try with archived column first, then without if column doesn't exist
    let result = await supabase
      .from('profile_notes')
      .insert({ user_id: userId, text: text.trim(), archived: false })
      .select('id, text, created_at, archived')
      .single();
    if (
      result.error &&
      (isColumnMissingError(result.error) || result.error.message?.includes('archived'))
    ) {
      console.warn(
        '[profileDataBackend] archived column not found on profile_notes, inserting without it'
      );
      result = await supabase
        .from('profile_notes')
        .insert({ user_id: userId, text: text.trim() })
        .select('id, text, created_at')
        .single();
    }
    const { data, error } = result;
    if (error) {
      if (isTableMissingError(error)) {
        useLocalStorageForProfile = true;
        return addNote(userId, text, agentContext);
      }
      throw error;
    }
    await logAction({
      action: 'Note created',
      entity: 'Profile',
      entityId: data.id,
      details: (data.text || '').slice(0, 80),
      meta: {
        source: 'profileDataBackend',
        importance: 'low',
        tags: ['create', 'profile', 'note'],
        ...buildAgentMeta(agentContext),
        codeAfter: JSON.stringify({ id: data.id, text: data.text || '' }, null, 2),
      },
    });
    return { id: data.id, text: data.text, createdAt: data.created_at, archived: false };
  }
  const note = {
    id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    text: text.trim(),
    createdAt: new Date().toISOString(),
    archived: false,
  };
  const list = loadNotesFromLocal(userId);
  list.unshift(note);
  localStorage.setItem(NOTES_STORAGE_KEY(userId), JSON.stringify(list));
  return note;
}

export async function updateNote(userId, noteId, text, agentContext = null) {
  if (!userId) throw new Error('User required');
  const value = text === undefined ? undefined : String(text).trim();
  if (shouldUseSupabaseForProfile()) {
    const { error } = await supabase
      .from('profile_notes')
      .update({ text: value ?? '' })
      .eq('id', noteId)
      .eq('user_id', userId);
    if (error) {
      if (isTableMissingError(error)) {
        useLocalStorageForProfile = true;
        return updateNote(userId, noteId, text, agentContext);
      }
      throw error;
    }
    await logAction({
      action: 'Note updated',
      entity: 'Profile',
      entityId: noteId,
      details: value ?? null,
      meta: {
        source: 'profileDataBackend',
        importance: 'low',
        tags: ['update', 'profile', 'note'],
        ...buildAgentMeta(agentContext),
        codeAfter: JSON.stringify({ id: noteId, text: value ?? '' }, null, 2),
      },
    });
    return;
  }
  const list = loadNotesFromLocal(userId);
  const idx = list.findIndex((n) => n.id === noteId);
  if (idx === -1) return;
  list[idx] = { ...list[idx], text: value ?? list[idx].text };
  localStorage.setItem(NOTES_STORAGE_KEY(userId), JSON.stringify(list));
}

export async function archiveNote(userId, noteId, agentContext = null) {
  if (!userId) throw new Error('User required');
  if (shouldUseSupabaseForProfile()) {
    const { error } = await supabase
      .from('profile_notes')
      .update({ archived: true })
      .eq('id', noteId)
      .eq('user_id', userId);
    if (error) {
      if (isTableMissingError(error)) {
        useLocalStorageForProfile = true;
        return archiveNote(userId, noteId, agentContext);
      }
      // If archived column doesn't exist, warn but do NOT switch to localStorage for all operations
      if (isColumnMissingError(error) || error.message?.includes('archived')) {
        console.warn(
          '[profileDataBackend] Cannot archive note: archived column does not exist in Supabase. Add it with: ALTER TABLE profile_notes ADD COLUMN archived boolean DEFAULT false;'
        );
        return;
      }
      throw error;
    }
    await logAction({
      action: 'Note archived',
      entity: 'Profile',
      entityId: noteId,
      details: null,
      meta: buildAgentMeta(agentContext),
    });
    return;
  }
  const list = loadNotesFromLocal(userId);
  const idx = list.findIndex((n) => n.id === noteId);
  if (idx === -1) return;
  list[idx] = { ...list[idx], archived: true };
  localStorage.setItem(NOTES_STORAGE_KEY(userId), JSON.stringify(list));
}

export async function unarchiveNote(userId, noteId, agentContext = null) {
  if (!userId) throw new Error('User required');
  if (shouldUseSupabaseForProfile()) {
    const { error } = await supabase
      .from('profile_notes')
      .update({ archived: false })
      .eq('id', noteId)
      .eq('user_id', userId);
    if (error) {
      if (isTableMissingError(error)) {
        useLocalStorageForProfile = true;
        return unarchiveNote(userId, noteId, agentContext);
      }
      if (isColumnMissingError(error) || error.message?.includes('archived')) {
        console.warn(
          '[profileDataBackend] Cannot unarchive note: archived column does not exist in Supabase.'
        );
        return;
      }
      throw error;
    }
    await logAction({
      action: 'Note unarchived',
      entity: 'Profile',
      entityId: noteId,
      details: null,
      meta: buildAgentMeta(agentContext),
    });
    return;
  }
  const list = loadNotesFromLocal(userId);
  const idx = list.findIndex((n) => n.id === noteId);
  if (idx === -1) return;
  list[idx] = { ...list[idx], archived: false };
  localStorage.setItem(NOTES_STORAGE_KEY(userId), JSON.stringify(list));
}

export async function loadArchivedNotes(userId) {
  if (!userId) return [];
  if (shouldUseSupabaseForProfile()) {
    const { data, error } = await supabase
      .from('profile_notes')
      .select('id, text, created_at, archived')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) {
      if (isTableMissingError(error)) {
        useLocalStorageForProfile = true;
        return loadArchivedNotes(userId);
      }
      if (isColumnMissingError(error) || error.message?.includes('archived')) {
        console.warn('[profileDataBackend] archived column not found, no archived notes to return');
        return [];
      }
      throw error;
    }
    return (data || [])
      .filter((r) => r.archived)
      .map((r) => ({
        id: r.id,
        text: r.text ?? '',
        createdAt: r.created_at,
        archived: true,
        status: 'Archived',
      }));
  }
  return loadNotesFromLocal(userId)
    .filter((n) => n.archived)
    .map((n) => ({ ...n, status: 'Archived' }));
}

export async function deleteNote(userId, noteId, agentContext = null) {
  if (!userId) throw new Error('User required');
  if (shouldUseSupabaseForProfile()) {
    const { error } = await supabase
      .from('profile_notes')
      .delete()
      .eq('id', noteId)
      .eq('user_id', userId);
    if (error) {
      if (isTableMissingError(error)) {
        useLocalStorageForProfile = true;
        return deleteNote(userId, noteId, agentContext);
      }
      throw error;
    }
    await logAction({
      action: 'Note deleted',
      entity: 'Profile',
      entityId: noteId,
      details: null,
      meta: buildAgentMeta(agentContext),
    });
    return;
  }
  const list = loadNotesFromLocal(userId).filter((n) => n.id !== noteId);
  localStorage.setItem(NOTES_STORAGE_KEY(userId), JSON.stringify(list));
}

// ---------- Todos ----------

export async function loadTodos(userId) {
  if (!userId) return [];
  if (shouldUseSupabaseForProfile()) {
    // Try to select archived column, but if it doesn't exist, fall back to basic select
    let result = await supabase
      .from('profile_todos')
      .select('id, text, done, created_at, archived')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    // If archived column doesn't exist, try without it (column error, NOT table error)
    if (
      result.error &&
      (isColumnMissingError(result.error) ||
        result.error.message?.includes('archived') ||
        result.error.message?.includes('column'))
    ) {
      console.warn(
        '[profileDataBackend] archived column not found on profile_todos, retrying without it'
      );
      result = await supabase
        .from('profile_todos')
        .select('id, text, done, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
    }

    if (result.error) {
      if (isTableMissingError(result.error)) {
        useLocalStorageForProfile = true;
        return loadTodosFromLocal(userId);
      }
      console.error('[profileDataBackend] loadTodos error:', result.error);
      throw result.error;
    }
    return (result.data || [])
      .filter((r) => r.archived !== true) // Only filter out if explicitly archived=true, so existing data without archived field still shows
      .map((r) => ({
        id: r.id,
        text: r.text ?? '',
        done: !!r.done,
        createdAt: r.created_at,
        archived: !!r.archived,
      }));
  }
  return loadTodosFromLocal(userId).filter((t) => t.archived !== true);
}

export async function addTodo(userId, text, done = false, agentContext = null) {
  if (!userId) throw new Error('User required');
  if (shouldUseSupabaseForProfile()) {
    // Try with archived column first, then without if column doesn't exist
    let result = await supabase
      .from('profile_todos')
      .insert({ user_id: userId, text: text.trim(), done, archived: false })
      .select('id, text, done, created_at, archived')
      .single();
    if (
      result.error &&
      (isColumnMissingError(result.error) || result.error.message?.includes('archived'))
    ) {
      console.warn(
        '[profileDataBackend] archived column not found on profile_todos, inserting without it'
      );
      result = await supabase
        .from('profile_todos')
        .insert({ user_id: userId, text: text.trim(), done })
        .select('id, text, done, created_at')
        .single();
    }
    const { data, error } = result;
    if (error) {
      if (isTableMissingError(error)) {
        useLocalStorageForProfile = true;
        return addTodo(userId, text, done, agentContext);
      }
      throw error;
    }
    await logAction({
      action: 'Task created',
      entity: 'Profile',
      entityId: data.id,
      details: (data.text || '').slice(0, 80),
      meta: {
        source: 'profileDataBackend',
        ...buildAgentMeta(agentContext),
        importance: 'low',
        tags: ['create', 'profile', 'task'],
        codeAfter: JSON.stringify(
          { id: data.id, text: data.text || '', done: !!data.done },
          null,
          2
        ),
      },
    });
    return {
      id: data.id,
      text: data.text,
      done: !!data.done,
      createdAt: data.created_at,
      archived: false,
    };
  }
  const todo = {
    id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    text: text.trim(),
    done,
    createdAt: new Date().toISOString(),
    archived: false,
  };
  const list = loadTodosFromLocal(userId);
  list.unshift(todo);
  localStorage.setItem(TODOS_STORAGE_KEY(userId), JSON.stringify(list));
  return todo;
}

export async function updateTodo(userId, todoId, { text, done }, agentContext = null) {
  if (!userId) throw new Error('User required');
  if (shouldUseSupabaseForProfile()) {
    const payload = {};
    if (text !== undefined) payload.text = text.trim();
    if (done !== undefined) payload.done = !!done;
    if (Object.keys(payload).length === 0) return;
    const { error } = await supabase
      .from('profile_todos')
      .update(payload)
      .eq('id', todoId)
      .eq('user_id', userId);
    if (error) {
      if (isTableMissingError(error)) {
        useLocalStorageForProfile = true;
        return updateTodo(userId, todoId, { text, done }, agentContext);
      }
      throw error;
    }
    await logAction({
      action: 'Task updated',
      entity: 'Profile',
      entityId: todoId,
      details: payload.text ?? null,
      meta: {
        source: 'profileDataBackend',
        ...buildAgentMeta(agentContext),
        importance: 'low',
        tags: ['update', 'profile', 'task'],
        codeAfter: JSON.stringify({ id: todoId, ...payload }, null, 2),
      },
    });
    return;
  }
  const list = loadTodosFromLocal(userId);
  const idx = list.findIndex((t) => t.id === todoId);
  if (idx === -1) return;
  if (text !== undefined) list[idx].text = text.trim();
  if (done !== undefined) list[idx].done = !!done;
  localStorage.setItem(TODOS_STORAGE_KEY(userId), JSON.stringify(list));
}

export async function archiveTodo(userId, todoId, agentContext = null) {
  if (!userId) throw new Error('User required');
  if (shouldUseSupabaseForProfile()) {
    const { error } = await supabase
      .from('profile_todos')
      .update({ archived: true })
      .eq('id', todoId)
      .eq('user_id', userId);
    if (error) {
      if (isTableMissingError(error)) {
        useLocalStorageForProfile = true;
        return archiveTodo(userId, todoId, agentContext);
      }
      if (isColumnMissingError(error) || error.message?.includes('archived')) {
        console.warn(
          '[profileDataBackend] Cannot archive todo: archived column does not exist in Supabase. Add it with: ALTER TABLE profile_todos ADD COLUMN archived boolean DEFAULT false;'
        );
        return;
      }
      throw error;
    }
    await logAction({
      action: 'Task archived',
      entity: 'Profile',
      entityId: todoId,
      details: null,
      meta: buildAgentMeta(agentContext),
    });
    return;
  }
  const list = loadTodosFromLocal(userId);
  const idx = list.findIndex((t) => t.id === todoId);
  if (idx === -1) return;
  list[idx] = { ...list[idx], archived: true };
  localStorage.setItem(TODOS_STORAGE_KEY(userId), JSON.stringify(list));
}

export async function unarchiveTodo(userId, todoId, agentContext = null) {
  if (!userId) throw new Error('User required');
  if (shouldUseSupabaseForProfile()) {
    const { error } = await supabase
      .from('profile_todos')
      .update({ archived: false })
      .eq('id', todoId)
      .eq('user_id', userId);
    if (error) {
      if (isTableMissingError(error)) {
        useLocalStorageForProfile = true;
        return unarchiveTodo(userId, todoId, agentContext);
      }
      if (isColumnMissingError(error) || error.message?.includes('archived')) {
        console.warn(
          '[profileDataBackend] Cannot unarchive todo: archived column does not exist in Supabase.'
        );
        return;
      }
      throw error;
    }
    await logAction({
      action: 'Task unarchived',
      entity: 'Profile',
      entityId: todoId,
      details: null,
      meta: buildAgentMeta(agentContext),
    });
    return;
  }
  const list = loadTodosFromLocal(userId);
  const idx = list.findIndex((t) => t.id === todoId);
  if (idx === -1) return;
  list[idx] = { ...list[idx], archived: false };
  localStorage.setItem(TODOS_STORAGE_KEY(userId), JSON.stringify(list));
}

export async function loadArchivedTodos(userId) {
  if (!userId) return [];
  if (shouldUseSupabaseForProfile()) {
    const { data, error } = await supabase
      .from('profile_todos')
      .select('id, text, done, created_at, archived')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) {
      if (isTableMissingError(error)) {
        useLocalStorageForProfile = true;
        return loadArchivedTodos(userId);
      }
      if (isColumnMissingError(error) || error.message?.includes('archived')) {
        console.warn('[profileDataBackend] archived column not found, no archived todos to return');
        return [];
      }
      throw error;
    }
    return (data || [])
      .filter((r) => r.archived)
      .map((r) => ({
        id: r.id,
        text: r.text ?? '',
        done: !!r.done,
        createdAt: r.created_at,
        archived: true,
        status: r.done ? 'Done' : 'Active',
      }));
  }
  return loadTodosFromLocal(userId)
    .filter((t) => t.archived)
    .map((t) => ({ ...t, status: t.done ? 'Done' : 'Active' }));
}

export async function deleteTodo(userId, todoId, agentContext = null) {
  if (!userId) throw new Error('User required');
  if (shouldUseSupabaseForProfile()) {
    const { error } = await supabase
      .from('profile_todos')
      .delete()
      .eq('id', todoId)
      .eq('user_id', userId);
    if (error) {
      if (isTableMissingError(error)) {
        useLocalStorageForProfile = true;
        return deleteTodo(userId, todoId, agentContext);
      }
      throw error;
    }
    await logAction({
      action: 'Task deleted',
      entity: 'Profile',
      entityId: todoId,
      details: null,
      meta: buildAgentMeta(agentContext),
    });
    return;
  }
  const list = loadTodosFromLocal(userId).filter((t) => t.id !== todoId);
  localStorage.setItem(TODOS_STORAGE_KEY(userId), JSON.stringify(list));
}
