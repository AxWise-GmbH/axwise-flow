import { useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  IconButton,
  Tooltip,
  Link,
  Chip,
  Collapse,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  useTheme,
  alpha,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import StarIcon from '@mui/icons-material/Star';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import GitHubIcon from '@mui/icons-material/GitHub';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EmptyState from '../Common/EmptyState';

import AppIcon from '../icons/AppIcon';

const CAVEATS = [
  'Andrei curates the list — the "should we adopt this?" decision is still yours.',
  'LLM-extracted benefits can be shallow — skim the README yourself for anything that looks worth adopting.',
  'Stars ≠ quality. Hype cycles will show up in this list.',
];

function getMeta(doc) {
  const md = doc?.metadata || {};
  return {
    topic: md.topic || doc.title || '—',
    description: md.description || doc.content || '',
    link: md.link || doc.url || '',
    benefits: Array.isArray(md.benefits) ? md.benefits : [],
    stars: typeof md.stars === 'number' ? md.stars : 0,
  };
}

function shortUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, '')}${u.pathname}`.replace(/\/$/, '');
  } catch {
    return url;
  }
}

function formatStars(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

export default function KBGithubOffersTable({ offers = [], onView, onDelete, refreshButton }) {
  const theme = useTheme();
  const [orderBy, setOrderBy] = useState('stars');
  const [orderDir, setOrderDir] = useState('desc');
  const [caveatsOpen, setCaveatsOpen] = useState(true);

  const rows = useMemo(() => {
    const withMeta = offers.map((d) => ({ doc: d, ...getMeta(d) }));
    return withMeta.sort((a, b) => {
      const av = a[orderBy];
      const bv = b[orderBy];
      if (typeof av === 'number' && typeof bv === 'number') {
        return orderDir === 'asc' ? av - bv : bv - av;
      }
      return orderDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [offers, orderBy, orderDir]);

  const handleSort = (col) => {
    if (orderBy === col) {
      setOrderDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrderBy(col);
      setOrderDir(col === 'stars' ? 'desc' : 'asc');
    }
  };

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 1.5,
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        <Typography
          variant="overline"
          sx={{
            fontWeight: 700,
            color: 'text.secondary',
            letterSpacing: '0.08em',
            fontSize: '0.68rem',
          }}
        >
          {rows.length} offer{rows.length !== 1 ? 's' : ''} · curated by Andrei Volkov
        </Typography>
        {refreshButton}
      </Box>
      <Paper
        variant="outlined"
        sx={{
          mb: 1.5,
          borderRadius: 2,
          bgcolor: alpha(theme.palette.info.main, 0.04),
          borderColor: alpha(theme.palette.info.main, 0.3),
        }}
      >
        <Box
          onClick={() => setCaveatsOpen((v) => !v)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.5,
            py: 1,
            cursor: 'pointer',
            '&:hover': { bgcolor: alpha(theme.palette.info.main, 0.06) },
          }}
        >
          <AppIcon
            name="InfoOutlined"
            fallback={InfoOutlinedIcon}
            sx={{ fontSize: 18, color: 'info.main' }}
          />
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', flex: 1 }}>
            What this list is (and isn't)
          </Typography>
          <AppIcon
            name="ExpandMore"
            fallback={ExpandMoreIcon}
            sx={{
              fontSize: 20,
              color: 'text.secondary',
              transform: caveatsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }}
          />
        </Box>
        <Collapse in={caveatsOpen}>
          <Box
            component="ul"
            sx={{ m: 0, px: 1.5, pt: 0, pb: 1.25, pl: 4.5, color: 'text.secondary' }}
          >
            {CAVEATS.map((c) => (
              <Typography
                key={c}
                component="li"
                variant="body2"
                sx={{ mb: 0.25, fontSize: '0.82rem' }}
              >
                {c}
              </Typography>
            ))}
          </Box>
        </Collapse>
      </Paper>
      {rows.length === 0 ? (
        <EmptyState
          icon={GitHubIcon}
          title="No Github offers yet"
          description="Click Refresh offers, or wait for Andrei's next daily scan at 06:00 UTC."
        />
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: alpha(theme.palette.text.primary, 0.03) }}>
                <TableCell sx={{ fontWeight: 700, width: '18%' }}>
                  <TableSortLabel
                    active={orderBy === 'topic'}
                    direction={orderBy === 'topic' ? orderDir : 'asc'}
                    onClick={() => handleSort('topic')}
                  >
                    Topic
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 700, width: '32%' }}>Description</TableCell>
                <TableCell sx={{ fontWeight: 700, width: '18%' }}>Link</TableCell>
                <TableCell sx={{ fontWeight: 700, width: '22%' }}>Benefits</TableCell>
                <TableCell sx={{ fontWeight: 700, width: '8%' }} align="right">
                  <TableSortLabel
                    active={orderBy === 'stars'}
                    direction={orderBy === 'stars' ? orderDir : 'desc'}
                    onClick={() => handleSort('stars')}
                  >
                    Stars
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ width: 48 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(({ doc, topic, description, link, benefits, stars }) => (
                <TableRow
                  key={doc.id}
                  hover
                  onClick={() => onView?.(doc)}
                  sx={{ cursor: 'pointer', '&:last-child td': { borderBottom: 0 } }}
                >
                  <TableCell sx={{ verticalAlign: 'top', py: 1.25 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {topic}
                    </Typography>
                    {doc.title && doc.title !== topic && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block' }}
                      >
                        {doc.title}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ verticalAlign: 'top', py: 1.25 }}>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {description}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ verticalAlign: 'top', py: 1.25 }}>
                    {link ? (
                      <Link
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        underline="hover"
                        sx={{
                          fontSize: '0.8rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 0.5,
                        }}
                      >
                        {shortUrl(link)}
                        <AppIcon name="OpenInNew" fallback={OpenInNewIcon} sx={{ fontSize: 12 }} />
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell sx={{ verticalAlign: 'top', py: 1.25 }}>
                    {benefits.length === 0 ? (
                      <Typography variant="caption" color="text.disabled">
                        —
                      </Typography>
                    ) : (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {benefits.slice(0, 3).map((b, i) => (
                          <Chip
                            key={`${doc.id}-b-${i}`}
                            label={b}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.68rem', height: 20 }}
                          />
                        ))}
                        {benefits.length > 3 && (
                          <Chip
                            label={`+${benefits.length - 3}`}
                            size="small"
                            sx={{ fontSize: '0.68rem', height: 20 }}
                          />
                        )}
                      </Box>
                    )}
                  </TableCell>
                  <TableCell align="right" sx={{ verticalAlign: 'top', py: 1.25 }}>
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4 }}>
                      <AppIcon
                        name="Star"
                        fallback={StarIcon}
                        sx={{ fontSize: 14, color: 'warning.main' }}
                      />
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {formatStars(stars)}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ verticalAlign: 'top', py: 0.5 }} align="right">
                    {onDelete && (
                      <Tooltip title="Delete offer">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(doc);
                          }}
                          sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}
                        >
                          <AppIcon
                            name="DeleteOutline"
                            fallback={DeleteOutlineIcon}
                            sx={{ fontSize: 18 }}
                          />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
