/**
 * ChannelsArt - a row of gently floating channel icons (Telegram, WhatsApp,
 * email, WeChat, voice) used in the Channels card. Built with MUI brand icons +
 * CSS keyframes so the glyphs stay brand-accurate; the motion and accent match
 * the Voice waveform (per-icon offset float, honors prefers-reduced-motion).
 */
import { Box, alpha } from '@mui/material';
import { keyframes } from '@mui/system';
import TelegramIcon from '@mui/icons-material/Telegram';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import EmailRoundedIcon from '@mui/icons-material/EmailRounded';
import ForumRoundedIcon from '@mui/icons-material/ForumRounded';
import KeyboardVoiceRoundedIcon from '@mui/icons-material/KeyboardVoiceRounded';

import AppIcon from '../../../components/icons/AppIcon';

// Gentle bob - icons rise and settle, offset per index for an organic wave.
const float = keyframes`
  0%, 100% { transform: translateY(4px); }
  50% { transform: translateY(-4px); }
`;

// Breathing glow ring - a halo that pulses in intensity (and a touch of scale)
// around each icon. Animates only opacity/transform so one keyframe works for
// every brand color (the color lives on the ::after element's sx).
const haloPulse = keyframes`
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.12); }
`;

// Brand identity colors (not theme tokens), mirroring platformMeta. WeChat has
// no MUI logo, so it falls back to the closest chat glyph in its brand green.
const CHANNELS = [
  { key: 'telegram', Icon: TelegramIcon, color: '#229ED9' },
  { key: 'whatsapp', Icon: WhatsAppIcon, color: '#25D366' },
  { key: 'email', Icon: EmailRoundedIcon, color: '#EA4335' },
  { key: 'wechat', Icon: ForumRoundedIcon, color: '#07C160' },
  { key: 'voice', Icon: KeyboardVoiceRoundedIcon, color: '#7C5CFC' },
];

export default function ChannelsArt() {
  return (
    <Box
      data-testid="channels-art"
      sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1.25, py: 1.5 }}
    >
      {CHANNELS.map((ch, i) => {
        const Icon = ch.Icon;
        return (
          <Box
            key={ch.key}
            sx={{
              position: 'relative',
              width: 38,
              height: 38,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: ch.color,
              animation: `${float} ${2 + (i % 3) * 0.3}s ease-in-out ${(i % 5) * 0.18}s infinite`,
              // Glowing ring that breathes around the icon (brand-colored halo).
              '&::after': {
                content: '""',
                position: 'absolute',
                inset: -3,
                borderRadius: '50%',
                border: '2px solid',
                borderColor: alpha(ch.color, 0.6),
                boxShadow: `0 0 10px ${alpha(ch.color, 0.55)}, inset 0 0 6px ${alpha(ch.color, 0.35)}`,
                pointerEvents: 'none',
                animation: `${haloPulse} ${2 + (i % 3) * 0.25}s ease-in-out ${(i % 5) * 0.18}s infinite`,
              },
              '@media (prefers-reduced-motion: reduce)': {
                animation: 'none',
                '&::after': { animation: 'none', opacity: 0.6 },
              },
            }}
          >
            <AppIcon fallback={Icon} sx={{ fontSize: 20 }} />
          </Box>
        );
      })}
    </Box>
  );
}
