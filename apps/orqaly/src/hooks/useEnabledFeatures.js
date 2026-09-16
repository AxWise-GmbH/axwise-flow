import { useCallback, useSyncExternalStore } from 'react';

const ENABLED_FEATURES_KEY = 'orchestratori_enabled_features';

const listeners = new Set();
function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot() {
  return localStorage.getItem(ENABLED_FEATURES_KEY) || '[]';
}
function notify() {
  listeners.forEach((cb) => cb());
}

export function useEnabledFeatures() {
  const raw = useSyncExternalStore(subscribe, getSnapshot);
  const enabledFeatures = JSON.parse(raw);

  const isFeatureEnabled = useCallback(
    (featureId) => enabledFeatures.includes(featureId),
    [enabledFeatures]
  );

  const toggleFeature = useCallback((featureId) => {
    const current = JSON.parse(getSnapshot());
    const next = current.includes(featureId)
      ? current.filter((id) => id !== featureId)
      : [...current, featureId];
    localStorage.setItem(ENABLED_FEATURES_KEY, JSON.stringify(next));
    notify();
  }, []);

  const setEnabledFeatures = useCallback((featureIds) => {
    localStorage.setItem(ENABLED_FEATURES_KEY, JSON.stringify(featureIds));
    notify();
  }, []);

  return { enabledFeatures, isFeatureEnabled, toggleFeature, setEnabledFeatures };
}
