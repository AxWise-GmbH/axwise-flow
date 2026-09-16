/**
 * [module: connection-hub]
 * useAgentRoom — data hook for AI Agents Room tab.
 */
import { useState, useCallback, useEffect } from 'react';
import { getAgentRooms, getAgentRoomMessages } from '../services/communicatorService';

const DEFAULT_FILTERS = { status: 'all', search: '' };

export function useAgentRoom({ initialGoalId } = {}) {
  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState(null);
  const [roomFilters, setRoomFilters] = useState(DEFAULT_FILTERS);

  const [selectedRoom, setSelectedRoom] = useState(initialGoalId || null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState(null);
  const [activeChannel, setActiveChannel] = useState('all');

  const fetchRooms = useCallback(
    async (filters) => {
      setRoomsLoading(true);
      setRoomsError(null);
      try {
        const data = await getAgentRooms(filters || roomFilters);
        setRooms(data);
        // Auto-select: prefer initialGoalId if it exists in rooms, otherwise first room
        if (data.length > 0 && !selectedRoom) {
          const match = initialGoalId && data.find((r) => r.goalId === initialGoalId);
          setSelectedRoom(match ? match.goalId : data[0].goalId);
        }
      } catch (e) {
        setRoomsError(e.message);
      } finally {
        setRoomsLoading(false);
      }
    },
    [roomFilters, selectedRoom]
  );

  const fetchMessages = useCallback(
    async (goalId, channel) => {
      if (!goalId) return;
      setMessagesLoading(true);
      setMessagesError(null);
      try {
        const data = await getAgentRoomMessages(goalId, channel || activeChannel);
        setMessages(data);
      } catch (e) {
        setMessagesError(e.message);
      } finally {
        setMessagesLoading(false);
      }
    },
    [activeChannel]
  );

  const selectRoom = useCallback(
    (goalId) => {
      setSelectedRoom(goalId);
      setActiveChannel('all');
      fetchMessages(goalId, 'all');
    },
    [fetchMessages]
  );

  const changeChannel = useCallback(
    (channel) => {
      setActiveChannel(channel);
      if (selectedRoom) fetchMessages(selectedRoom, channel);
    },
    [selectedRoom, fetchMessages]
  );

  const applyRoomFilters = useCallback(
    (updates) => {
      const next = { ...roomFilters, ...updates };
      setRoomFilters(next);
      fetchRooms(next);
    },
    [roomFilters, fetchRooms]
  );

  const resetRoomFilters = useCallback(() => {
    setRoomFilters(DEFAULT_FILTERS);
    fetchRooms(DEFAULT_FILTERS);
  }, [fetchRooms]);

  // Initial load
  useEffect(() => {
    fetchRooms();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch messages when room changes
  useEffect(() => {
    if (selectedRoom) fetchMessages(selectedRoom, activeChannel);
  }, [selectedRoom]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    rooms,
    roomsLoading,
    roomsError,
    roomFilters,
    selectedRoom,
    messages,
    messagesLoading,
    messagesError,
    activeChannel,
    fetchRooms,
    selectRoom,
    changeChannel,
    fetchMessages,
    applyRoomFilters,
    resetRoomFilters,
  };
}
