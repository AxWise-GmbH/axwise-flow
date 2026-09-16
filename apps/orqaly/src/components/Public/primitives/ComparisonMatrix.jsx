import { Box, Container, Stack, Typography, alpha, useTheme } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import RemoveIcon from '@mui/icons-material/Remove';

import AppIcon from '../../icons/AppIcon';

function Cell({ value, theme }) {
  if (value === true) return (
    <AppIcon
      name='Check'
      fallback={CheckIcon}
      sx={{ color: 'primary.main', fontSize: 22 }}
      aria-label="Yes" />
  );
  if (value === 'partial') return (
    <AppIcon
      name='Remove'
      fallback={RemoveIcon}
      sx={{ color: theme.palette.warning.main, fontSize: 22 }}
      aria-label="Partial" />
  );
  return (
    <AppIcon
      name='Close'
      fallback={CloseIcon}
      sx={{ color: alpha(theme.palette.error.main, 0.7), fontSize: 20 }}
      aria-label="No" />
  );
}

// Capability comparison matrix. Highlights the first column (us).
export default function ComparisonMatrix({ title, subtitle, competitors, rows, bg = 'subtle', minWidth = 640 }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const bgcolor = bg === 'tint' ? alpha(theme.palette.text.primary, 0.02) : 'transparent';
  return (
    <Box component="section" sx={{ py: { xs: 5, md: 8 }, bgcolor, borderTop: bg === 'tint' ? `1px solid ${theme.palette.divider}` : 'none', borderBottom: bg === 'tint' ? `1px solid ${theme.palette.divider}` : 'none' }}>
      <Container maxWidth="lg">
        {(title || subtitle) && (
          <Stack spacing={1.5} sx={{ mb: 4 }}>
            {title && (
              <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1.6rem', md: '2.2rem' }, color: 'text.primary', letterSpacing: '-0.01em' }}>
                {title}
              </Typography>
            )}
            {subtitle && (
              <Typography sx={{ fontSize: '1rem', color: 'text.secondary', maxWidth: 640 }}>{subtitle}</Typography>
            )}
          </Stack>
        )}
        <Box sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <Box
            component="table"
            sx={{
              width: '100%',
              minWidth,
              borderCollapse: 'separate',
              borderSpacing: 0,
              '& th, & td': { borderBottom: `1px solid ${theme.palette.divider}`, px: 2, py: 1.75, verticalAlign: 'middle' },
              '& thead th': { fontWeight: 700, fontSize: '0.82rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', borderTop: `1px solid ${theme.palette.divider}` },
              '& tbody td:first-of-type': { fontWeight: 600, color: 'text.primary' },
            }}
          >
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'left' }}>Capability</th>
                {competitors.map((c) => {
                  const isUs = c.us === true;
                  return (
                    <th
                      key={c.id || c.label}
                      scope="col"
                      style={{
                        textAlign: 'center',
                        backgroundColor: isUs ? alpha(primary, 0.08) : 'transparent',
                        color: isUs ? primary : undefined,
                        borderLeft: isUs ? `1px solid ${alpha(primary, 0.5)}` : undefined,
                        borderRight: isUs ? `1px solid ${alpha(primary, 0.5)}` : undefined,
                      }}
                    >
                      {c.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx}>
                  <td>{row.capability}</td>
                  {competitors.map((c) => {
                    const isUs = c.us === true;
                    const key = c.id || c.label;
                    return (
                      <td
                        key={key}
                        style={{
                          textAlign: 'center',
                          backgroundColor: isUs ? alpha(primary, 0.06) : 'transparent',
                          borderLeft: isUs ? `1px solid ${alpha(primary, 0.5)}` : undefined,
                          borderRight: isUs ? `1px solid ${alpha(primary, 0.5)}` : undefined,
                        }}
                      >
                        <Cell value={row.values[key]} theme={theme} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </Box>
        </Box>
        <Stack direction="row" spacing={2.5} sx={{ mt: 2, flexWrap: 'wrap', color: 'text.secondary', fontSize: '0.78rem' }}>
          <Stack direction="row" spacing={0.75} alignItems="center"><AppIcon
            name='Check'
            fallback={CheckIcon}
            sx={{ fontSize: 14, color: 'primary.main' }} /> Yes</Stack>
          <Stack direction="row" spacing={0.75} alignItems="center"><AppIcon
            name='Remove'
            fallback={RemoveIcon}
            sx={{ fontSize: 14, color: theme.palette.warning.main }} /> Partial</Stack>
          <Stack direction="row" spacing={0.75} alignItems="center"><AppIcon
            name='Close'
            fallback={CloseIcon}
            sx={{ fontSize: 14, color: alpha(theme.palette.error.main, 0.7) }} /> No</Stack>
        </Stack>
      </Container>
    </Box>
  );
}
