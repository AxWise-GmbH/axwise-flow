/**
 * [module: frontend]
 * OrgPickerList — searchable organization list for goal org dialogs.
 */
import { useMemo, useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  List,
  ListItemButton,
  ListItemText,
  CircularProgress,
} from '@mui/material';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';

import AppIcon from '../icons/AppIcon';

export default function OrgPickerList({ orgs, loading, goalTitle, onSelect }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return orgs;
    const q = search.toLowerCase();
    return orgs.filter((o) => (o.name || '').toLowerCase().includes(q));
  }, [orgs, search]);

  if (loading) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Select an organization for goal <b>&quot;{goalTitle}&quot;</b>:
      </Typography>
      <TextField
        size="small"
        fullWidth
        placeholder="Search organizations..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
      />
      {filtered.length === 0 ? (
        <Typography
          variant="body2"
          color="text.disabled"
          sx={{ fontStyle: 'italic', textAlign: 'center', py: 3 }}
        >
          {orgs.length === 0
            ? 'No organizations found. Create one on the Organizations page first.'
            : 'No organizations match your search.'}
        </Typography>
      ) : (
        <List sx={{ p: 0, maxHeight: 320, overflow: 'auto' }}>
          {filtered.map((org) => (
            <ListItemButton
              key={org.id}
              onClick={() => onSelect(org)}
              sx={{ borderRadius: 2, mb: 0.5, border: '1px solid', borderColor: 'divider' }}
            >
              <AppIcon
                name="BusinessOutlined"
                fallback={BusinessOutlinedIcon}
                sx={{ fontSize: 18, color: 'text.secondary', mr: 1 }}
              />
              <ListItemText
                primary={org.name}
                secondary={org.org_type || org.industry || undefined}
                primaryTypographyProps={{ fontWeight: 600, fontSize: '0.85rem' }}
                secondaryTypographyProps={{ fontSize: '0.7rem' }}
              />
            </ListItemButton>
          ))}
        </List>
      )}
    </Box>
  );
}
