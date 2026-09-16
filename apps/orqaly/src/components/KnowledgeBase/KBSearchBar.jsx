import { Box, TextField, InputAdornment, Button, useTheme, alpha } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';

import AppIcon from '../icons/AppIcon';

const TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'note', label: 'Notes' },
  { key: 'file', label: 'Files' },
  { key: 'link', label: 'Links' },
  { key: 'template', label: 'Templates' },
];

export default function KBSearchBar({ search, onSearchChange, contentType, onContentTypeChange }) {
  const theme = useTheme();

  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
      <TextField
        size="small"
        placeholder="Search knowledge..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <AppIcon name="Search" fallback={SearchIcon} sx={{ fontSize: 18 }} />
            </InputAdornment>
          ),
        }}
        sx={{
          minWidth: 200,
          flex: 1,
          maxWidth: 340,
          '& .MuiInputBase-input': { fontSize: '0.82rem' },
        }}
      />
      <Box
        sx={{
          display: 'flex',
          gap: 0.5,
          bgcolor: alpha(theme.palette.text.primary, 0.04),
          borderRadius: 2.5,
          p: 0.5,
        }}
      >
        {TYPE_FILTERS.map((f) => (
          <Button
            key={f.key}
            size="small"
            onClick={() => onContentTypeChange(f.key)}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.72rem',
              bgcolor:
                contentType === f.key ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
              color: contentType === f.key ? 'primary.main' : 'text.secondary',
              minWidth: 'auto',
              px: 1,
            }}
          >
            {f.label}
          </Button>
        ))}
      </Box>
    </Box>
  );
}
