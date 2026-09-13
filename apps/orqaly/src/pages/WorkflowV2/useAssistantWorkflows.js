import { useCallback, useEffect, useMemo, useState } from 'react';
import { isWorkingBuild } from '../GcpWorkspace/workflow-build-presentation.js';

const EMPTY = [];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TERMINAL = new Set(['completed', 'blocked', 'failed']);
const WORKING = new Set(['queued', 'running']);

// Input is the persisted Assistant API messages, never a federated display feed
// or user-authored message text. A URL, title or active panel is not a run link.
export function assistantWorkflowRunIds(messages, threadId) {
  const ids = new Set();
  for (const message of messages || EMPTY) {
    if (
      message.threadId !== threadId ||
      !UUID.test(message.id || '') ||
      message.persisted === false ||
      message.optimistic === true
    )
      continue;
    if (UUID.test(message.workflowRunId || '')) ids.add(message.workflowRunId);
    for (const part of message.parts || EMPTY)
      if (part.type === 'goal_link' && UUID.test(part.runId || '')) ids.add(part.runId);
  }
  return [...ids].sort();
}

function validSnapshot(snapshot, solutionId) {
  return (
    snapshot?.solutionId === solutionId &&
    Array.isArray(snapshot.turns) &&
    snapshot.context &&
    snapshot.turns.every(
      (turn) =>
        typeof turn.id === 'string' && ['queued', 'running', ...TERMINAL].includes(turn.status)
    )
  );
}

// Terminal rows are immutable server records. Keep them (and older loaded rows)
// when a pre-submit GET arrives late or a subsequent last-50 page omits them.
export function mergeAssistantWorkflowSnapshot(previous, incoming) {
  if (!previous || previous.solutionId !== incoming.solutionId) return incoming;
  const turns = new Map(previous.turns.map((turn) => [turn.id, turn]));
  for (const turn of incoming.turns) {
    const prior = turns.get(turn.id);
    if (
      prior &&
      (TERMINAL.has(prior.status) || (prior.status === 'running' && turn.status === 'queued'))
    )
      continue;
    turns.set(turn.id, turn);
  }
  const context =
    (previous.context?.solutionVersion ?? -1) > (incoming.context?.solutionVersion ?? -1)
      ? previous.context
      : incoming.context;
  return {
    ...previous,
    ...incoming,
    context,
    hasMore: !!previous.hasMore || !!incoming.hasMore,
    turns: [...turns.values()].sort(
      (a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id)
    ),
  };
}

async function readInBatches(items, read, isCancelled) {
  const results = [];
  for (let index = 0; index < items.length && !isCancelled(); index += 4)
    results.push(
      ...(await Promise.all(
        items.slice(index, index + 4).map(async (item) => {
          try {
            return { item, value: await read(item) };
          } catch (error) {
            return { item, error };
          }
        })
      ))
    );
  return results;
}

export function useAssistantWorkflows({
  client,
  threadId,
  messages = EMPTY,
  activeSolutionId = null,
  activeSnapshot = null,
}) {
  const runKey = JSON.stringify(assistantWorkflowRunIds(messages, threadId));
  const runs = useMemo(() => JSON.parse(runKey), [runKey]);
  const [data, setData] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);
  const scoped = data?.client === client && data?.threadId === threadId ? data : null;
  const workflows = useMemo(
    () => (scoped?.workflows || EMPTY).filter((item) => runs.includes(item.build.runId)),
    [scoped?.workflows, runs]
  );
  const conversations = useMemo(
    () =>
      (scoped?.conversations || EMPTY).filter((item) =>
        workflows.some((workflow) => workflow.solutionId === item.solutionId)
      ),
    [scoped?.conversations, workflows]
  );
  const busy =
    workflows.some((item) => isWorkingBuild(item.build)) ||
    conversations.some((item) => item.snapshot.turns.some((turn) => WORKING.has(turn.status)));

  useEffect(() => {
    if (
      !activeSolutionId ||
      !validSnapshot(activeSnapshot, activeSolutionId) ||
      !workflows.some((item) => item.solutionId === activeSolutionId)
    )
      return;
    setData((previous) => {
      if (previous?.client !== client || previous.threadId !== threadId) return previous;
      const workflow = previous.workflows.find((item) => item.solutionId === activeSolutionId);
      if (!workflow) return previous;
      const prior = previous.conversations.find((item) => item.solutionId === activeSolutionId);
      return {
        ...previous,
        conversations: [
          ...previous.conversations.filter((item) => item.solutionId !== activeSolutionId),
          {
            solutionId: activeSolutionId,
            solutionName: workflow.solution?.name || workflow.build.name,
            snapshot: mergeAssistantWorkflowSnapshot(prior?.snapshot, activeSnapshot),
          },
        ],
      };
    });
  }, [activeSolutionId, activeSnapshot, client, threadId, workflows]);

  useEffect(() => {
    if (
      !threadId ||
      !runs.length ||
      !client?.solutionBuildRequests ||
      !client?.solutionConversation
    )
      return undefined;
    let cancelled = false;
    let timer;
    let failures = 0;
    const read = async () => {
      const buildReads = await readInBatches(
        runs,
        (runId) => client.solutionBuildRequests({ runId }),
        () => cancelled
      );
      if (cancelled) return;
      let error = buildReads.find((result) => result.error)?.error || null;
      const builds = new Map();
      for (const result of buildReads) {
        if (result.error) continue;
        if (!Array.isArray(result.value?.buildRequests)) {
          error ||= new Error('Workflow discovery could not be verified.');
          continue;
        }
        for (const build of result.value.buildRequests) {
          if (
            !UUID.test(build.id || '') ||
            build.runId !== result.item ||
            build.source?.threadId !== threadId ||
            !Number.isInteger(build.rowVersion) ||
            (build.solutionId && !UUID.test(build.solutionId))
          )
            continue;
          const prior = builds.get(build.id);
          if (!prior || build.rowVersion >= prior.rowVersion) builds.set(build.id, build);
        }
      }
      const solutionIds = [
        ...new Set([...builds.values()].map((build) => build.solutionId).filter(Boolean)),
      ];
      const reads = await readInBatches(
        solutionIds,
        async (solutionId) => {
          const [snapshot, detail] = await Promise.all([
            client.solutionConversation(solutionId),
            client.solution ? client.solution(solutionId) : Promise.resolve(null),
          ]);
          if (
            !validSnapshot(snapshot, solutionId) ||
            (detail && detail.solution?.id !== solutionId)
          )
            throw new Error('Saved workflow history could not be verified.');
          const build = [...builds.values()].find((value) => value.solutionId === solutionId);
          if (detail?.solution?.buildRequestId && detail.solution.buildRequestId !== build.id)
            throw new Error('The workflow source could not be verified.');
          return { snapshot, solution: detail?.solution };
        },
        () => cancelled
      );
      if (cancelled) return;
      error ||= reads.find((result) => result.error)?.error || null;
      const accessError = [...buildReads, ...reads].find((result) =>
        [401, 403].includes(result.error?.status)
      )?.error;
      const denied = !!accessError;
      if (accessError) error = accessError;
      setData((previous) => {
        const old = previous?.client === client && previous.threadId === threadId ? previous : null;
        if (denied) return { client, threadId, workflows: [], conversations: [], error };
        const mergedBuilds = new Map(
          (old?.workflows || EMPTY)
            .filter((item) => runs.includes(item.build.runId))
            .map((item) => [item.build.id, item])
        );
        for (const build of builds.values()) {
          const prior = mergedBuilds.get(build.id);
          if (!prior || build.rowVersion >= prior.build.rowVersion)
            mergedBuilds.set(build.id, { ...prior, solutionId: build.solutionId || null, build });
        }
        const mergedConversations = new Map(
          (old?.conversations || EMPTY).map((item) => [item.solutionId, item])
        );
        for (const result of reads) {
          if (result.error) continue;
          const workflow = [...mergedBuilds.values()].find(
            (item) => item.solutionId === result.item
          );
          if (result.value.solution)
            mergedBuilds.set(workflow.build.id, { ...workflow, solution: result.value.solution });
          mergedConversations.set(result.item, {
            solutionId: result.item,
            solutionName:
              result.value.solution?.name || workflow.solution?.name || workflow.build.name,
            snapshot: mergeAssistantWorkflowSnapshot(
              mergedConversations.get(result.item)?.snapshot,
              result.value.snapshot
            ),
          });
        }
        return {
          client,
          threadId,
          workflows: [...mergedBuilds.values()],
          conversations: [...mergedConversations.values()],
          error,
        };
      });
      failures = error ? failures + 1 : 0;
      // Read failures never retry commands. Stop after three automatic read
      // retries; an explicit Refresh starts a fresh bounded read sequence.
      if (!cancelled && !denied && failures <= 3)
        timer = setTimeout(
          read,
          error ? Math.min(60_000, 15_000 * 2 ** (failures - 1)) : busy ? 2500 : 15_000
        );
    };
    void read();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, threadId, runs, refreshKey, busy]);

  return {
    workflows,
    conversations,
    loading:
      !!threadId &&
      !!runs.length &&
      !!client?.solutionBuildRequests &&
      !!client?.solutionConversation &&
      !scoped,
    error: scoped?.error || null,
    refresh,
    hasMore: conversations.some((item) => item.snapshot.hasMore),
  };
}
