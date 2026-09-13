import { useState, useEffect, useCallback, useMemo } from 'react';
import { partnerService } from '../services/partnerService';
import { usePartnerAccessOptional } from '../context/PartnerAccessContext';

export function usePartners() {
  const { isPartnerRole, linkedPartnerId } = usePartnerAccessOptional() || {};
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPartners = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await partnerService.getAll();
      setPartners(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  // Partner role: show only the linked partner
  const filteredPartners = useMemo(() => {
    if (isPartnerRole && linkedPartnerId) {
      return partners.filter((p) => p.id === linkedPartnerId);
    }
    return partners;
  }, [partners, isPartnerRole, linkedPartnerId]);

  // Refetch when a partner is created/updated elsewhere (e.g. voice command in MainLayout)
  useEffect(() => {
    const onInvalidated = () => fetchPartners();
    window.addEventListener('orch-partners-invalidated', onInvalidated);
    return () => window.removeEventListener('orch-partners-invalidated', onInvalidated);
  }, [fetchPartners]);

  const addPartner = useCallback(async (data) => {
    const created = await partnerService.create(data);
    setPartners((prev) => [created, ...prev]);
    return created;
  }, []);

  const updatePartner = useCallback(async (id, data) => {
    const updated = await partnerService.update(id, data);
    setPartners((prev) => prev.map((p) => (p.id === id ? updated : p)));
    return updated;
  }, []);

  const updatePartnerTasks = useCallback(async (id, tasks) => {
    setPartners((prev) => prev.map((p) => (p.id === id ? { ...p, tasks } : p)));
    partnerService
      .updateTasks(id, tasks)
      .then((updated) => {
        setPartners((prev) => prev.map((p) => (p.id === id ? updated : p)));
      })
      .catch((e) => {
        console.warn('[usePartners] updatePartnerTasks failed:', e);
      });
  }, []);

  const archivePartner = useCallback(async (id, reason = '') => {
    const archived = await partnerService.archive(id, reason);
    setPartners((prev) => prev.map((p) => (p.id === id ? archived : p)));
    return archived;
  }, []);

  return {
    partners: filteredPartners,
    loading,
    error,
    refetch: fetchPartners,
    addPartner,
    updatePartner,
    updatePartnerTasks,
    archivePartner,
  };
}
