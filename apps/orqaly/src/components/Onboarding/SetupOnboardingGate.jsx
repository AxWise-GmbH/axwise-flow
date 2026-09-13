import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useOnboarding } from './OnboardingProvider';
import { useSimpleMode } from '../../hooks/useSimpleMode';
import WelcomeGuide from './WelcomeGuideV2';

/**
 * First-login gate. Opens the Welcome Guide for simple-mode users on /dashboard
 * (also re-triggered by "Show Guide Again" in Settings, which clears the flag and
 * reloads /dashboard). Advanced users skip this entirely.
 */
export default function SetupOnboardingGate() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { active, dismiss } = useOnboarding();
  const { simpleMode } = useSimpleMode();

  useEffect(() => {
    if (!active || !simpleMode) return;
    if (pathname !== '/dashboard' && pathname !== '/') {
      navigate('/dashboard', { replace: true });
    }
  }, [active, simpleMode, pathname, navigate]);

  if (!active || !simpleMode) return null;

  return <WelcomeGuide open={active} onClose={dismiss} onSetup={() => navigate('/setup')} />;
}
