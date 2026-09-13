import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AssistantSetupChatDialog from '../Assistant/AssistantSetupChatDialog';
import CreateOrgDialog from '../Organizations/CreateOrgDialog';
import SetupWizardDialog from '../Setup/SetupWizardDialog';
import HireUsDialog from './HireUsDialog';

// Window event the Welcome Guide CTA fires: detail.action in {assistant, org, keys, hire}.
export const QUICK_ACTION_EVENT = 'orch-quick-action';
const ACTIONS = ['assistant', 'org', 'keys', 'hire'];

/**
 * Global host for the Welcome Guide's first-step actions. Listening for the `orch-quick-action`
 * window event (instead of prop-drilling) means the real dialogs open no matter which surface
 * launched the guide (first-login gate, Help button, simple-mode switch, "Show Guide Again").
 * Mounted once in MainLayout.
 */
export default function QuickActionDialogs() {
  const navigate = useNavigate();
  const [action, setAction] = useState(null); // 'assistant' | 'org' | 'keys' | 'hire' | null
  const close = useCallback(() => setAction(null), []);

  useEffect(() => {
    const handler = (e) => {
      const next = e?.detail?.action;
      if (ACTIONS.includes(next)) setAction(next);
    };
    window.addEventListener(QUICK_ACTION_EVENT, handler);
    return () => window.removeEventListener(QUICK_ACTION_EVENT, handler);
  }, []);

  return (
    <>
      <AssistantSetupChatDialog open={action === 'assistant'} onClose={close} />
      <CreateOrgDialog
        open={action === 'org'}
        onClose={close}
        onCreated={close}
        onError={() => {}}
      />
      <SetupWizardDialog open={action === 'keys'} onClose={close} />
      <HireUsDialog
        open={action === 'hire'}
        onClose={close}
        onTalkToSales={() => {
          close();
          navigate('/contact');
        }}
      />
    </>
  );
}
