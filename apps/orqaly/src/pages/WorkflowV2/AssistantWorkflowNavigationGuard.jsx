import { useContext, useEffect } from 'react';
import { UNSAFE_DataRouterContext, useBlocker } from 'react-router-dom';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';

function RouterGuard({ active }) {
  const blocker = useBlocker(active);
  return (
    <Dialog open={blocker.state === 'blocked'} onClose={() => blocker.reset?.()}>
      <DialogTitle>Keep this workflow work open?</DialogTitle>
      <DialogContent>
        A workflow request is still being confirmed or an n8n editing session is open. Stay here to
        finish or save it. Leaving can lose unsaved edits or unconfirmed message text.
      </DialogContent>
      <DialogActions>
        <Button onClick={() => blocker.reset?.()}>Stay here</Button>
        <Button onClick={() => blocker.proceed?.()}>Leave this page</Button>
      </DialogActions>
    </Dialog>
  );
}

export function AssistantWorkflowNavigationGuard({ active }) {
  const router = useContext(UNSAFE_DataRouterContext);
  useEffect(() => {
    if (!active) return undefined;
    const guard = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [active]);
  return router ? <RouterGuard active={active} /> : null;
}
