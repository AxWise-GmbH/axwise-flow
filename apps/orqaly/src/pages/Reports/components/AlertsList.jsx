import { useMemo, useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  Collapse,
  alpha,
  useTheme,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import AppIcon from '../../../components/icons/AppIcon';

const SEVERITY_CONFIG = {
  error: { icon: ErrorOutlineIcon, color: 'error', order: 0, label: 'Critical' },
  warning: { icon: WarningAmberIcon, color: 'warning', order: 1, label: 'Warnings' },
  info: { icon: InfoOutlinedIcon, color: 'info', order: 2, label: 'Info' },
  success: { icon: CheckCircleOutlineIcon, color: 'success', order: 3, label: 'Good' },
};

const DISMISS_KEY_PREFIX = 'orch_report_alerts_dismissed::';

function loadDismissed(scope) {
  try {
    const raw = localStorage.getItem(DISMISS_KEY_PREFIX + scope);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissed(scope, set) {
  try {
    localStorage.setItem(DISMISS_KEY_PREFIX + scope, JSON.stringify(Array.from(set)));
  } catch {
    /* ignore */
  }
}

export default function AlertsList({ data = [], scope = 'global' }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [dismissed, setDismissed] = useState(() => loadDismissed(scope));
  const [collapsed, setCollapsed] = useState({});

  useEffect(() => {
    setDismissed(loadDismissed(scope));
  }, [scope]);

  const dismiss = (key) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(key);
      saveDismissed(scope, next);
      return next;
    });
  };

  const visible = useMemo(
    () => (data || []).filter((a) => !dismissed.has(a.title || JSON.stringify(a))),
    [data, dismissed]
  );

  const grouped = useMemo(() => {
    const buckets = { error: [], warning: [], info: [], success: [] };
    visible.forEach((alert) => {
      const sev = SEVERITY_CONFIG[alert.severity] ? alert.severity : 'info';
      buckets[sev].push(alert);
    });
    return Object.entries(buckets)
      .filter(([, list]) => list.length > 0)
      .sort(([a], [b]) => SEVERITY_CONFIG[a].order - SEVERITY_CONFIG[b].order);
  }, [visible]);

  if (!data || data.length === 0 || visible.length === 0) {
    return (
      <Box sx={{ py: 3, textAlign: 'center' }}>
        <AppIcon
          name="CheckCircleOutline"
          fallback={CheckCircleOutlineIcon}
          sx={{ fontSize: 36, color: 'success.main', mb: 1 }}
        />
        <Typography variant="body2" color="text.secondary">
          All clear. No active alerts.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {grouped.map(([severity, list]) => {
        const config = SEVERITY_CONFIG[severity];
        const IconComp = config.icon;
        const paletteColor = theme.palette[config.color]?.main || theme.palette.info.main;
        const isCollapsed = collapsed[severity];

        return (
          <Box key={severity}>
            <Box
              onClick={() => setCollapsed((c) => ({ ...c, [severity]: !c[severity] }))}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                cursor: 'pointer',
                mb: 0.5,
                userSelect: 'none',
              }}
            >
              <AppIcon fallback={IconComp} sx={{ fontSize: 16, color: paletteColor }} />
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}
              >
                {config.label}
              </Typography>
              <Chip
                size="small"
                label={list.length}
                sx={{
                  height: 18,
                  fontSize: 11,
                  fontWeight: 700,
                  bgcolor: alpha(paletteColor, 0.18),
                  color: paletteColor,
                }}
              />
              <Box sx={{ flex: 1 }} />
              {isCollapsed ? (
                <AppIcon
                  name="ExpandMore"
                  fallback={ExpandMoreIcon}
                  sx={{ fontSize: 16, color: 'text.secondary' }}
                />
              ) : (
                <AppIcon
                  name="ExpandLess"
                  fallback={ExpandLessIcon}
                  sx={{ fontSize: 16, color: 'text.secondary' }}
                />
              )}
            </Box>
            <Collapse in={!isCollapsed}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {list.map((alert, i) => {
                  const key = alert.title || JSON.stringify(alert) || `${severity}-${i}`;
                  return (
                    <Box
                      key={key}
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 1.5,
                        p: 1.5,
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: alpha(paletteColor, 0.3),
                        bgcolor: alpha(paletteColor, isDark ? 0.08 : 0.04),
                        transition: 'border-color 0.2s',
                        '&:hover': { borderColor: alpha(paletteColor, 0.5) },
                      }}
                    >
                      <AppIcon
                        fallback={IconComp}
                        sx={{ fontSize: 20, color: paletteColor, mt: 0.25, flexShrink: 0 }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                          {alert.title || 'Alert'}
                        </Typography>
                        {alert.detail && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: 'block', mt: 0.25 }}
                          >
                            {alert.detail}
                          </Typography>
                        )}
                      </Box>
                      <Tooltip title="Dismiss">
                        <IconButton
                          size="small"
                          onClick={() => dismiss(key)}
                          sx={{ flexShrink: 0, color: 'text.secondary' }}
                        >
                          <AppIcon
                            name="CloseRounded"
                            fallback={CloseRoundedIcon}
                            sx={{ fontSize: 16 }}
                          />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  );
                })}
              </Box>
            </Collapse>
          </Box>
        );
      })}
    </Box>
  );
}
