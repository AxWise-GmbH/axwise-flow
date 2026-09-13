import { Box, Typography, Button, alpha } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ForumRoundedIcon from '@mui/icons-material/ForumRounded';
import BentoCard from '../../../components/Common/BentoCard';
import { EditButton, StatusDot } from './_shared';
import { platformMeta } from '../platformMeta';
import ChannelsArt from './ChannelsArt';

import AppIcon from '../../../components/icons/AppIcon';

/** Connected channels with brand icon + handle + Connected status. Edit -> Channel step. */
export default function ChannelsCard({ channels = [], onEdit, onAddChannel }) {
  return (
    <BentoCard
      title="Channels"
      icon={ForumRoundedIcon}
      action={<EditButton onClick={onEdit} />}
      plainHeader
      scrollBody
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {channels.map((ch) => {
          const meta = platformMeta(ch.platform);
          const Icon = meta.Icon;
          return (
            <Box key={ch.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: alpha(meta.color, 0.16),
                  color: meta.color,
                  flexShrink: 0,
                }}
              >
                <AppIcon fallback={Icon} sx={{ fontSize: 20 }} />
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontWeight: 700, lineHeight: 1.2 }}>{meta.label}</Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  noWrap
                  sx={{ display: 'block' }}
                >
                  {ch.handle}
                </Typography>
              </Box>
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
                <StatusDot />
                <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 700 }}>
                  Connected
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Box>
      <Button
        onClick={onAddChannel}
        startIcon={<AppIcon name="AddRounded" fallback={AddRoundedIcon} />}
        sx={{
          mt: 1.5,
          alignSelf: 'flex-start',
          textTransform: 'none',
          fontWeight: 700,
          color: 'primary.main',
        }}
      >
        Add channel
      </Button>
      {/* Bouncing channel icons, pinned to the bottom to match the
          Profile & Brain pulse / Voice waveform footer. */}
      <Box sx={{ mt: 'auto' }}>
        <ChannelsArt />
      </Box>
    </BentoCard>
  );
}
