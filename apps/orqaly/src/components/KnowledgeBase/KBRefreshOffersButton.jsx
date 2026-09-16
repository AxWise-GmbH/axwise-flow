import { useState } from 'react';
import { Button, CircularProgress, Snackbar, Alert } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { supabase, hasSupabase } from '../../lib/supabase';

import AppIcon from '../icons/AppIcon';

async function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (hasSupabase()) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
  }
  return headers;
}

export default function KBRefreshOffersButton({ onDone }) {
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  async function trigger() {
    setLoading(true);
    try {
      const res = await fetch('/api/agent?path=research-github', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ source: 'manual' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);

      const { added = 0, skipped = 0, errors = [] } = data;
      const severity = errors.length > 0 ? 'warning' : 'success';
      const msg = `Added ${added} · skipped ${skipped}${errors.length ? ` · ${errors.length} error${errors.length > 1 ? 's' : ''}` : ''}`;
      setToast({ severity, message: msg });
      onDone?.();
    } catch (err) {
      setToast({ severity: 'error', message: err.message || 'Research failed' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        startIcon={
          loading ? (
            <CircularProgress size={14} />
          ) : (
            <AppIcon name="Refresh" fallback={RefreshIcon} />
          )
        }
        onClick={trigger}
        disabled={loading}
        sx={{ textTransform: 'none', borderRadius: 2 }}
      >
        {loading ? 'Andrei researching…' : 'Refresh offers'}
      </Button>
      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={5000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)} variant="filled">
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  );
}
