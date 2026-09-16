import { useMemo, useState } from 'react';
import {
  Box,
  Chip,
  Divider,
  IconButton,
  ListSubheader,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import CircleIcon from '@mui/icons-material/Circle';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import ViewListIcon from '@mui/icons-material/ViewList';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import { TASK_MANAGER_SCOPES, TASK_MANAGER_TAGS } from '../../../data/taskManagerCategories';

import AppIcon from '../../icons/AppIcon';

const SCOPE_ICONS = {
  all: ViewListIcon,
  partners: HandshakeOutlinedIcon,
  team: GroupsOutlinedIcon,
  projects: FolderOutlinedIcon,
  agents: SmartToyOutlinedIcon,
};

const COLUMNS = [
  {
    title: 'Backlog',
    items: [
      { who: 'agent', name: 'Draft NDA for Acme Co', tag: 'Legal', scopes: ['team', 'agents', 'all'] },
      { who: 'human', name: 'Review Q4 budget', tag: 'Finance', scopes: ['team', 'all'] },
    ],
  },
  {
    title: 'In progress',
    items: [
      { who: 'agent', name: 'Email 12 dormant leads', tag: 'Sales', highlight: true, scopes: ['team', 'agents', 'projects', 'all'] },
      { who: 'agent', name: 'Generate weekly report', tag: 'Reports', scopes: ['team', 'agents', 'all'] },
    ],
  },
  {
    title: 'Done',
    items: [
      { who: 'agent', name: 'Refund queue cleared', tag: 'Ops', done: true, scopes: ['team', 'agents', 'all'] },
      { who: 'human', name: 'Sign Acme proposal', tag: 'Sales', done: true, scopes: ['partners', 'all'] },
    ],
  },
];

function itemMatchesScope(item, scopeId) {
  if (scopeId === 'all') return true;
  if (scopeId === 'agents') return item.who === 'agent';
  if (scopeId === 'team') return item.scopes?.includes('team');
  if (scopeId === 'partners') return item.scopes?.includes('partners');
  if (scopeId === 'projects') return item.scopes?.includes('projects');
  return true;
}

export default function DemoTaskManager() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [activeScope, setActiveScope] = useState('all');
  const [activeTag, setActiveTag] = useState(null);

  const filteredColumns = useMemo(() => {
    return COLUMNS.map((col) => ({
      ...col,
      items: col.items.filter((it) => {
        if (activeTag && it.tag !== activeTag) return false;
        return itemMatchesScope(it, activeScope);
      }),
    }));
  }, [activeScope, activeTag]);

  const activeScopeLabel = TASK_MANAGER_SCOPES.find((s) => s.id === activeScope)?.shortLabel
    || TASK_MANAGER_SCOPES.find((s) => s.id === activeScope)?.label
    || 'All';

  return (
    <Box
      sx={{
        position: 'relative',
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `0 20px 50px ${alpha(primary, 0.18)}`,
        p: { xs: 2, md: 2.5 },
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        <AppIcon
          name='Circle'
          fallback={CircleIcon}
          sx={{ fontSize: 8, color: primary, flexShrink: 0 }} />
        <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', color: 'text.primary', flex: 1, minWidth: 0 }}>
          Tasks · Marketing project
        </Typography>
        {(activeScope !== 'all' || activeTag) && (
          <Chip
            size="small"
            label={activeTag ? `${activeScopeLabel} · ${activeTag}` : activeScopeLabel}
            onDelete={() => {
              setActiveScope('all');
              setActiveTag(null);
            }}
            sx={{ height: 22, fontSize: '0.65rem', fontWeight: 700, maxWidth: 160 }}
          />
        )}
        <Tooltip title="Categories" placement="top">
          <IconButton
            size="small"
            onClick={(e) => setMenuAnchor(e.currentTarget)}
            aria-label="Task categories"
            aria-haspopup="true"
            aria-expanded={Boolean(menuAnchor)}
            sx={{
              border: `1px solid ${menuAnchor ? primary : theme.palette.divider}`,
              borderRadius: 2,
              bgcolor: menuAnchor ? alpha(primary, 0.08) : 'background.paper',
              '&:hover': { borderColor: primary, bgcolor: alpha(primary, 0.06) },
            }}
          >
            <AppIcon
              name='CategoryOutlined'
              fallback={CategoryOutlinedIcon}
              sx={{ fontSize: 18, color: menuAnchor ? 'primary.main' : 'text.secondary' }} />
          </IconButton>
        </Tooltip>
      </Stack>
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              minWidth: 260,
              maxWidth: 320,
              maxHeight: 420,
              borderRadius: 2,
              boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
            },
          },
        }}
        MenuListProps={{ 'aria-label': 'Task categories' }}
      >
        <ListSubheader sx={{ fontWeight: 800, fontSize: '0.68rem', letterSpacing: '0.08em', lineHeight: 2.5 }}>
          Views
        </ListSubheader>
        {TASK_MANAGER_SCOPES.map((scope) => {
          const Icon = SCOPE_ICONS[scope.id] || ViewListIcon;
          return (
            <MenuItem
              key={scope.id}
              selected={activeScope === scope.id && !activeTag}
              onClick={() => {
                setActiveScope(scope.id);
                setActiveTag(null);
                setMenuAnchor(null);
              }}
              sx={{ py: 1 }}
            >
              <Stack direction="row" spacing={1.25} alignItems="flex-start" sx={{ width: '100%' }}>
                <AppIcon fallback={Icon} sx={{ fontSize: 20, color: 'text.secondary', mt: 0.25 }} />
                <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>{scope.label}</Typography>
                  <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', lineHeight: 1.4 }}>
                    {scope.description}
                  </Typography>
                </Stack>
              </Stack>
            </MenuItem>
          );
        })}
        <Divider sx={{ my: 1 }} />
        <ListSubheader sx={{ fontWeight: 800, fontSize: '0.68rem', letterSpacing: '0.08em', lineHeight: 2.5 }}>
          Tags
        </ListSubheader>
        <Box sx={{ px: 1.5, pb: 1.5, display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {TASK_MANAGER_TAGS.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              size="small"
              clickable
              variant={activeTag === tag ? 'filled' : 'outlined'}
              color={activeTag === tag ? 'primary' : 'default'}
              onClick={() => {
                setActiveTag(activeTag === tag ? null : tag);
                setMenuAnchor(null);
              }}
              sx={{ fontSize: '0.72rem', fontWeight: 600 }}
            />
          ))}
        </Box>
      </Menu>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1.5 }}>
        {filteredColumns.map((col) => (
          <Stack key={col.title} spacing={1.25}>
            <Typography sx={{ fontWeight: 800, fontSize: '0.7rem', color: 'text.secondary', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {col.title}
            </Typography>
            {col.items.length === 0 ? (
              <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled', fontStyle: 'italic', py: 2 }}>
                No tasks in this view
              </Typography>
            ) : (
              col.items.map((it, i) => (
                <Stack
                  key={i}
                  direction="row"
                  spacing={1}
                  alignItems="flex-start"
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    border: `1px solid ${it.highlight ? alpha(primary, 0.5) : theme.palette.divider}`,
                    bgcolor: it.highlight ? alpha(primary, 0.05) : isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.015),
                    opacity: it.done ? 0.6 : 1,
                  }}
                >
                  {it.done ? (
                    <AppIcon
                      name='CheckCircleOutline'
                      fallback={CheckCircleOutlineIcon}
                      sx={{ color: 'primary.main', fontSize: 16, mt: '2px' }} />
                  ) : (
                    <AppIcon
                      name='RadioButtonUnchecked'
                      fallback={RadioButtonUncheckedIcon}
                      sx={{ color: 'text.secondary', fontSize: 16, mt: '2px' }} />
                  )}
                  <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: '0.82rem', color: 'text.primary', textDecoration: it.done ? 'line-through' : 'none' }}>
                      {it.name}
                    </Typography>
                    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                      {it.who === 'agent' ? (
                        <AppIcon
                          name='SmartToyOutlined'
                          fallback={SmartToyOutlinedIcon}
                          sx={{ fontSize: 12, color: 'primary.main' }} />
                      ) : (
                        <AppIcon
                          name='PersonOutline'
                          fallback={PersonOutlineIcon}
                          sx={{ fontSize: 12, color: 'text.secondary' }} />
                      )}
                      <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>{it.who}</Typography>
                      <Chip
                        label={it.tag}
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: '0.62rem',
                          fontWeight: 700,
                          bgcolor: activeTag === it.tag ? alpha(primary, 0.15) : alpha(primary, 0.06),
                          color: 'primary.main',
                        }}
                      />
                    </Stack>
                  </Stack>
                </Stack>
              ))
            )}
          </Stack>
        ))}
      </Box>
    </Box>
  );
}
