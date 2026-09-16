import { useState, useEffect, useCallback } from 'react';
import { meetingService } from '../services/meetingService';

/**
 * Hook for managing meetings for a specific partner.
 */
export function useMeetings(partnerId) {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchMeetings = useCallback(async () => {
    if (!partnerId) {
      setMeetings([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await meetingService.getByPartnerId(partnerId);
      setMeetings(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  const createMeeting = useCallback(
    async (params) => {
      const created = await meetingService.create({ partnerId, ...params });
      setMeetings((prev) => [created, ...prev]);
      return created;
    },
    [partnerId]
  );

  const updateMeeting = useCallback(async (meetingId, data) => {
    const updated = await meetingService.update(meetingId, data);
    setMeetings((prev) => prev.map((m) => (m.id === meetingId ? updated : m)));
    return updated;
  }, []);

  const finishRecording = useCallback(async (meetingId, blobUrl, onStatusChange) => {
    const result = await meetingService.saveRecordingAndTranscribe(
      meetingId,
      blobUrl,
      onStatusChange
    );
    if (result) {
      setMeetings((prev) => prev.map((m) => (m.id === meetingId ? result : m)));
    }
    return result;
  }, []);

  const uploadRecording = useCallback(
    async (file, metadata, onStatusChange) => {
      const result = await meetingService.uploadAndTranscribe(
        partnerId,
        file,
        metadata,
        onStatusChange
      );
      if (result) {
        setMeetings((prev) => [result, ...prev.filter((m) => m.id !== result.id)]);
      }
      return result;
    },
    [partnerId]
  );

  const deleteMeeting = useCallback(async (meetingId) => {
    await meetingService.delete(meetingId);
    setMeetings((prev) => prev.filter((m) => m.id !== meetingId));
  }, []);

  return {
    meetings,
    loading,
    error,
    refetch: fetchMeetings,
    createMeeting,
    updateMeeting,
    finishRecording,
    uploadRecording,
    deleteMeeting,
  };
}
