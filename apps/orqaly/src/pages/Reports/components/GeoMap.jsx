import { useMemo } from 'react';
import { Box, Typography, Tooltip, Skeleton, useTheme, alpha } from '@mui/material';
import PublicIcon from '@mui/icons-material/Public';

import AppIcon from '../../../components/icons/AppIcon';

const GEO_FLAGS = {
  US: 'US',
  USA: 'US',
  'United States': 'US',
  UK: 'GB',
  GB: 'GB',
  'United Kingdom': 'GB',
  DE: 'DE',
  Germany: 'DE',
  FR: 'FR',
  France: 'FR',
  ES: 'ES',
  Spain: 'ES',
  IT: 'IT',
  Italy: 'IT',
  CA: 'CA',
  Canada: 'CA',
  AU: 'AU',
  Australia: 'AU',
  BR: 'BR',
  Brazil: 'BR',
  IN: 'IN',
  India: 'IN',
  JP: 'JP',
  Japan: 'JP',
  CN: 'CN',
  China: 'CN',
  MX: 'MX',
  Mexico: 'MX',
  NL: 'NL',
  Netherlands: 'NL',
  SE: 'SE',
  Sweden: 'SE',
  PL: 'PL',
  Poland: 'PL',
  UA: 'UA',
  Ukraine: 'UA',
  RU: 'RU',
  Russia: 'RU',
  ZA: 'ZA',
  'South Africa': 'ZA',
  AE: 'AE',
  UAE: 'AE',
  SG: 'SG',
  Singapore: 'SG',
};

function flagEmoji(code) {
  if (!code || code.length !== 2) return '';
  const base = 0x1f1e6;
  const offset = 'A'.charCodeAt(0);
  return String.fromCodePoint(
    base + code.charCodeAt(0) - offset,
    base + code.charCodeAt(1) - offset
  );
}

function formatValue(value, format) {
  const num = Number(value) || 0;
  if (format === 'currency') {
    return `$${num.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  if (format === 'percent') return `${num.toFixed(1)}%`;
  if (Math.abs(num) >= 1000) return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return num.toLocaleString();
}

export default function GeoMap({
  data = [],
  geoKey = 'geo',
  valueKey,
  format = 'number',
  height = 280,
  loading = false,
}) {
  const theme = useTheme();

  const items = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];
    const resolvedValueKey =
      valueKey ||
      (data[0] &&
        Object.keys(data[0]).find((k) => k !== geoKey && typeof data[0][k] === 'number')) ||
      'value';
    const total = data.reduce((sum, r) => sum + (Number(r[resolvedValueKey]) || 0), 0);
    const max = Math.max(...data.map((r) => Number(r[resolvedValueKey]) || 0)) || 1;
    return data
      .map((row) => {
        const value = Number(row[resolvedValueKey]) || 0;
        const region = row[geoKey] || 'Unknown';
        const code = GEO_FLAGS[region] || GEO_FLAGS[String(region).toUpperCase()];
        return {
          region,
          code,
          flag: code ? flagEmoji(code) : '',
          value,
          share: total > 0 ? (value / total) * 100 : 0,
          intensity: value / max,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [data, geoKey, valueKey]);

  if (loading) {
    return <Skeleton variant="rounded" height={height} animation="wave" sx={{ borderRadius: 2 }} />;
  }

  if (items.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
        No regional data available.
      </Typography>
    );
  }

  return (
    <Box
      sx={{
        width: '100%',
        minHeight: height,
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' },
        gap: 1,
      }}
    >
      {items.map((item) => {
        const color = alpha(theme.palette.primary.main, 0.15 + item.intensity * 0.55);
        return (
          <Tooltip
            key={item.region}
            arrow
            title={`${item.region}: ${formatValue(item.value, format)} (${item.share.toFixed(1)}%)`}
          >
            <Box
              sx={{
                position: 'relative',
                p: 1.25,
                borderRadius: 2,
                border: '1px solid',
                borderColor: alpha(theme.palette.primary.main, 0.25),
                bgcolor: color,
                overflow: 'hidden',
                transition: 'transform 0.15s, box-shadow 0.2s',
                cursor: 'default',
                '&:hover': {
                  transform: 'translateY(-1px)',
                  boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.18)}`,
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                {item.flag ? (
                  <Box sx={{ fontSize: 18, lineHeight: 1 }}>{item.flag}</Box>
                ) : (
                  <AppIcon
                    name="Public"
                    fallback={PublicIcon}
                    sx={{ fontSize: 16, color: 'primary.main' }}
                  />
                )}
                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                  {item.region}
                </Typography>
              </Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
                {formatValue(item.value, format)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                {item.share.toFixed(1)}% of total
              </Typography>
              <Box
                sx={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  height: 3,
                  width: `${item.intensity * 100}%`,
                  bgcolor: 'primary.main',
                  opacity: 0.6,
                }}
              />
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}
