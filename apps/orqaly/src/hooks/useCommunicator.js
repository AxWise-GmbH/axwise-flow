import { useState, useCallback, useEffect } from 'react';
import {
  getLogs,
  addLog,
  deleteLog,
  getChannels,
  addChannel,
  updateChannel,
  deleteChannel,
  getPersonas,
  addPersona,
  updatePersona,
  deletePersona,
} from '../services/communicatorService';

const DEFAULT_LOG_FILTERS = {
  search: '',
  context_type: 'all',
  platform: 'all',
  sender_id: null,
  date_from: null,
  date_to: null,
};

export function useCommunicator() {
  const [logs, setLogs] = useState([]);
  const [channels, setChannels] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [logFilters, setLogFilters] = useState(DEFAULT_LOG_FILTERS);

  const [logsLoading, setLogsLoading] = useState(true);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [personasLoading, setPersonasLoading] = useState(true);

  const [logsError, setLogsError] = useState(null);
  const [channelsError, setChannelsError] = useState(null);
  const [personasError, setPersonasError] = useState(null);

  // ── Logs ─────────────────────────────────────────────────────────────────
  const fetchLogs = useCallback(
    async (filters = logFilters) => {
      try {
        setLogsLoading(true);
        setLogsError(null);
        const data = await getLogs(filters);
        setLogs(data);
      } catch (err) {
        setLogsError(err.message);
      } finally {
        setLogsLoading(false);
      }
    },
    [logFilters]
  );

  const applyLogFilters = useCallback(
    (newFilters) => {
      const merged = { ...logFilters, ...newFilters };
      setLogFilters(merged);
      fetchLogs(merged);
    },
    [logFilters, fetchLogs]
  );

  const resetLogFilters = useCallback(() => {
    setLogFilters(DEFAULT_LOG_FILTERS);
    fetchLogs(DEFAULT_LOG_FILTERS);
  }, [fetchLogs]);

  const createLog = useCallback(async (log) => {
    const created = await addLog(log);
    setLogs((prev) => [created, ...prev]);
    return created;
  }, []);

  const removeLog = useCallback(async (id) => {
    await deleteLog(id);
    setLogs((prev) => prev.filter((l) => l.id !== id));
  }, []);

  // ── Channels ──────────────────────────────────────────────────────────────
  const fetchChannels = useCallback(async () => {
    try {
      setChannelsLoading(true);
      setChannelsError(null);
      const data = await getChannels();
      setChannels(data);
    } catch (err) {
      setChannelsError(err.message);
    } finally {
      setChannelsLoading(false);
    }
  }, []);

  const createChannel = useCallback(async (channel) => {
    const created = await addChannel(channel);
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

  // ── Personas ──────────────────────────────────────────────────────────────
  const fetchPersonas = useCallback(async () => {
    try {
      setPersonasLoading(true);
      setPersonasError(null);
      const data = await getPersonas();
      setPersonas(data);
    } catch (err) {
      setPersonasError(err.message);
    } finally {
      setPersonasLoading(false);
    }
  }, []);

  const createPersona = useCallback(async (persona) => {
    const created = await addPersona(persona);
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

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchLogs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);
  useEffect(() => {
    fetchPersonas();
  }, [fetchPersonas]);

  return {
    // logs
    logs,
    logsLoading,
    logsError,
    logFilters,
    fetchLogs,
    applyLogFilters,
    resetLogFilters,
    createLog,
    removeLog,
    // channels
    channels,
    channelsLoading,
    channelsError,
    fetchChannels,
    createChannel,
    editChannel,
    removeChannel,
    // personas
    personas,
    personasLoading,
    personasError,
    fetchPersonas,
    createPersona,
    editPersona,
    removePersona,
  };
}
