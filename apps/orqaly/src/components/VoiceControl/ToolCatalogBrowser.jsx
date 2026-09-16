/**
 * ToolCatalogBrowser — categorized, searchable browser over the full
 * backend TOOL_CATALOG. Surfaced inside the "View Actions" Drawer (mobile)
 * and Dialog (desktop) below the existing Pending Actions section.
 *
 * Click a tool → calls onPickTool({ name, template }) so the parent can
 * populate the input with a natural-language template and close the panel.
 */
import { useMemo, useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItemButton,
  ListItemText,
  Chip,
  Skeleton,
  Alert,
  useTheme,
  alpha,
} from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';

import AppIcon from '../icons/AppIcon';

const CATEGORY_LABELS = {
  goal: 'Goals',
  partner: 'Partners',
  project: 'Projects',
  workflow: 'Workflows',
  task: 'Tasks',
  report: 'Reports',
  consilium: 'Consilium',
  kb: 'Knowledge Base',
  marketplace: 'Marketplace',
  invest: 'Investments',
  org: 'Organizations',
  organization: 'Organizations',
  agent: 'Agents',
  file: 'Files',
  tool: 'Tools',
  team: 'Teams',
  note: 'Notes',
  todo: 'Todos',
  request: 'Requests',
  job: 'Jobs',
  navigate: 'Navigation',
  system: 'System',
  settings: 'Settings',
};

const RISK_COLORS = {
  safe: { fg: '#7bd88f', bg: 'rgba(123, 216, 143, 0.14)', label: 'safe' },
  medium: { fg: '#ffb74d', bg: 'rgba(255, 183, 77, 0.14)', label: 'medium' },
  high: { fg: '#ff7676', bg: 'rgba(255, 118, 118, 0.16)', label: 'high' },
  critical: { fg: '#ff5252', bg: 'rgba(255, 82, 82, 0.22)', label: 'critical' },
};

function humanizeName(name, description) {
  // Generate a natural-language template the user can extend.
  // e.g. goal.create → "I want to create a new goal: "
  if (description) return description;
  return name;
}

function buildTemplate(tool) {
  const [category, action] = tool.name.split('.');
  const verbs = {
    create: 'create',
    update: 'update',
    delete: 'delete',
    archive: 'archive',
    list: 'list',
    get: 'show',
    summary: 'summarize',
    generate: 'generate',
    send: 'send',
    execute: 'run',
    toggle: 'toggle',
    discuss: 'discuss',
    search: 'search',
  };
  const verb = verbs[action] || action;
  const noun = CATEGORY_LABELS[category]?.toLowerCase().replace(/s$/, '') || category;
  if (action === 'list') return `${verb} my ${noun}s`;
  if (action === 'search') return `search the ${noun} for `;
  if (action === 'create') return `${verb} a new ${noun}: `;
  if (action === 'discuss') return `discuss `;
  if (action === 'summary' || action === 'generate' || action === 'send')
    return `${verb} a ${noun}`;
  return `${verb} ${noun} `;
}

export default function ToolCatalogBrowser({
  catalog,
  loading = false,
  error = null,
  onPickTool,
  compact = false,
}) {
  const theme = useTheme();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const tools = catalog?.tools || [];
    const q = query.trim().toLowerCase();
    const filteredTools = q
      ? tools.filter(
          (t) => t.name.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q)
        )
      : tools;

    const grouped = {};
    for (const t of filteredTools) {
      const cat = t.category || 'other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(t);
    }
    // Sort categories alphabetically by label
    return Object.entries(grouped).sort(([a], [b]) =>
      (CATEGORY_LABELS[a] || a).localeCompare(CATEGORY_LABELS[b] || b)
    );
  }, [catalog, query]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton
            key={i}
            variant="rounded"
            height={48}
            sx={{ bgcolor: alpha('#ffffff', 0.06) }}
          />
        ))}
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="warning" variant="outlined" sx={{ fontSize: '0.8rem' }}>
        Couldn&apos;t load command catalog. {error}
      </Alert>
    );
  }

  if (!catalog?.tools?.length) {
    return (
      <Typography variant="caption" sx={{ color: alpha('#ffffff', 0.6), fontStyle: 'italic' }}>
        No commands available.
      </Typography>
    );
  }

  const totalCount = catalog.tools.length;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <TextField
        size="small"
        autoFocus={!compact}
        fullWidth
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${totalCount} commands…`}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <AppIcon
                name="SearchRounded"
                fallback={SearchRoundedIcon}
                sx={{ fontSize: 18, color: alpha('#ffffff', 0.5) }}
              />
            </InputAdornment>
          ),
          sx: {
            fontSize: '0.85rem',
            bgcolor: alpha('#000000', 0.2),
            color: '#fff',
            minHeight: 44,
            '& fieldset': { borderColor: alpha('#ffffff', 0.12) },
            '&:hover fieldset': { borderColor: alpha('#ffffff', 0.2) },
          },
        }}
      />
      {filtered.length === 0 && (
        <Typography
          variant="caption"
          sx={{ color: alpha('#ffffff', 0.5), fontStyle: 'italic', textAlign: 'center', py: 2 }}
        >
          No commands match &quot;{query}&quot;.
        </Typography>
      )}
      {filtered.map(([cat, tools], idx) => (
        <Accordion
          key={cat}
          defaultExpanded={!!query || idx === 0}
          disableGutters
          elevation={0}
          sx={{
            bgcolor: 'transparent',
            border: '1px solid',
            borderColor: alpha('#ffffff', 0.08),
            borderRadius: 1.5,
            '&:before': { display: 'none' },
            '& .MuiAccordionSummary-root': { minHeight: 44, px: 1.5 },
            '& .MuiAccordionDetails-root': { p: 0 },
          }}
        >
          <AccordionSummary
            expandIcon={
              <AppIcon
                name="ExpandMoreRounded"
                fallback={ExpandMoreRoundedIcon}
                sx={{ color: alpha('#ffffff', 0.6) }}
              />
            }
          >
            <Typography
              variant="body2"
              sx={{ color: '#fff', fontWeight: 600, fontSize: '0.82rem' }}
            >
              {CATEGORY_LABELS[cat] || cat}
            </Typography>
            <Chip
              size="small"
              label={tools.length}
              sx={{
                ml: 1,
                height: 18,
                fontSize: '0.65rem',
                bgcolor: alpha('#ffffff', 0.08),
                color: alpha('#ffffff', 0.7),
              }}
            />
          </AccordionSummary>
          <AccordionDetails>
            <List dense disablePadding>
              {tools.map((t) => {
                const risk = RISK_COLORS[t.risk] || RISK_COLORS.safe;
                return (
                  <ListItemButton
                    key={t.name}
                    onClick={() => {
                      if (typeof onPickTool === 'function') {
                        onPickTool({ name: t.name, template: buildTemplate(t), tool: t });
                      }
                    }}
                    sx={{
                      minHeight: 44,
                      px: 1.5,
                      py: 0.5,
                      '&:hover': { bgcolor: alpha('#ffffff', 0.05) },
                    }}
                  >
                    <ListItemText
                      primary={
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.75,
                            flexWrap: 'wrap',
                          }}
                        >
                          <Typography
                            variant="body2"
                            sx={{ color: '#fff', fontSize: '0.78rem', fontWeight: 500 }}
                          >
                            {humanizeName(t.name, t.description)}
                          </Typography>
                          <Chip
                            size="small"
                            label={risk.label}
                            sx={{
                              height: 14,
                              fontSize: '0.58rem',
                              fontWeight: 700,
                              bgcolor: risk.bg,
                              color: risk.fg,
                              border: t.risk === 'critical' ? `1px solid ${risk.fg}` : 'none',
                              '& .MuiChip-label': { px: 0.5 },
                            }}
                          />
                        </Box>
                      }
                      secondary={
                        <Typography
                          variant="caption"
                          sx={{
                            color: alpha('#ffffff', 0.4),
                            fontSize: '0.68rem',
                            fontFamily: 'monospace',
                          }}
                        >
                          {t.name}
                        </Typography>
                      }
                    />
                  </ListItemButton>
                );
              })}
            </List>
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
}
