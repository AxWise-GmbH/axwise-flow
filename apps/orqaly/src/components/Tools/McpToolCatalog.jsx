/**
 * MCP Tool Catalog — professional browsable grid of Composio-powered integrations.
 *
 * Features:
 *  - Search + subcategory filter chips + popular filter
 *  - 3-column responsive grid with enhanced tool cards
 *  - Click card → opens McpToolDetail dialog (Overview / Connect / Documentation)
 *  - Fetches Composio connection status on mount
 */
import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  InputAdornment,
  Chip,
  useTheme,
  alpha,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import StarIcon from '@mui/icons-material/Star';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import { MCP_SUBCATEGORIES, getMcpAppById } from '../../config/mcpToolCatalog';
import { fetchComposioConnections } from '../../services/composioService';
import McpToolDetail from './McpToolDetail';
import ToolIcon from '../icons/ToolIcon';
import { createHoverGlowShadow } from '../../theme/hoverGlow';

import AppIcon from '../icons/AppIcon';

// ── Subcategory colors (deterministic by index) ─────────────────
const CHIP_COLORS = [
  '#6366F1',
  '#EC4899',
  '#14B8A6',
  '#F59E0B',
  '#8B5CF6',
  '#EF4444',
  '#3B82F6',
  '#10B981',
  '#F97316',
];

function getSubcategoryColor(sub) {
  const idx = MCP_SUBCATEGORIES.indexOf(sub);
  return CHIP_COLORS[idx >= 0 ? idx % CHIP_COLORS.length : 0];
}

export default function McpToolCatalog({ tools = [], onToolUpdated }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const [search, setSearch] = useState('');
  const [subcategoryFilter, setSubcategoryFilter] = useState('All');
  const [popularOnly, setPopularOnly] = useState(false);
  const [selectedTool, setSelectedTool] = useState(null);
  const [connections, setConnections] = useState([]);

  // Fetch Composio connections on mount
  useEffect(() => {
    let cancelled = false;
    fetchComposioConnections()
      .then((conns) => {
        if (!cancelled) setConnections(conns);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToolUpdated = useCallback(() => {
    onToolUpdated?.();
    // Refresh connections
    fetchComposioConnections()
      .then(setConnections)
      .catch(() => {});
  }, [onToolUpdated]);

  // Build subcategory list from actual tool data
  const subcategories = useMemo(() => {
    const set = new Set();
    tools.forEach((t) => {
      const sub = t.data?.subcategory || t.subcategory;
      if (sub) set.add(sub);
    });
    return MCP_SUBCATEGORIES.filter((s) => set.has(s));
  }, [tools]);

  const filtered = useMemo(() => {
    let list = [...tools];

    if (popularOnly) {
      list = list.filter((t) => {
        const entry = getMcpAppById(t.id);
        return entry?.popular;
      });
    }

    if (subcategoryFilter !== 'All') {
      list = list.filter((t) => (t.data?.subcategory || t.subcategory) === subcategoryFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (t) =>
          (t.name || '').toLowerCase().includes(q) ||
          (t.description || '').toLowerCase().includes(q) ||
          (t.data?.subcategory || t.subcategory || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [tools, search, subcategoryFilter, popularOnly]);

  const selectedCatalogEntry = selectedTool ? getMcpAppById(selectedTool.id) : null;

  return (
    <Box sx={{ p: { xs: 1.25, sm: 1.5 } }}>
      {/* ── Search + filter chips ─────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search MCP tools…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <AppIcon
                    name="SearchOutlined"
                    fallback={SearchIcon}
                    sx={{ fontSize: 18, color: 'text.secondary' }}
                  />
                </InputAdornment>
              ),
            },
          }}
          sx={{ minWidth: 220, maxWidth: 320 }}
        />

        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          <Chip
            label="All"
            size="small"
            variant={subcategoryFilter === 'All' && !popularOnly ? 'filled' : 'outlined'}
            onClick={() => {
              setSubcategoryFilter('All');
              setPopularOnly(false);
            }}
            sx={{ fontWeight: 600, fontSize: '0.75rem' }}
          />
          <Chip
            icon={
              <AppIcon
                name="Star"
                fallback={StarIcon}
                sx={{
                  fontSize: '14px !important',
                  color: popularOnly ? '#F59E0B !important' : undefined,
                }}
              />
            }
            label="Popular"
            size="small"
            variant={popularOnly ? 'filled' : 'outlined'}
            onClick={() => {
              setPopularOnly(!popularOnly);
              setSubcategoryFilter('All');
            }}
            sx={{
              fontWeight: 600,
              fontSize: '0.75rem',
              ...(popularOnly && {
                bgcolor: alpha('#F59E0B', 0.15),
                color: '#F59E0B',
                borderColor: '#F59E0B',
              }),
            }}
          />
          {subcategories.map((sub) => {
            const color = getSubcategoryColor(sub);
            const isActive = subcategoryFilter === sub;
            return (
              <Chip
                key={sub}
                label={sub}
                size="small"
                variant={isActive ? 'filled' : 'outlined'}
                onClick={() => {
                  setSubcategoryFilter(sub);
                  setPopularOnly(false);
                }}
                sx={{
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  borderColor: alpha(color, 0.4),
                  ...(isActive && {
                    bgcolor: alpha(color, 0.15),
                    color,
                    borderColor: color,
                  }),
                }}
              />
            );
          })}
        </Box>
      </Box>
      {/* ── Tool grid ─────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <Box sx={{ py: 6, textAlign: 'center' }}>
          <AppIcon
            name="ExtensionOutlined"
            fallback={ExtensionOutlinedIcon}
            sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}
          />
          <Typography variant="body2" color="text.secondary">
            No MCP tools found.{' '}
            {popularOnly
              ? 'Try removing the Popular filter.'
              : 'Tools are seeded automatically on first load.'}
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gap: 1.5,
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
            },
          }}
        >
          {filtered.map((tool) => {
            const sub = tool.data?.subcategory || tool.subcategory || '';
            const subColor = getSubcategoryColor(sub);
            const isActive = tool.status === 'active';
            const catalogEntry = getMcpAppById(tool.id);
            const actionCount = catalogEntry?.actions?.length || 0;
            const isPopular = catalogEntry?.popular;

            return (
              <Paper
                key={tool.id}
                elevation={0}
                onClick={() => setSelectedTool(tool)}
                sx={{
                  p: 2,
                  borderRadius: 2.5,
                  border: '1px solid',
                  borderColor: isActive ? alpha(subColor, 0.3) : 'divider',
                  background: isActive
                    ? `linear-gradient(135deg, ${alpha(subColor, 0.06)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`
                    : undefined,
                  cursor: 'pointer',
                  transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.15s',
                  '&:hover': {
                    borderColor: 'primary.main',
                    boxShadow: createHoverGlowShadow(theme),
                    transform: 'translateY(-1px)',
                  },
                }}
              >
                {/* Header */}
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    mb: 1,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                    <ToolIcon
                      tool={catalogEntry || tool}
                      tileSize={32}
                      size={16}
                      subColor={subColor}
                    />
                    <Box sx={{ minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography
                          variant="subtitle2"
                          sx={{ fontWeight: 700, lineHeight: 1.3 }}
                          noWrap
                        >
                          {tool.name}
                        </Typography>
                        {isPopular && (
                          <AppIcon
                            name="Star"
                            fallback={StarIcon}
                            sx={{ fontSize: 12, color: '#F59E0B' }}
                          />
                        )}
                      </Box>
                    </Box>
                  </Box>

                  {isActive ? (
                    <AppIcon
                      name="CheckCircleOutline"
                      fallback={CheckCircleOutlineIcon}
                      sx={{ fontSize: 16, color: 'success.main', flexShrink: 0, mt: 0.3 }}
                    />
                  ) : (
                    <AppIcon
                      name="LinkOff"
                      fallback={LinkOffIcon}
                      sx={{ fontSize: 16, color: 'text.disabled', flexShrink: 0, mt: 0.3 }}
                    />
                  )}
                </Box>
                {/* Description */}
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    lineHeight: 1.5,
                    mb: 1.5,
                    minHeight: '2.5em',
                  }}
                >
                  {tool.description}
                </Typography>
                {/* Footer chips */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Chip
                    label={sub}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      bgcolor: alpha(subColor, isDark ? 0.12 : 0.08),
                      color: subColor,
                    }}
                  />
                  {actionCount > 0 && (
                    <Chip
                      icon={
                        <AppIcon
                          name="BoltOutlined"
                          fallback={BoltOutlinedIcon}
                          sx={{ fontSize: '12px !important', color: 'inherit !important' }}
                        />
                      }
                      label={`${actionCount} actions`}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '0.65rem',
                        fontWeight: 600,
                        bgcolor: alpha(theme.palette.text.primary, 0.05),
                        color: 'text.secondary',
                      }}
                    />
                  )}
                  <Chip
                    label={isActive ? 'Connected' : 'Inactive'}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      ml: 'auto',
                      bgcolor: isActive
                        ? alpha(theme.palette.success.main, 0.1)
                        : alpha(theme.palette.text.disabled, 0.08),
                      color: isActive ? 'success.main' : 'text.disabled',
                    }}
                  />
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}
      {/* ── Detail Dialog ──────────────────────────────────── */}
      <McpToolDetail
        open={!!selectedTool}
        onClose={() => setSelectedTool(null)}
        tool={selectedTool}
        catalogEntry={selectedCatalogEntry}
        connections={connections}
        onToolUpdated={handleToolUpdated}
      />
    </Box>
  );
}
