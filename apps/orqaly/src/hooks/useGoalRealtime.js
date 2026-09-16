import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, hasSupabase } from '../lib/supabase';
import { getGoal, getGoalMessages } from '../services/goalService';
import { currentGoalTaskAttempt } from '../components/Goals/currentGoalTaskAttempt';
import { currentGoalDocuments } from '../../lib/_shared/goal-document-attempt.js';

const ACTIVE_STATUSES = [
  'feasibility',
  'analyzing',
  'researching_customer',
  'awaiting_context_approval',
  'planning',
  'forming_team',
  'provisioning_tools',
  'estimating',
  'awaiting_approval',
  'authorizing_execution',
  'active',
  'awaiting_tools',
];

/**
 * Hook for real-time goal updates via Supabase Realtime.
 * Falls back to polling if Realtime is unavailable.
 */
export default function useGoalRealtime(goalId) {
  const [goal, setGoal] = useState(null);
  const [logs, setLogs] = useState([]);
  const [messages, setMessages] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef(null);
  const pollingRef = useRef(null);
  const mountedRef = useRef(false);
  const goalIdRef = useRef(goalId);
  const fetchGenerationRef = useRef(0);
  const goalStatus = goal?.status;
  goalIdRef.current = goalId;

  const isCurrentGoal = useCallback(
    (requestedGoalId) => mountedRef.current && goalIdRef.current === requestedGoalId,
    []
  );

  // Async service and Supabase calls cannot all be aborted. Invalidate their
  // continuations instead, so an unmounted hook (or a hook now showing another
  // goal) never receives stale state from an earlier request.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      fetchGenerationRef.current += 1;
    };
  }, []);

  // Initial data load
  const fetchAll = useCallback(async () => {
    if (!goalId) return;
    const requestGeneration = ++fetchGenerationRef.current;
    const isCurrentRequest = () =>
      isCurrentGoal(goalId) && fetchGenerationRef.current === requestGeneration;
    try {
      const goalData = await getGoal(goalId);
      if (!isCurrentRequest()) return;
      const g = goalData?.goal || goalData;
      setGoal(g);
      setLogs(g?.logs || goalData?.logs || []);

      // Fetch messages
      try {
        const msgs = await getGoalMessages(goalId);
        if (!isCurrentRequest()) return;
        setMessages(Array.isArray(msgs) ? msgs : []);
      } catch {
        if (isCurrentRequest()) setMessages([]);
      }

      // Fetch tasks via Supabase directly.
      //
      // The goal_id column first, the data blob second. Migration 095 added
      // team_tasks.goal_id and backfilled it, but nothing backfilled
      // data.goal_id the other way - so reading only the blob missed every
      // task written since, and the thread showed no deliverables for goals
      // the detail popup had plenty for. Same two-step the popup already does.
      if (hasSupabase()) {
        const TASK_COLUMNS =
          'id, goal_id, title, status, assigned_to, agent_id, materialization_attempt, data, sequence_order';
        let { data: taskData, error: taskErr } = await supabase
          .from('team_tasks')
          .select(TASK_COLUMNS)
          .eq('goal_id', goalId)
          .order('sequence_order', { ascending: true });
        if (!isCurrentRequest()) return;
        if (!taskData?.length) {
          const byMeta = await supabase
            .from('team_tasks')
            .select(TASK_COLUMNS)
            .contains('data', { goal_id: goalId })
            .order('sequence_order', { ascending: true });
          if (!isCurrentRequest()) return;
          if (byMeta.data?.length || !taskData) {
            taskData = byMeta.data;
            taskErr = taskErr || byMeta.error;
          }
        }
        if (taskErr) console.warn('useGoalRealtime: tasks query failed', taskErr.message);
        setTasks(currentGoalTaskAttempt(g, taskData));

        // Fetch KB documents for this goal
        const { data: docs, error: docsErr } = await supabase
          .from('knowledge_documents')
          .select('id, title, content, category, created_at, metadata')
          .contains('metadata', { goal_id: goalId })
          .order('created_at', { ascending: true });
        if (!isCurrentRequest()) return;
        if (docsErr) console.warn('useGoalRealtime: docs query failed', docsErr.message);
        setDocuments(currentGoalDocuments(g, docs || []));
      }
    } catch (err) {
      if (isCurrentRequest()) console.warn('useGoalRealtime: fetch failed', err.message);
    } finally {
      if (isCurrentRequest()) setLoading(false);
    }
  }, [goalId, isCurrentGoal]);

  // Polling fallback
  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    pollingRef.current = setInterval(fetchAll, 5000);
  }, [fetchAll]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Set up Supabase Realtime subscriptions
  useEffect(() => {
    if (!goalId || !hasSupabase()) return;

    fetchAll();

    const channel = supabase
      .channel(`goal-live-${goalId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'goal_log',
          filter: `goal_id=eq.${goalId}`,
        },
        (payload) => {
          if (!isCurrentGoal(goalId)) return;
          setLogs((prev) => [...prev, payload.new]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'goal_messages',
          filter: `goal_id=eq.${goalId}`,
        },
        (payload) => {
          if (!isCurrentGoal(goalId)) return;
          setMessages((prev) => [...prev, payload.new]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'goals',
          filter: `id=eq.${goalId}`,
        },
        (payload) => {
          if (!isCurrentGoal(goalId)) return;
          if (payload.new) {
            setGoal((prev) => ({ ...prev, ...payload.new }));
          }
        }
      )
      .subscribe((status) => {
        if (!isCurrentGoal(goalId)) return;
        setIsConnected(status === 'SUBSCRIBED');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Fallback to polling
          startPolling();
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      stopPolling();
    };
  }, [goalId, fetchAll, isCurrentGoal, startPolling, stopPolling]);

  // Also poll periodically for tasks/docs (Realtime doesn't cover filtered queries well)
  useEffect(() => {
    if (!goalId || !goalStatus) return;
    const isActive = ACTIVE_STATUSES.includes(goalStatus);
    if (!isActive) return;

    const interval = setInterval(async () => {
      if (!hasSupabase()) return;
      const { data: taskData } = await supabase
        .from('team_tasks')
        .select(
          'id, goal_id, title, status, assigned_to, agent_id, materialization_attempt, data, sequence_order'
        )
        .contains('data', { goal_id: goalId })
        .order('sequence_order', { ascending: true });
      if (!isCurrentGoal(goalId)) return;
      if (taskData) {
        // Native current-attempt selection is bound to the complete accepted
        // scope, sealed plan, formation/work materialization and approval.
        // Reconstructing a partial goal here made valid rows disappear and
        // allowed this polling path to disagree with the initial read.
        setTasks(currentGoalTaskAttempt(goal, taskData));
      }

      const { data: docs } = await supabase
        .from('knowledge_documents')
        .select('id, title, content, category, created_at, metadata')
        .contains('metadata', { goal_id: goalId })
        .order('created_at', { ascending: true });
      if (!isCurrentGoal(goalId)) return;
      if (docs) {
        setDocuments(currentGoalDocuments(goal, docs));
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [goalId, goalStatus, goal, isCurrentGoal]);

  return { goal, logs, messages, tasks, documents, loading, isConnected, refresh: fetchAll };
}
