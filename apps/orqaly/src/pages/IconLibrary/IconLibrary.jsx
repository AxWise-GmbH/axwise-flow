import { useMemo, useState } from 'react';
import {
  Box,
  Container,
  InputAdornment,
  Stack,
  TextField,
  Typography,
  alpha,
  useTheme,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import LandingGlassIcon from '../Landing/sections/LandingGlassIcon';
import * as Glass from '../../components/icons/glass';
import { GLASS_ICON_MAP } from '../../components/icons/glassIconMap';

function buildInverseMap() {
  const inverse = {};
  for (const [muiName, GlassComp] of Object.entries(GLASS_ICON_MAP)) {
    const lgEntry = Object.entries(Glass).find(([, c]) => c === GlassComp);
    if (!lgEntry) continue;
    const lgName = lgEntry[0];
    if (!inverse[lgName]) inverse[lgName] = [];
    inverse[lgName].push(muiName);
  }
  for (const lgName of Object.keys(inverse)) {
    inverse[lgName].sort((a, b) => a.localeCompare(b));
  }
  return inverse;
}

export default function IconLibrary() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const primary = theme.palette.primary.main;
  const [query, setQuery] = useState('');
  const [unmappedOnly, setUnmappedOnly] = useState(false);

  const inverseMap = useMemo(buildInverseMap, []);

  const allRows = useMemo(() => {
    return Object.entries(Glass)
      .filter(([name]) => name.startsWith('Lg'))
      .map(([name, Component]) => ({
        name,
        Component,
        muiNames: inverseMap[name] || [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [inverseMap]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = allRows;
    if (unmappedOnly) rows = rows.filter((r) => r.muiNames.length === 0);
    if (!q) return rows;
    return rows.filter((r) => {
      if (r.name.toLowerCase().includes(q)) return true;
      return r.muiNames.some((m) => m.toLowerCase().includes(q));
    });
  }, [allRows, query, unmappedOnly]);

  const totalCount = allRows.length;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: { xs: 4, md: 6 } }}>
      <Container maxWidth="md">
        <Stack spacing={3} sx={{ mb: 4 }}>
          <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={2}>
            <Typography
              sx={{
                fontSize: { xs: '1.5rem', md: '2rem' },
                fontWeight: 800,
                color: 'text.primary',
              }}
            >
              Glass Icon Library
            </Typography>
            <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary' }}>
              {filteredRows.length} / {totalCount} icons
            </Typography>
          </Stack>

          <TextField
            fullWidth
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by Lg name (e.g. LgKey) or MUI name (e.g. VpnKeyOutlined)..."
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: 'text.secondary' }} />
                </InputAdornment>
              ),
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                bgcolor: isDark ? alpha('#fff', 0.04) : alpha('#fff', 0.7),
                backdropFilter: 'blur(10px)',
              },
            }}
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={unmappedOnly}
                onChange={(e) => setUnmappedOnly(e.target.checked)}
                size="small"
              />
            }
            label={
              <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                Unmapped only (Lg icons not referenced by any MUI name)
              </Typography>
            }
          />
        </Stack>

        {filteredRows.length === 0 ? (
          <Box
            sx={{
              p: 6,
              textAlign: 'center',
              borderRadius: 3,
              border: `1px dashed ${theme.palette.divider}`,
              bgcolor: isDark ? alpha('#fff', 0.02) : alpha('#fff', 0.5),
            }}
          >
            <Typography sx={{ color: 'text.secondary' }}>
              No icons match &quot;{query}&quot;.
            </Typography>
          </Box>
        ) : (
          <Stack spacing={1.5}>
            {filteredRows.map(({ name, muiNames }) => (
              <Box
                key={name}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2.5,
                  p: 2,
                  borderRadius: 2.5,
                  border: `1px solid ${theme.palette.divider}`,
                  bgcolor: isDark ? alpha('#fff', 0.025) : alpha('#fff', 0.6),
                  backdropFilter: 'saturate(140%) blur(10px)',
                  WebkitBackdropFilter: 'saturate(140%) blur(10px)',
                  transition: 'border-color 180ms ease, transform 180ms ease',
                  '&:hover': {
                    borderColor: alpha(primary, 0.4),
                    transform: 'translateY(-1px)',
                  },
                }}
              >
                <LandingGlassIcon name={muiNames[0] || name} size={28} tone="brand" />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography
                    sx={{
                      fontWeight: 700,
                      fontSize: '1rem',
                      color: 'text.primary',
                      fontFamily: 'monospace',
                      mb: 0.5,
                    }}
                  >
                    {name}
                  </Typography>
                  {muiNames.length > 0 ? (
                    <Typography
                      sx={{
                        fontSize: '0.8125rem',
                        color: 'text.secondary',
                        lineHeight: 1.5,
                        wordBreak: 'break-word',
                      }}
                    >
                      <Box component="span" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                        Maps from:
                      </Box>{' '}
                      {muiNames.join(', ')}
                    </Typography>
                  ) : (
                    <Typography
                      sx={{
                        fontSize: '0.8125rem',
                        color: alpha(theme.palette.text.secondary, 0.6),
                        fontStyle: 'italic',
                      }}
                    >
                      No MUI names map to this icon yet.
                    </Typography>
                  )}
                </Box>
              </Box>
            ))}
          </Stack>
        )}
      </Container>
    </Box>
  );
}
