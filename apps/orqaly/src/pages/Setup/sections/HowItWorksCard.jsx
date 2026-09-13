import { useState } from 'react';
import { Box, Typography, Button, Collapse, useTheme, alpha } from '@mui/material';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import DevicesOutlinedIcon from '@mui/icons-material/DevicesOutlined';
import GlassIcon from '../../../components/icons/GlassIcon';
import { glowPillSx, cardHoverGlowSx } from '../../../theme/wizardGlow';

import AppIcon from '../../../components/icons/AppIcon';

const PILLARS = [
  {
    iconName: 'VpnKeyOutlined',
    Fallback: VpnKeyOutlinedIcon,
    title: 'Add LLM keys',
    body: "Start free on our partner's demo tier. When it runs out, add your own keys for LLMs, tools and services.",
  },
  {
    iconName: 'StorageOutlined',
    Fallback: StorageOutlinedIcon,
    title: 'Connect Database',
    body: 'Store your data in your own database, such as Supabase, with backups that stay fully yours.',
  },
  {
    iconName: 'FolderOutlined',
    Fallback: FolderOutlinedIcon,
    title: 'Connect Storage',
    body: 'Connect file storage such as Notion or Obsidian to bring in and organize your own data.',
  },
  {
    iconName: 'DevicesOutlined',
    Fallback: DevicesOutlinedIcon,
    title: 'Use local LLMs',
    body: 'Run models on your own hardware to stay private and cut the cost of paid cloud models.',
  },
];

const PRIVACY_MESSAGE =
  'This setup is designed to protect your privacy and give you full control over your information. ' +
  "We're simply a platform - we don't require your data or credentials. You're free to use it as you like.";

export default function HowItWorksCard() {
  const theme = useTheme();
  const tint = theme.palette.primary.main;
  const [expanded, setExpanded] = useState(false);

  return (
    <Box
      sx={{
        p: { xs: 2.5, sm: 3 },
        borderRadius: 3,
        border: '1px solid',
        borderColor: alpha(tint, 0.18),
        background: `linear-gradient(160deg, ${alpha(tint, 0.06)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 75%)`,
        ...cardHoverGlowSx(theme),
      }}
    >
      {/* Topic + Read More */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          flexWrap: 'wrap',
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              fontWeight: 800,
              letterSpacing: '0.10em',
              color: tint,
              textTransform: 'uppercase',
              fontSize: '0.66rem',
            }}
          >
            Setup
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.25 }}>
            Learn what you need to add
          </Typography>
        </Box>

        <Button
          variant="outlined"
          size="small"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          sx={glowPillSx(theme, { pulse: !expanded })}
        >
          {expanded ? 'Show less' : 'Read More'}
        </Button>
      </Box>
      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <Box sx={{ mt: 2.5 }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
              gap: 2,
            }}
          >
            {PILLARS.map((p) => (
              <Box key={p.title} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 2,
                    bgcolor: alpha(tint, 0.15),
                    color: tint,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: 'rotate(-2deg)',
                    border: '1px solid',
                    borderColor: alpha(tint, 0.18),
                  }}
                >
                  <GlassIcon name={p.iconName} fallback={p.Fallback} size={20} tone={tint} />
                </Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {p.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55 }}>
                  {p.body}
                </Typography>
              </Box>
            ))}
          </Box>

          {/* Privacy reassurance - framed, brand-tinted callout */}
          <Box
            sx={{
              mt: 2.5,
              p: { xs: 1.75, sm: 2 },
              borderRadius: 2.5,
              border: '1px solid',
              borderColor: alpha(tint, 0.3),
              background: alpha(tint, 0.06),
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1.5,
            }}
          >
            <Box
              sx={{
                flexShrink: 0,
                width: 36,
                height: 36,
                borderRadius: '50%',
                bgcolor: alpha(tint, 0.15),
                color: tint,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppIcon name="ShieldOutlined" fallback={ShieldOutlinedIcon} sx={{ fontSize: 20 }} />
            </Box>
            <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
              {PRIVACY_MESSAGE}
            </Typography>
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}
