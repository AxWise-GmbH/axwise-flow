import { createContext, useContext, useState, useCallback, useMemo } from 'react';

const ONBOARDING_DONE_KEY = 'orchestratori_onboarding_done';

const OnboardingContext = createContext(null);

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}

export function OnboardingProvider({ children }) {
  const [active, setActive] = useState(() => {
    return localStorage.getItem(ONBOARDING_DONE_KEY) !== 'true';
  });
  const [step, setStep] = useState(0);

  const dismiss = useCallback(() => {
    setActive(false);
    localStorage.setItem(ONBOARDING_DONE_KEY, 'true');
  }, []);

  const next = useCallback(() => {
    setStep((prev) => prev + 1);
  }, []);

  const back = useCallback(() => {
    setStep((prev) => Math.max(0, prev - 1));
  }, []);

  const restart = useCallback(() => {
    localStorage.removeItem(ONBOARDING_DONE_KEY);
    setStep(0);
    setActive(true);
  }, []);

  const value = useMemo(
    () => ({ active, step, next, back, dismiss, restart }),
    [active, step, next, back, dismiss, restart]
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}
