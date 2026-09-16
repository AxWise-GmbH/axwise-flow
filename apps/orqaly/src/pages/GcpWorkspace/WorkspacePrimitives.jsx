import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { formatWhen, humanize } from './workspaceViewModel.js';

const STATUS_COLORS = {
  blocked: 'error',
  failed: 'error',
  awaiting_gate_1: 'warning',
  awaiting_gate_2: 'warning',
  awaiting_approval: 'warning',
  completed: 'success',
  completed_with_evidence_gaps: 'warning',
  running: 'info',
  polling: 'info',
};

const FEATURE_STATUS_LABEL = 'In progress';

export function WorkspacePage({ title, description, actions = null, compact = false, children }) {
  return (
    <Container maxWidth="xl">
      <Stack spacing={compact ? 1.5 : 3}>
        <Stack
          component="header"
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', sm: 'flex-start' }}
          gap={2}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h1" variant={compact ? 'h5' : 'h4'}>
              {title}
            </Typography>
            <Typography
              variant={compact ? 'body2' : 'body1'}
              color="text.secondary"
              sx={{ mt: 0.75, maxWidth: 760 }}
            >
              {description}
            </Typography>
          </Box>
          {actions ? (
            <Stack direction="row" gap={1}>
              {actions}
            </Stack>
          ) : null}
        </Stack>
        {children}
      </Stack>
    </Container>
  );
}

/**
 * Launch-visible contract for a retained module that has useful live behavior
 * but has not reached its agreed functional scope. Every use must name what is
 * available today and what remains, so navigation never presents a placeholder
 * as a finished feature. Remove the notice only when the remaining list is
 * delivered or the module is deliberately retired from the product.
 */
export function FeatureStatusNotice({ available, remaining }) {
  return (
    <Paper
      component="aside"
      aria-label="Feature implementation status"
      variant="outlined"
      sx={{ p: 2, borderRadius: 1, borderColor: 'warning.dark' }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} alignItems="flex-start" gap={2}>
        <Chip
          label={FEATURE_STATUS_LABEL}
          color="warning"
          size="small"
          sx={{ flexShrink: 0, fontWeight: 700 }}
        />
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
            gap: 2,
          }}
        >
          <Box component="section" aria-label="Available now">
            <Typography component="h2" variant="subtitle2">
              Available now
            </Typography>
            <Stack component="ul" spacing={0.5} sx={{ pl: 2.25, my: 0.75 }}>
              {available.map((item) => (
                <Typography component="li" variant="body2" color="text.secondary" key={item}>
                  {item}
                </Typography>
              ))}
            </Stack>
          </Box>
          <Box component="section" aria-label="Still to implement">
            <Typography component="h2" variant="subtitle2">
              Still to implement
            </Typography>
            <Stack component="ul" spacing={0.5} sx={{ pl: 2.25, my: 0.75 }}>
              {remaining.map((item) => (
                <Typography component="li" variant="body2" color="text.secondary" key={item}>
                  {item}
                </Typography>
              ))}
            </Stack>
          </Box>
        </Box>
      </Stack>
    </Paper>
  );
}

export function DataBoundary({ loading, error, onRetry, children }) {
  if (loading) {
    return (
      <Box
        role="status"
        aria-live="polite"
        sx={{ minHeight: 220, display: 'grid', placeItems: 'center' }}
      >
        <Stack alignItems="center" spacing={1.5}>
          <CircularProgress size={28} aria-label="Loading workspace data" />
          <Typography variant="body2" color="text.secondary">
            Loading workspace…
          </Typography>
        </Stack>
      </Box>
    );
  }
  if (error) {
    return (
      <Alert
        severity="error"
        action={<Button onClick={onRetry}>Retry</Button>}
        sx={{ alignItems: 'center' }}
      >
        {error.message || 'Workspace data could not be loaded.'}
      </Alert>
    );
  }
  return children;
}

export function MetricGrid({ items }) {
  return (
    <Box
      component="dl"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(5, minmax(0, 1fr))' },
        gap: 1.5,
        m: 0,
      }}
    >
      {items.map((item) => (
        <Paper key={item.label} variant="outlined" sx={{ p: 2, borderRadius: 1, minWidth: 0 }}>
          <Typography component="dt" variant="caption" color="text.secondary">
            {item.label}
          </Typography>
          <Typography component="dd" variant="h5" sx={{ m: 0, mt: 0.5 }}>
            {item.value}
          </Typography>
          {item.helper ? (
            <Typography variant="caption" color="text.secondary">
              {item.helper}
            </Typography>
          ) : null}
        </Paper>
      ))}
    </Box>
  );
}

export function SectionCard({ title, description = '', action = null, children }) {
  return (
    <Paper component="section" variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'center' }}
        gap={1}
        sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Box>
          <Typography component="h2" variant="h6">
            {title}
          </Typography>
          {description ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {description}
            </Typography>
          ) : null}
        </Box>
        {action}
      </Stack>
      <Box sx={{ p: 2 }}>{children}</Box>
    </Paper>
  );
}

export function EmptyState({ title, body, action = null }) {
  return (
    <Stack alignItems="flex-start" spacing={1} sx={{ py: 2 }}>
      <Typography variant="subtitle1">{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 720 }}>
        {body}
      </Typography>
      {action}
    </Stack>
  );
}

export function StatusChip({ status }) {
  if (!status) return null;
  return (
    <Chip
      size="small"
      variant="outlined"
      color={STATUS_COLORS[status] || 'default'}
      label={humanize(status)}
    />
  );
}

export function RecordList({ items, empty, ariaLabel }) {
  if (!items.length) return empty;
  return (
    <Stack component="ul" aria-label={ariaLabel} spacing={0} sx={{ listStyle: 'none', p: 0, m: 0 }}>
      {items.map((item, index) => (
        <Stack
          component="li"
          key={item.id || `${item.title}-${index}`}
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', sm: 'center' }}
          gap={1.5}
          sx={{ py: 1.5, borderTop: index ? '1px solid' : 0, borderColor: 'divider' }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" alignItems="center" flexWrap="wrap" gap={1}>
              <Typography variant="subtitle2" sx={{ overflowWrap: 'anywhere' }}>
                {item.title}
              </Typography>
              {item.status ? <StatusChip status={item.status} /> : null}
              {item.meta ? <Chip size="small" variant="outlined" label={item.meta} /> : null}
            </Stack>
            {item.description ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {item.description}
              </Typography>
            ) : null}
            {item.at ? (
              <Typography
                component="time"
                variant="caption"
                color="text.secondary"
                dateTime={item.at}
              >
                {formatWhen(item.at)}
              </Typography>
            ) : null}
          </Box>
          {item.href ? (
            <Button component={RouterLink} to={item.href} size="small" variant="outlined">
              {item.actionLabel || 'Open'}
            </Button>
          ) : null}
        </Stack>
      ))}
    </Stack>
  );
}

export function PageLink({ to, children, variant = 'outlined' }) {
  return (
    <Button component={RouterLink} to={to} variant={variant}>
      {children}
    </Button>
  );
}
