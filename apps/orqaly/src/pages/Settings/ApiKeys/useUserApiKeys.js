import { useCallback, useEffect, useState } from 'react';
import {
  listUserKeys,
  listProviders,
  saveUserKey,
  deleteUserKey,
  testUserKey,
} from '../../../services/userKeysService';

export function useUserApiKeys() {
  const [keysByProvider, setKeysByProvider] = useState({});
  const [providers, setProviders] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [keyRows, providerRows] = await Promise.all([listUserKeys(), listProviders()]);
      const keysMap = {};
      for (const k of keyRows) keysMap[`${k.provider}:${k.slot}`] = k;
      const providerMap = {};
      for (const p of providerRows) providerMap[p.id] = p;
      setKeysByProvider(keysMap);
      setProviders(providerMap);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(
    async (input) => {
      const result = await saveUserKey(input);
      await refresh();
      return result;
    },
    [refresh]
  );

  const remove = useCallback(
    async (id) => {
      await deleteUserKey(id);
      await refresh();
    },
    [refresh]
  );

  const test = useCallback(async (input) => testUserKey(input), []);

  return { keysByProvider, providers, loading, error, refresh, save, remove, test };
}
