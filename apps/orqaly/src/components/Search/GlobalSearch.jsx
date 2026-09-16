import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Popover,
  TextField,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
  alpha,
  useTheme,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import EventIcon from '@mui/icons-material/Event';
import { usePartners } from '../../hooks/usePartners';
import { meetingService } from '../../services/meetingService';

import AppIcon from '../icons/AppIcon';

const MAX_RESULTS = 8;

function SearchResultItem({ item, onClick }) {
  const theme = useTheme();
  return (
    <ListItemButton
      dense
      onClick={() => onClick(item)}
      sx={{
        borderRadius: 1.5,
        mx: 0.5,
        mb: 0.25,
        '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.08) },
      }}
    >
      <ListItemIcon sx={{ minWidth: 40 }}>
        {item.type === 'partner' && (
          <AppIcon
            name="PersonOutlined"
            fallback={PersonOutlinedIcon}
            fontSize="small"
            color="primary"
          />
        )}
        {item.type === 'task' && (
          <AppIcon
            name="TaskAltOutlined"
            fallback={TaskAltOutlinedIcon}
            fontSize="small"
            color="secondary"
          />
        )}
        {item.type === 'meeting' && (
          <AppIcon name="Event" fallback={EventIcon} fontSize="small" color="success" />
        )}
      </ListItemIcon>
      <ListItemText
        primary={item.title}
        secondary={item.subtitle}
        primaryTypographyProps={{ fontWeight: 600, fontSize: '0.9rem' }}
        secondaryTypographyProps={{ fontSize: '0.75rem', color: 'text.secondary' }}
      />
    </ListItemButton>
  );
}

export default function GlobalSearch({ open, anchorEl, onClose, onOpenChange }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const { partners } = usePartners();
  const [query, setQuery] = useState('');
  const [meetings, setMeetings] = useState([]);
  const [meetingsLoading, setMeetingsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setQuery('');
      setMeetingsLoading(true);
      meetingService
        .getAll()
        .then(setMeetings)
        .finally(() => setMeetingsLoading(false));
    }
  }, [open]);

  const results = useMemo(() => {
    const q = (query || '').trim().toLowerCase();
    if (!q || q.length < 2) return { partners: [], tasks: [], meetings: [] };

    const partnerMatches = partners.filter(
      (p) =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q) ||
        (p.trafficSource || '').toLowerCase().includes(q)
    );

    const taskItems = [];
    partners.forEach((p) => {
      (p.tasks || []).forEach((t) => {
        const title = (t.title || '').toLowerCase();
        if (title.includes(q)) {
          taskItems.push({
            type: 'task',
            id: t.id,
            title: t.title || 'Untitled task',
            subtitle: `${p.name} · ${t.status || 'open'}`,
            partnerId: p.id,
          });
        }
      });
    });

    const meetingMatches = meetings.filter(
      (m) =>
        (m.title || '').toLowerCase().includes(q) ||
        (m.organizer || '').toLowerCase().includes(q) ||
        (m.participants || []).some((x) => String(x).toLowerCase().includes(q))
    );

    return {
      partners: partnerMatches.slice(0, MAX_RESULTS),
      tasks: taskItems.slice(0, MAX_RESULTS),
      meetings: meetingMatches.slice(0, MAX_RESULTS),
    };
  }, [query, partners, meetings]);

  const handleSelect = useCallback(
    (item) => {
      if (item.type === 'partner') {
        navigate(`/partners/${item.id}`);
      } else if (item.type === 'task') {
        navigate(`/task-manager`);
      } else if (item.type === 'meeting') {
        const p = partners.find((x) => x.id === item.partnerId);
        if (p) navigate(`/partners/${p.id}`);
        else navigate('/partners');
      }
      onClose?.();
      onOpenChange?.(false);
    },
    [navigate, onClose, onOpenChange, partners]
  );

  const flatResults = useMemo(() => {
    const items = [];
    results.partners.forEach((p) =>
      items.push({ ...p, type: 'partner', title: p.name, subtitle: p.email || p.funnelStatus })
    );
    results.tasks.forEach((t) => items.push(t));
    results.meetings.forEach((m) =>
      items.push({
        type: 'meeting',
        id: m.id,
        title: m.title || 'Meeting',
        subtitle: m.datetime ? new Date(m.datetime).toLocaleDateString() : '',
        partnerId: m.partnerId,
      })
    );
    return items.slice(0, 12);
  }, [results]);

  const hasResults = flatResults.length > 0;
  const showPopover = open && Boolean(anchorEl);

  return (
    <Popover
      open={showPopover}
      anchorEl={anchorEl}
      onClose={() => {
        onClose?.();
        onOpenChange?.(false);
      }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      slotProps={{
        paper: {
          sx: {
            mt: 1,
            minWidth: 400,
            maxWidth: 480,
            borderRadius: 2.5,
            boxShadow: theme.shadows[8],
            overflow: 'hidden',
          },
        },
      }}
    >
      <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search partners, tasks, meetings..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <AppIcon
                  name="Search"
                  fallback={SearchIcon}
                  sx={{ color: 'text.secondary', fontSize: 20 }}
                />
              </InputAdornment>
            ),
            sx: { borderRadius: 2, bgcolor: 'action.hover' },
          }}
        />
      </Box>
      <Box sx={{ maxHeight: 360, overflow: 'auto', py: 0.5 }}>
        {query.trim().length < 2 ? (
          <Box sx={{ px: 2, py: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Type at least 2 characters to search
            </Typography>
          </Box>
        ) : meetingsLoading && meetings.length === 0 ? (
          <Box sx={{ px: 2, py: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Loading…
            </Typography>
          </Box>
        ) : !hasResults ? (
          <Box sx={{ px: 2, py: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              No results for &quot;{query}&quot;
            </Typography>
          </Box>
        ) : (
          <List dense disablePadding>
            {flatResults.map((item) => (
              <SearchResultItem
                key={`${item.type}-${item.id}`}
                item={item}
                onClick={handleSelect}
              />
            ))}
          </List>
        )}
      </Box>
    </Popover>
  );
}
