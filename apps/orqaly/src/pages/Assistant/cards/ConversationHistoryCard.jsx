import { useMemo, useState } from 'react';
import { Box, Typography, Button, TextField, InputAdornment } from '@mui/material';
import ChatRoundedIcon from '@mui/icons-material/ChatRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import KeyboardArrowRightRoundedIcon from '@mui/icons-material/KeyboardArrowRightRounded';
import BentoCard from '../../../components/Common/BentoCard';
import EmptyState from '../../../components/Common/EmptyState';
import { platformMeta } from '../platformMeta';
import { formatTimeAgo } from '../format';

import AppIcon from '../../../components/icons/AppIcon';

// On mobile the card has no fixed height (it hugs its content), so cap the
// list to ~4 rows and let the rest scroll internally instead of pushing the
// page down. On sm+ the BentoCard's fixed height + flex/overflow already
// caps the scroll area, so no explicit max is needed there.
const MOBILE_ROW_PX = 64;
const MOBILE_VISIBLE_ROWS = 4;

/** Conversation threads as a simple searchable list: icon, contact, last message, time ago. */
export default function ConversationHistoryCard({ conversations = [], onViewAll }) {
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => `${c.between} ${c.lastMessage}`.toLowerCase().includes(q));
  }, [conversations, query]);

  return (
    <BentoCard title="Conversations" icon={ChatRoundedIcon} plainHeader>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Search person or message"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <AppIcon name="SearchRounded" fallback={SearchRoundedIcon} sx={{ fontSize: 18 }} />
              </InputAdornment>
            ),
          }}
        />
        <Button
          onClick={onViewAll}
          endIcon={
            <AppIcon name="KeyboardArrowRightRounded" fallback={KeyboardArrowRightRoundedIcon} />
          }
          sx={{ textTransform: 'none', fontWeight: 700, color: 'primary.main', flexShrink: 0 }}
        >
          View all
        </Button>
      </Box>
      <Box
        sx={{
          overflow: 'auto',
          flex: 1,
          minHeight: 0,
          maxHeight: { xs: MOBILE_ROW_PX * MOBILE_VISIBLE_ROWS, sm: 'none' },
        }}
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={ChatRoundedIcon}
            title={query ? 'No matches' : 'No conversations yet'}
          />
        ) : (
          rows.map((c) => {
            const meta = platformMeta(c.platform);
            return (
              <Box
                key={c.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.25,
                  py: 1,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  '&:hover': { bgcolor: 'action.hover' },
                  '&:last-of-type': { borderBottom: 0 },
                }}
              >
                <AppIcon fallback={meta.Icon} sx={{ fontSize: 20, color: meta.color, flexShrink: 0 }} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }} noWrap>
                    {c.between}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {c.lastMessage}
                  </Typography>
                </Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                >
                  {formatTimeAgo(c.date)}
                </Typography>
              </Box>
            );
          })
        )}
      </Box>
    </BentoCard>
  );
}
