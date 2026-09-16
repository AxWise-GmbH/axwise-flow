import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Checkbox,
  Chip,
  CircularProgress,
  InputAdornment,
  TextField,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { listDocuments } from '../../../../services/knowledgeBaseService';
import { CATEGORY_GROUP_LIST } from '../../../../utils/kbConstants';

/**
 * Browse the Knowledge Base by category and pick documents for a goal.
 *
 * Only the ids leave the browser. The server resolves ownership, organization
 * scope and content, so document text never makes a round trip and a crafted
 * request cannot smuggle in a document the user does not own.
 *
 * The picker deliberately does not filter by organization. The list endpoint
 * matches organization_id exactly and cannot express "this org OR unscoped",
 * so filtering here would hide every personal document. The server rejects a
 * cross-org pick with a clear message instead.
 */
export default function KbPicker({ selectedIds, onToggle, remainingSlots }) {
  const theme = useTheme();
  const [group, setGroup] = useState('');
  const [search, setSearch] = useState('');
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Guards against an out-of-order response overwriting a newer filter.
  const requestRef = useRef(0);

  const selected = useMemo(() => new Set(selectedIds || []), [selectedIds]);
  const atCapacity = remainingSlots <= 0;

  const load = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    setError('');
    try {
      const rows = await listDocuments({
        category_group: group || undefined,
        search_text: search.trim() || undefined,
        limit: 50,
      });
      if (requestRef.current !== requestId) return;
      setDocuments(Array.isArray(rows) ? rows : []);
    } catch (err) {
      if (requestRef.current !== requestId) return;
      setError(err?.message || 'Could not load your knowledge base.');
      setDocuments([]);
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }, [group, search]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          gap: 0.5,
          overflowX: 'auto',
          pb: 0.5,
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {CATEGORY_GROUP_LIST.map((option) => (
          <Chip
            key={option.value || 'all'}
            label={option.label}
            size="small"
            color={group === option.value ? 'primary' : 'default'}
            variant={group === option.value ? 'filled' : 'outlined'}
            onClick={() => setGroup(option.value)}
            sx={{ fontWeight: 600, fontSize: '0.68rem', flexShrink: 0, cursor: 'pointer' }}
          />
        ))}
      </Box>

      <TextField
        fullWidth
        size="small"
        placeholder="Search your knowledge base"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        sx={{ mt: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        slotProps={{
          input: {
            'aria-label': 'Search your knowledge base',
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          },
        }}
      />

      {error && (
        <Alert severity="warning" sx={{ mt: 1, fontSize: '0.75rem', py: 0.25 }}>
          {error}
        </Alert>
      )}

      <Box
        role="group"
        aria-label="Knowledge base documents"
        sx={{
          mt: 1,
          maxHeight: { xs: '45dvh', sm: 260 },
          overflowY: 'auto',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={20} />
          </Box>
        )}

        {!loading && documents.length === 0 && !error && (
          <Typography
            variant="caption"
            sx={{ display: 'block', color: 'text.secondary', px: 1.5, py: 2.5 }}
          >
            {search || group
              ? 'Nothing here matches. Try another category or search.'
              : 'Your knowledge base is empty. Upload a file below instead.'}
          </Typography>
        )}

        {!loading &&
          documents.map((row) => {
            const isSelected = selected.has(row.id);
            const blocked = !isSelected && atCapacity;
            return (
              <Box
                key={row.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1,
                  minHeight: 44,
                  opacity: blocked ? 0.45 : 1,
                  borderBottom: '1px solid',
                  borderColor: alpha(theme.palette.divider, 0.6),
                  '&:last-of-type': { borderBottom: 'none' },
                }}
              >
                <Checkbox
                  size="small"
                  checked={isSelected}
                  disabled={blocked}
                  onChange={() => onToggle(row)}
                  slotProps={{ input: { 'aria-label': `Select ${row.title || 'Untitled'}` } }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    noWrap
                    sx={{ fontSize: '0.82rem', fontWeight: isSelected ? 600 : 400 }}
                  >
                    {row.title || row.file_name || 'Untitled'}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.disabled', fontSize: '0.65rem' }}
                  >
                    {row.category || 'uncategorized'}
                  </Typography>
                </Box>
              </Box>
            );
          })}
      </Box>

      <Typography
        variant="caption"
        sx={{ display: 'block', mt: 0.75, color: atCapacity ? 'warning.main' : 'text.disabled' }}
      >
        {atCapacity
          ? 'No slots left. Remove something to add another.'
          : `${remainingSlots} ${remainingSlots === 1 ? 'slot' : 'slots'} left`}
      </Typography>
    </Box>
  );
}
