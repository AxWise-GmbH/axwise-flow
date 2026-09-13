import { useState, useEffect, useCallback } from 'react';
import {
  getAllMembers,
  addMember,
  editMember,
  removeMember,
  quarantineMember,
  unquarantineMember,
} from '../services/conciliumMembersService';

export function useConciliumMembers(conciliumId) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchMembers = useCallback(async () => {
    if (!conciliumId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await getAllMembers(conciliumId);
      setMembers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [conciliumId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const add = useCallback(
    async (memberData) => {
      try {
        const created = await addMember(conciliumId, memberData);
        setMembers((prev) => [...prev, created]);
        return created;
      } catch (e) {
        console.warn('[useConciliumMembers] add failed:', e);
        return null;
      }
    },
    [conciliumId]
  );

  const edit = useCallback(async (id, updates) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)));
    try {
      const updated = await editMember(id, updates);
      if (updated) setMembers((prev) => prev.map((m) => (m.id === id ? updated : m)));
      return updated;
    } catch (e) {
      console.warn('[useConciliumMembers] edit failed:', e);
      throw e;
    }
  }, []);

  const remove = useCallback(async (id) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
    removeMember(id).catch((e) => {
      console.warn('[useConciliumMembers] remove failed:', e);
    });
  }, []);

  const quarantine = useCallback(async (id, reason) => {
    try {
      const updated = await quarantineMember(id, reason);
      setMembers((prev) => prev.map((m) => (m.id === id ? updated : m)));
      return updated;
    } catch (e) {
      console.warn('[useConciliumMembers] quarantine failed:', e);
      return null;
    }
  }, []);

  const unquarantine = useCallback(async (id) => {
    try {
      const updated = await unquarantineMember(id);
      setMembers((prev) => prev.map((m) => (m.id === id ? updated : m)));
      return updated;
    } catch (e) {
      console.warn('[useConciliumMembers] unquarantine failed:', e);
      return null;
    }
  }, []);

  return {
    members,
    loading,
    error,
    refetch: fetchMembers,
    addMember: add,
    editMember: edit,
    removeMember: remove,
    quarantineMember: quarantine,
    unquarantineMember: unquarantine,
  };
}
