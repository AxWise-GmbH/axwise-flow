import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Chip,
  Container,
  InputAdornment,
  Stack,
  TextField,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import SearchIcon from '@mui/icons-material/Search';
import PublicShell from '../../components/Public/PublicShell';
import { searchSite } from '../../utils/siteSearch';

import AppIcon from '../../components/icons/AppIcon';

const POPULAR = [
  { label: 'Agent Hub', q: 'agents' },
  { label: 'Knowledge Base', q: 'knowledge' },
  { label: 'Marketplace', q: 'marketplace' },
  { label: 'Consilium', q: 'Consilium' },
  { label: 'Pricing', q: 'pricing' },
];

function SnippetText({ parts }) {
  const theme = useTheme();
  return (
    <Typography component="p" sx={{ fontSize: '0.9rem', color: 'text.secondary', lineHeight: 1.6, m: 0 }}>
      {parts.map((part, i) =>
        part.highlight ? (
          <Box
            key={i}
            component="mark"
            sx={{
              bgcolor: alpha(theme.palette.primary.main, 0.2),
              color: 'primary.main',
              fontWeight: 700,
              px: 0.25,
              borderRadius: 0.5,
            }}
          >
            {part.text}
          </Box>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </Typography>
  );
}

function SiteSearchForm({ defaultValue = '', autoFocus = false }) {
  const navigate = useNavigate();
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  return (
    <Box
      component="form"
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
      }}
      sx={{ width: '100%', maxWidth: 520 }}
    >
      <TextField
        fullWidth
        size="small"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search agents, tools, FAQ…"
        aria-label="Search site"
        autoFocus={autoFocus}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <AppIcon
                name='Search'
                fallback={SearchIcon}
                sx={{ fontSize: 20, color: 'text.secondary' }} />
            </InputAdornment>
          ),
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            borderRadius: 999,
            bgcolor: 'background.paper',
          },
        }}
      />
    </Box>
  );
}

export default function SearchResults() {
  const theme = useTheme();
  const [searchParams] = useSearchParams();
  const q = searchParams.get('q')?.trim() ?? '';

  const results = useMemo(() => (q ? searchSite(q) : []), [q]);

  useEffect(() => {
    document.title = q ? `Search: ${q} - Orqaly` : 'Search - Orqaly';
    return () => {
      document.title = 'Orqaly';
    };
  }, [q]);

  return (
    <PublicShell>
      <Box component="section" sx={{ py: { xs: 5, md: 8 } }}>
        <Container maxWidth="md">
          <Stack spacing={3}>
            <Stack spacing={1.5}>
              <Typography
                sx={{
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'primary.main',
                }}
              >
                Search
              </Typography>
              <Typography component="h1" sx={{ fontWeight: 800, fontSize: { xs: '1.75rem', md: '2.25rem' }, lineHeight: 1.15 }}>
                {q ? `Results for “${q}”` : 'Search the site'}
              </Typography>
              <SiteSearchForm defaultValue={q} autoFocus />
            </Stack>

            {!q && (
              <Stack spacing={2}>
                <Typography sx={{ color: 'text.secondary', fontSize: '0.95rem' }}>
                  Find pages across instruments, control points, solutions, FAQ, and platform info.
                </Typography>
                <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1}>
                  {POPULAR.map((p) => (
                    <Chip
                      key={p.q}
                      component={RouterLink}
                      to={`/search?q=${encodeURIComponent(p.q)}`}
                      label={p.label}
                      clickable
                      variant="outlined"
                      sx={{ fontWeight: 600 }}
                    />
                  ))}
                </Stack>
              </Stack>
            )}

            {q && results.length === 0 && (
              <Typography sx={{ color: 'text.secondary', fontSize: '0.95rem' }}>
                No pages matched your search. Try fewer words or a different term.
              </Typography>
            )}

            {q && results.length > 0 && (
              <Stack spacing={1.5}>
                <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
                  {results.length} {results.length === 1 ? 'result' : 'results'}
                </Typography>
                {results.map(({ entry, snippet }) => (
                  <Box
                    key={entry.id}
                    sx={{
                      p: 2.5,
                      borderRadius: 2.5,
                      border: `1px solid ${theme.palette.divider}`,
                      bgcolor: 'background.paper',
                      transition: 'border-color 180ms ease',
                      '&:hover': { borderColor: alpha(theme.palette.primary.main, 0.45) },
                    }}
                  >
                    <Stack spacing={1}>
                      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                        <Chip label={entry.category} size="small" sx={{ height: 22, fontSize: '0.65rem', fontWeight: 700 }} />
                        <Typography
                          component={RouterLink}
                          to={entry.path}
                          sx={{
                            fontWeight: 800,
                            fontSize: '1.05rem',
                            color: 'text.primary',
                            textDecoration: 'none',
                            '&:hover': { color: 'primary.main' },
                          }}
                        >
                          {entry.title}
                        </Typography>
                      </Stack>
                      <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled', fontFamily: 'ui-monospace, monospace' }}>
                        {entry.path}
                      </Typography>
                      <SnippetText parts={snippet.parts} />
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}
          </Stack>
        </Container>
      </Box>
    </PublicShell>
  );
}
