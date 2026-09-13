import { Box, Typography, useTheme } from '@mui/material';
import BlockShell from '../BlockShell';

function formatNumber(n, kind) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  if (kind === 'currency') {
    return `$${v.toLocaleString(undefined, { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 })}`;
  }
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function KpiBlock({ block, data, ...shellProps }) {
  const theme = useTheme();
  const value = data?.total ?? 0;
  const isCurrency = /(_usd|cost|revenue|amount|spend|budget)/i.test(
    block?.data?.measure?.field || ''
  );

  return (
    <BlockShell title={block?.title || 'KPI'} {...shellProps}>
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          gap: 0.5,
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            fontSize: '0.65rem',
          }}
        >
          {block?.data?.measure?.agg || 'value'}
          {block?.data?.measure?.field ? ` · ${block.data.measure.field}` : ''}
        </Typography>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: theme.palette.primary.main,
            lineHeight: 1.1,
          }}
        >
          {formatNumber(value, isCurrency ? 'currency' : 'number')}
        </Typography>
        {data?.sample_count != null && (
          <Typography variant="caption" color="text.secondary">
            from {Number(data.sample_count).toLocaleString()} {block?.data?.dataset || 'rows'}
          </Typography>
        )}
      </Box>
    </BlockShell>
  );
}
