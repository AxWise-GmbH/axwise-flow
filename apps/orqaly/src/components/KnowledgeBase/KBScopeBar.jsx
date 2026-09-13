import { Box, Button, useTheme, alpha } from '@mui/material';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import AllInclusiveIcon from '@mui/icons-material/AllInclusive';

import AppIcon from '../icons/AppIcon';

const SCOPES = [
  { id: 'all', label: 'All', icon: AllInclusiveIcon },
  { id: 'user', label: 'My KB', icon: PersonOutlineIcon },
  { id: 'agent', label: 'Agents', icon: SmartToyOutlinedIcon },
  { id: 'team', label: 'Teams', icon: GroupsOutlinedIcon },
  { id: 'partner', label: 'Partners', icon: PeopleOutlinedIcon },
];

export default function KBScopeBar({ scope, onScopeChange, simplified = false }) {
  const theme = useTheme();
  const items = simplified ? SCOPES.filter((s) => s.id === 'all' || s.id === 'user') : SCOPES;

  return (
    <Box
      sx={{
        bgcolor: alpha(theme.palette.text.primary, 0.04),
        p: 0.5,
        borderRadius: 3,
        width: 'fit-content',
        display: 'flex',
      }}
    >
      {items.map((s) => (
        <Button
          key={s.id}
          startIcon={<AppIcon fallback={s.icon} sx={{ fontSize: 18 }} />}
          onClick={() => onScopeChange(s.id)}
          sx={{
            borderRadius: 2.5,
            textTransform: 'none',
            fontWeight: 700,
            fontSize: '0.82rem',
            bgcolor: scope === s.id ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
            color: scope === s.id ? 'primary.main' : 'text.secondary',
          }}
        >
          {s.label}
        </Button>
      ))}
    </Box>
  );
}
