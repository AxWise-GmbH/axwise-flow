import { useMemo, useState } from 'react';
import {
  Box,
  Checkbox,
  Typography,
  Stack,
  Collapse,
  Chip,
  IconButton,
  Tooltip,
  TextField,
  alpha,
  useTheme,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

import AppIcon from '../icons/AppIcon';

function groupEndpoints(endpoints) {
  const map = new Map();
  for (const ep of endpoints) {
    const cat = ep.category || 'General';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(ep);
  }
  return Array.from(map.entries())
    .map(([category, items]) => ({
      category,
      items: items.slice().sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

export default function ReplicatorEndpointPicker({ endpoints, selected, onChange }) {
  const theme = useTheme();
  const [filter, setFilter] = useState('');
  const [openCats, setOpenCats] = useState(() => new Set());

  const groups = useMemo(() => groupEndpoints(endpoints || []), [endpoints]);
  const selectedSet = useMemo(() => new Set(selected || []), [selected]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return groups;
    const q = filter.trim().toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (it) => it.name.toLowerCase().includes(q) || it.description?.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, filter]);

  const total = endpoints?.length || 0;
  const selCount = selectedSet.size;

  const toggleCat = (cat) => {
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toggleEndpoint = (id) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };

  const toggleCategory = (items) => {
    const next = new Set(selectedSet);
    const allSelected = items.every((it) => next.has(it.id));
    if (allSelected) {
      items.forEach((it) => next.delete(it.id));
    } else {
      items.forEach((it) => next.add(it.id));
    }
    onChange(Array.from(next));
  };

  const categoryState = (items) => {
    const selectedCount = items.filter((it) => selectedSet.has(it.id)).length;
    if (selectedCount === 0) return { checked: false, indeterminate: false };
    if (selectedCount === items.length) return { checked: true, indeterminate: false };
    return { checked: false, indeterminate: true };
  };

  return (
    <Stack spacing={1.5} sx={{ height: '100%' }}>
      <TextField
        size="small"
        placeholder="Filter endpoints…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          border: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.8),
          borderRadius: 1,
          bgcolor: theme.palette.background.default,
        }}
      >
        {filtered.length === 0 ? (
          <Box sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">
              No endpoints match your filter.
            </Typography>
          </Box>
        ) : (
          filtered.map((group) => {
            const { checked, indeterminate } = categoryState(group.items);
            const open = openCats.has(group.category) || filter.trim() !== '';
            return (
              <Box key={group.category} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1, py: 0.5 }}>
                  <Checkbox
                    size="small"
                    checked={checked}
                    indeterminate={indeterminate}
                    onChange={() => toggleCategory(group.items)}
                  />
                  <Box
                    sx={{ flex: 1, cursor: 'pointer' }}
                    onClick={() => toggleCat(group.category)}
                  >
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      {group.category}
                      <Typography
                        component="span"
                        variant="caption"
                        color="text.secondary"
                        sx={{ ml: 1 }}
                      >
                        {group.items.filter((it) => selectedSet.has(it.id)).length} /{' '}
                        {group.items.length}
                      </Typography>
                    </Typography>
                  </Box>
                  <IconButton size="small" onClick={() => toggleCat(group.category)}>
                    {open ? (
                      <AppIcon name="ExpandLess" fallback={ExpandLessIcon} fontSize="small" />
                    ) : (
                      <AppIcon name="ExpandMore" fallback={ExpandMoreIcon} fontSize="small" />
                    )}
                  </IconButton>
                </Stack>
                <Collapse in={open} unmountOnExit>
                  <Box sx={{ pl: 4, pr: 1, pb: 1 }}>
                    {group.items.map((ep) => (
                      <Stack key={ep.id} direction="row" alignItems="flex-start" spacing={1}>
                        <Checkbox
                          size="small"
                          checked={selectedSet.has(ep.id)}
                          onChange={() => toggleEndpoint(ep.id)}
                        />
                        <Box sx={{ flex: 1, minWidth: 0, py: 0.5 }}>
                          <Tooltip
                            title={ep.description || ''}
                            placement="top"
                            arrow
                            disableHoverListener={!ep.description}
                          >
                            <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                              {ep.name}
                            </Typography>
                          </Tooltip>
                          {ep.verb && ep.verb !== 'unknown' ? (
                            <Chip
                              size="small"
                              label={ep.verb}
                              variant="outlined"
                              color={ep.verb === 'read' ? 'success' : 'warning'}
                              sx={{ height: 18, fontSize: '0.6rem', mt: 0.25 }}
                            />
                          ) : null}
                        </Box>
                      </Stack>
                    ))}
                  </Box>
                </Collapse>
              </Box>
            );
          })
        )}
      </Box>
      <Typography variant="caption" color="text.secondary">
        {selCount} of {total} selected across {groups.length}{' '}
        {groups.length === 1 ? 'category' : 'categories'}.
      </Typography>
    </Stack>
  );
}
