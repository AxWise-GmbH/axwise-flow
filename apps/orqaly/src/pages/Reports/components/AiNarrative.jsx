import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography, IconButton, Chip, Skeleton, alpha, useTheme } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { fetchReportInsights } from '../../../services/reportService';

import AppIcon from '../../../components/icons/AppIcon';

function formatValue(value, format) {
  const num = Number(value) || 0;
  if (format === 'currency') {
    return `$${num.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  if (format === 'percent') return `${num.toFixed(1)}%`;
  if (Math.abs(num) >= 1000) return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return num.toLocaleString();
}

/** Deterministic, rules-based summary. Used as the fallback when the LLM call
 * is unavailable (offline, no API key, rate limited, timeout). */
function buildDeterministicNarrative({ kpis = [], alerts = [], template }) {
  const lines = [];
  const templateName = template?.name || 'this report';
  lines.push(`Here is a quick read on ${templateName}.`);

  const movers = (kpis || [])
    .filter((k) => k.change != null && !Number.isNaN(Number(k.change)))
    .sort((a, b) => Math.abs(Number(b.change)) - Math.abs(Number(a.change)));

  if (movers.length > 0) {
    const top = movers.slice(0, 3);
    const phrases = top.map((k) => {
      const dir = Number(k.change) >= 0 ? 'up' : 'down';
      return `${k.label} is ${dir} ${Math.abs(Number(k.change)).toFixed(1)}% (${formatValue(k.value, k.format)})`;
    });
    lines.push(`The biggest movers: ${phrases.join('; ')}.`);
  } else if (kpis.length > 0) {
    const headline = kpis[0];
    lines.push(`${headline.label} sits at ${formatValue(headline.value, headline.format)}.`);
  }

  const errors = (alerts || []).filter((a) => a.severity === 'error');
  const warnings = (alerts || []).filter((a) => a.severity === 'warning');
  if (errors.length > 0) {
    lines.push(
      `Attention: ${errors.length} critical alert${errors.length === 1 ? '' : 's'} need follow-up.`
    );
  } else if (warnings.length > 0) {
    lines.push(`${warnings.length} warning${warnings.length === 1 ? '' : 's'} worth a glance.`);
  } else {
    lines.push('No critical alerts firing right now.');
  }

  return lines.join(' ');
}

export default function AiNarrative({ snapshot, kpis, alerts, template, computedAt }) {
  const theme = useTheme();
  const [hidden, setHidden] = useState(false);
  // mode: 'ai' once the LLM responds, 'auto' for the deterministic fallback.
  const [mode, setMode] = useState('auto');
  const [aiText, setAiText] = useState('');
  const [loading, setLoading] = useState(false);
  const reqIdRef = useRef(0);

  const deterministic = useMemo(
    () => buildDeterministicNarrative({ kpis, alerts, template }),
    [kpis, alerts, template]
  );

  // Request a real LLM narrative once per snapshot version. fetchReportInsights
  // caches per (reportType, version), so polling/re-renders do not re-bill.
  useEffect(() => {
    if (!snapshot?.reportType || !Array.isArray(kpis) || kpis.length === 0) return;
    const myReq = ++reqIdRef.current;
    let cancelled = false;
    setLoading(true);
    fetchReportInsights(snapshot, { templateName: template?.name })
      .then((res) => {
        if (cancelled || myReq !== reqIdRef.current) return;
        const text = String(res?.narrative || '').trim();
        if (text) {
          setAiText(text);
          setMode('ai');
        } else {
          setMode('auto');
        }
      })
      .catch(() => {
        if (cancelled || myReq !== reqIdRef.current) return;
        setMode('auto'); // graceful fallback to the deterministic summary
      })
      .finally(() => {
        if (!cancelled && myReq === reqIdRef.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [snapshot?.reportType, snapshot?.version, kpis, template?.name]);

  if (hidden) return null;

  const isAi = mode === 'ai' && aiText;
  const text = isAi ? aiText : deterministic;

  return (
    <Box
      sx={{
        position: 'relative',
        borderRadius: 2.5,
        p: 2,
        mb: 2,
        border: '1px solid',
        borderColor: alpha(theme.palette.primary.main, 0.25),
        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.08)} 0%, ${alpha(theme.palette.info.main, 0.05)} 100%)`,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: alpha(theme.palette.primary.main, 0.18),
            color: 'primary.main',
            flexShrink: 0,
          }}
        >
          <AppIcon name="AutoAwesome" fallback={AutoAwesomeIcon} sx={{ fontSize: 18 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
            <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: 0.5 }}>
              {isAi ? 'AI summary' : 'Auto summary'}
            </Typography>
            <Chip
              size="small"
              label={isAi ? 'Groq' : 'rules-based'}
              sx={{
                height: 18,
                fontSize: 10,
                fontWeight: 700,
                bgcolor: alpha(theme.palette.primary.main, 0.18),
                color: 'primary.main',
              }}
            />
            {computedAt && (
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                computed {new Date(computedAt).toLocaleString()}
              </Typography>
            )}
          </Box>
          {loading && mode !== 'ai' ? (
            <Box>
              <Skeleton variant="text" width="92%" />
              <Skeleton variant="text" width="78%" />
            </Box>
          ) : (
            <Typography variant="body2" sx={{ lineHeight: 1.55, whiteSpace: 'pre-line' }}>
              {text}
            </Typography>
          )}
        </Box>
        <IconButton size="small" onClick={() => setHidden(true)} aria-label="Hide summary">
          <AppIcon name="CloseRounded" fallback={CloseRoundedIcon} sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>
    </Box>
  );
}
