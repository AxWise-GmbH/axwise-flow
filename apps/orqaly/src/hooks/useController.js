/**
 * [module: connection-hub]
 * useController — data hook for Controller tab.
 * Merges command execution + channels + personas management.
 */
import { useState, useCallback, useEffect } from 'react';
import {
  executeCommand as execCmd,
  getCommandHistory,
  getChannels,
  addChannel,
  updateChannel,
  deleteChannel,
  getPersonas,
  addPersona,
  updatePersona,
  deletePersona,
} from '../services/communicatorService';

export function useController() {
  // Command state
  const [commandHistory, setCommandHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  // Channels state
  const [channels, setChannels] = useState([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [channelsError, setChannelsError] = useState(null);

  // Personas state
  const [personas, setPersonas] = useState([]);
  const [personasLoading, setPersonasLoading] = useState(true);
  const [personasError, setPersonasError] = useState(null);

  // ── Commands ──
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await getCommandHistory();
      setCommandHistory(data);
    } catch {
      setCommandHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const executeCommand = useCallback(async (input) => {
    setExecuting(true);
    setLastResult(null);
    try {
      const result = await execCmd(input);
      setLastResult(result);
      // Prepend to history
      setCommandHistory((prev) => [
        {
          id: crypto.randomUUID(),
          input,
          parsed_intent: result.parsed_intent || '',
          output: result.output || '',
          status: result.status || 'success',
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      return result;
    } catch (e) {
      const err = { output: e.message, status: 'error' };
      setLastResult(err);
      return err;
    } finally {
      setExecuting(false);
    }
  }, []);

  // ── Channels ──
  const fetchChannels = useCallback(async () => {
    setChannelsLoading(true);
    setChannelsError(null);
    try {
      const data = await getChannels();
      setChannels(data);
    } catch (e) {
      setChannelsError(e.message);
    } finally {
      setChannelsLoading(false);
    }
  }, []);

  const createChannel = useCallback(async (form) => {
    const created = await addChannel(form);
    setChannels((prev) => [created, ...prev]);
    return created;
  }, []);

  const editChannel = useCallback(async (id, updates) => {
    const updated = await updateChannel(id, updates);
    setChannels((prev) => prev.map((c) => (c.id === id ? updated : c)));
    return updated;
  }, []);

  const removeChannel = useCallback(async (id) => {
    await deleteChannel(id);
    setChannels((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // ── Personas ──
  const fetchPersonas = useCallback(async () => {
    setPersonasLoading(true);
    setPersonasError(null);
    try {
      const data = await getPersonas();
      setPersonas(data);
    } catch (e) {
      setPersonasError(e.message);
    } finally {
      setPersonasLoading(false);
    }
  }, []);

  const createPersona = useCallback(async (form) => {
    const created = await addPersona(form);
    setPersonas((prev) => [created, ...prev]);
    return created;
  }, []);

  const editPersona = useCallback(async (id, updates) => {
    const updated = await updatePersona(id, updates);
    setPersonas((prev) => prev.map((p) => (p.id === id ? updated : p)));
    return updated;
  }, []);

  const removePersona = useCallback(async (id) => {
    await deletePersona(id);
    setPersonas((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // Initial load
  useEffect(() => {
    fetchHistory();
    fetchChannels();
    fetchPersonas();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    // Commands
    commandHistory,
    historyLoading,
    executing,
    lastResult,
    executeCommand,
    fetchHistory,
    // Channels
    channels,
    channelsLoading,
    channelsError,
    createChannel,
    editChannel,
    removeChannel,
    fetchChannels,
    // Personas
    personas,
    personasLoading,
    personasError,
    createPersona,
    editPersona,
    removePersona,
    fetchPersonas,
  };
}
