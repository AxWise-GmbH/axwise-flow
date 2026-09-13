import { Box, Typography, Button, alpha } from '@mui/material';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import KeyboardArrowRightRoundedIcon from '@mui/icons-material/KeyboardArrowRightRounded';
import BentoCard from '../../../components/Common/BentoCard';
import AgentAvatar from '../../../components/AgentHub/AgentAvatar';
import { SectionLabel } from './_shared';
import { platformMeta } from '../platformMeta';

import AppIcon from '../../../components/icons/AppIcon';

/**
 * Co-worker <-> assistant comms: a team chat feed plus the knowledge items
 * team members contributed (attributed via knowledge_document_versions author).
 */
export default function TeamCommsCard({
  teamChat = [],
  contributions = [],
  onOpenChat,
  onViewContributions,
}) {
  return (
    <BentoCard title="Contributions" icon={GroupsRoundedIcon} plainHeader scrollBody>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: { xs: 2.5, md: 3 },
        }}
      >
        {/* Team chat feed */}
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          <SectionLabel>Team chat</SectionLabel>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
            {teamChat.map((m) => (
              <Box key={m.id} sx={{ display: 'flex', gap: 1.25 }}>
                <AgentAvatar profile={{ display_name: m.author }} size="small" />
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
                      {m.author}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {m.time}
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {m.message}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
          <Button
            onClick={onOpenChat}
            endIcon={
              <AppIcon name="KeyboardArrowRightRounded" fallback={KeyboardArrowRightRoundedIcon} />
            }
            sx={{
              mt: 1.5,
              alignSelf: 'flex-start',
              textTransform: 'none',
              fontWeight: 700,
              color: 'primary.main',
              px: 0,
            }}
          >
            Go to team chat
          </Button>
        </Box>

        {/* Knowledge contributions */}
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          <SectionLabel>Knowledge contributions</SectionLabel>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
            {contributions.map((c) => {
              const meta = platformMeta(c.source);
              const Icon = meta.Icon;
              return (
                <Box
                  key={c.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.25,
                    p: 1,
                    borderRadius: 1.5,
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: 1.5,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: alpha(meta.color, 0.16),
                      color: meta.color,
                      flexShrink: 0,
                    }}
                  >
                    <AppIcon fallback={Icon} sx={{ fontSize: 18 }} />
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }} noWrap>
                      {c.title}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      noWrap
                      sx={{ display: 'block' }}
                    >
                      {c.source} · {c.words.toLocaleString()} words
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>
                      by {c.author}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {c.time}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
          <Button
            onClick={onViewContributions}
            sx={{
              mt: 1.5,
              alignSelf: 'flex-start',
              textTransform: 'none',
              fontWeight: 700,
              color: 'primary.main',
              px: 0,
            }}
          >
            View all contributions
          </Button>
        </Box>
      </Box>
    </BentoCard>
  );
}
