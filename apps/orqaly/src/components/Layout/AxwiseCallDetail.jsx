import { useEffect, useState } from 'react';
import { Box, Stack, Typography, Link, alpha, useTheme } from '@mui/material';
import { supabase, hasSupabase } from '../../lib/supabase';

// AxWise per-call detail.
//  - AxwiseCallSections({ row, loading }) is PRESENTATIONAL: it renders the
//    Endpoint / Request / Response / Applied / Meta sections from a normalized
//    axwise_calls-shaped `row`. Reused by the PulseBar (inline) and the
//    Audit Log AxWise tab (in a dialog).
//  - AxwiseCallDetail({ event }) is the PulseBar wrapper: it fetches the durable
//    axwise_calls row by trace_id (RLS-scoped), or synthesizes a thin row from
//    the event, then renders the sections.

function Row({ label, children }) {
  return (
    <Stack direction="row" spacing={1} sx={{ py: 0.35 }}>
      <Typography
        variant="caption"
        sx={{
          minWidth: 70,
          fontWeight: 700,
          color: 'text.secondary',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          flexShrink: 0,
        }}
      >
        {label}
      </Typography>
      <Box
        sx={{
          minWidth: 0,
          flex: 1,
          fontSize: '0.75rem',
          color: 'text.primary',
          wordBreak: 'break-word',
        }}
      >
        {children}
      </Box>
    </Stack>
  );
}

function fmt(v) {
  if (v == null) return '—';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return String(v);
}

export function AxwiseCallSections({ row, loading = false }) {
  const theme = useTheme();
  const [showRaw, setShowRaw] = useState(false);
  const r = row || {};

  const point = r.integration_point || 'axwise';
  const dest = r.destination_url || 'AxWise /conditions/evaluate';
  const model = r.model || null;
  const req = r.request_payload || {};
  const message = req.message ?? null;
  const axDecision = r.ax_decision ?? null;
  const localDecision = r.local_decision ?? null;
  const conditions = Array.isArray(r.applicable_conditions) ? r.applicable_conditions : [];
  const outputs = r.processed_outputs || null;
  const applied = r.applied_outcome || (r.degraded ? 'fallback' : 'shadow-logged');
  const diverged = axDecision != null && localDecision != null && axDecision !== localDecision;
  const codeSx = {
    mt: 0.5,
    p: 1,
    borderRadius: 1,
    bgcolor: alpha(theme.palette.common.black, 0.35),
    fontFamily: 'monospace',
    fontSize: '0.7rem',
    whiteSpace: 'pre-wrap',
    maxHeight: 220,
    overflow: 'auto',
  };

  return (
    <Box>
      <Row label="Endpoint">
        {dest} · {point}
        {model ? ` · ${model}` : ''}
      </Row>

      <Row label="Request">
        {message ? (
          <span>&quot;{message}&quot;</span>
        ) : (
          <span style={{ color: theme.palette.text.disabled }}>
            {loading ? 'loading…' : 'payload not stored (older call)'}
          </span>
        )}
        {req.history_len != null || req.pageContext ? (
          <Typography component="span" variant="caption" sx={{ color: 'text.disabled', ml: 0.5 }}>
            {req.history_len != null ? ` · history: ${req.history_len}` : ''}
            {req.pageContext
              ? ` · page: ${typeof req.pageContext === 'string' ? req.pageContext : req.pageContext?.route || ''}`
              : ''}
          </Typography>
        ) : null}
      </Row>

      <Row label="Response">
        decision: <b>{fmt(axDecision)}</b>
        {conditions.length > 0 && (
          <Box sx={{ mt: 0.25 }}>
            {conditions.map((c, i) => (
              <Typography
                key={i}
                variant="caption"
                sx={{ display: 'block', color: 'text.secondary' }}
              >
                · {c.category} → {c.decision}
                {c.reason ? `: ${c.reason}` : ''}
              </Typography>
            ))}
          </Box>
        )}
        {outputs?.systemPromptFragment && (
          <Typography
            variant="caption"
            sx={{ display: 'block', color: 'text.secondary', mt: 0.25 }}
          >
            fragment: &quot;{outputs.systemPromptFragment}&quot;
          </Typography>
        )}
        {outputs?.classification && (
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
            intent: {fmt(outputs.classification.intent)} · sentiment:{' '}
            {fmt(outputs.classification.sentiment)}
          </Typography>
        )}
        {outputs && (
          <Link
            component="button"
            type="button"
            variant="caption"
            onClick={() => setShowRaw((v) => !v)}
            sx={{ mt: 0.25, display: 'inline-block' }}
          >
            {showRaw ? '▾ hide raw response' : '▸ raw response JSON'}
          </Link>
        )}
        {showRaw && outputs && (
          <Box sx={codeSx}>
            {JSON.stringify(
              { processed_outputs: outputs, applicable_conditions: conditions },
              null,
              2
            )}
          </Box>
        )}
      </Row>

      <Row label="Applied">
        <b>{applied}</b>
        {diverged ? (
          <Typography
            component="span"
            variant="caption"
            sx={{ color: theme.palette.warning.main, ml: 0.5 }}
          >
            · diverged (local: {fmt(localDecision)} vs ax: {fmt(axDecision)})
          </Typography>
        ) : localDecision != null ? (
          <Typography component="span" variant="caption" sx={{ color: 'text.disabled', ml: 0.5 }}>
            · local: {fmt(localDecision)} ✓
          </Typography>
        ) : null}
      </Row>

      <Row label="Meta">
        <Typography component="span" variant="caption" sx={{ color: 'text.disabled' }}>
          trace {r.trace_id || '—'} · {fmt(r.duration_ms)}ms · ${fmt(r.cost_usd)} · degraded:{' '}
          {fmt(r.degraded)}
          {r.skipped ? ' · skipped' : ''}
        </Typography>
      </Row>
    </Box>
  );
}

// Synthesize a thin axwise_calls-shaped row from a PulseBar event (fallback when
// no durable row exists, e.g. calls from before the axwise_calls table).
function rowFromEvent(event) {
  if (!event) return {};
  return {
    integration_point: event.where,
    ax_decision: event.axDecision ?? null,
    local_decision: event.localDecision ?? null,
    duration_ms: event.durationMs ?? null,
    cost_usd: event.cost ?? null,
    degraded: event.status === 'degraded',
    trace_id: event.traceId ?? null,
    request_payload: {},
    processed_outputs: null,
    applicable_conditions: [],
    applied_outcome:
      event.appliedOutcome || (event.status === 'degraded' ? 'fallback' : 'shadow-logged'),
    skipped: event.skipped === true,
  };
}

export default function AxwiseCallDetail({ event }) {
  const theme = useTheme();
  const [call, setCall] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      if (hasSupabase() && event?.traceId) {
        try {
          const { data } = await supabase
            .from('axwise_calls')
            .select('*')
            .eq('trace_id', event.traceId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (alive) setCall(data || null);
        } catch {
          if (alive) setCall(null);
        }
      }
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [event?.traceId]);

  return (
    <Box
      sx={{
        px: 2,
        py: 1,
        borderTop: `1px dashed ${alpha(theme.palette.primary.main, 0.25)}`,
        background: alpha(theme.palette.primary.main, 0.04),
      }}
    >
      <AxwiseCallSections row={call || rowFromEvent(event)} loading={loading} />
    </Box>
  );
}
