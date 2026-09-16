import {
  Box,
  Typography,
  Avatar,
  Stack,
  Button,
  alpha,
  useTheme,
} from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import CloseIcon from '@mui/icons-material/Close';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';

import AppIcon from '../../icons/AppIcon';

export default function DemoAIAgentDNA() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
      }}
    >
      <Box
        sx={{
          width: '100%',
          height: '100%',
          bgcolor: isDark ? alpha('#111318', 0.8) : alpha('#ffffff', 0.9),
          borderRadius: 4,
          border: `1px solid ${isDark ? alpha('#ffffff', 0.1) : alpha('#000', 0.1)}`,
          backdropFilter: 'blur(20px)',
          overflow: 'hidden',
          boxShadow: isDark 
            ? `0 24px 64px ${alpha('#000', 0.6)}`
            : `0 24px 64px ${alpha('#000', 0.1)}`,
          display: 'flex',
          flexDirection: 'column',
          '& *': {
            fontFamily: '"Inter", "Roboto", sans-serif',
          }
        }}
      >
        {/* Header */}
        <Box sx={{ p: 3, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Avatar 
              src="/assets/veronika_avatar.png" 
              sx={{ width: 64, height: 64, border: `2px solid ${alpha(primary, 0.5)}` }}
            />
            <Box>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', color: 'text.primary', textTransform: 'uppercase' }}>
                  VERONIKA HORVAT
                </Typography>
                <Stack direction="row" sx={{ color: alpha(theme.palette.text.primary, 0.2) }}>
                  <AppIcon name='Star' fallback={StarIcon} sx={{ fontSize: 16 }} />
                  <AppIcon name='StarBorder' fallback={StarBorderIcon} sx={{ fontSize: 16 }} />
                  <AppIcon name='StarBorder' fallback={StarBorderIcon} sx={{ fontSize: 16 }} />
                  <AppIcon name='StarBorder' fallback={StarBorderIcon} sx={{ fontSize: 16 }} />
                  <AppIcon name='StarBorder' fallback={StarBorderIcon} sx={{ fontSize: 16 }} />
                </Stack>
              </Stack>
              <Typography sx={{ color: 'text.secondary', fontSize: '0.9rem', mt: 0.5 }}>
                CFO
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ color: 'text.secondary' }}>
            <Box sx={{ p: 1, borderRadius: '50%', bgcolor: alpha(theme.palette.text.primary, 0.05), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AppIcon name='MenuBook' fallback={MenuBookIcon} sx={{ fontSize: 18 }} />
            </Box>
            <Box sx={{ p: 1, borderRadius: '50%', bgcolor: alpha(theme.palette.text.primary, 0.05), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AppIcon name='Close' fallback={CloseIcon} sx={{ fontSize: 18 }} />
            </Box>
          </Stack>
        </Box>

        {/* Tabs */}
        <Stack direction="row" spacing={3} sx={{ px: 3, borderBottom: `1px solid ${alpha(theme.palette.text.primary, 0.1)}` }}>
          {['Profile', 'Core', 'Activity', 'Chat'].map((tab, i) => (
            <Typography
              key={tab}
              sx={{
                py: 1.5,
                fontSize: '0.85rem',
                fontWeight: i === 0 ? 600 : 500,
                color: i === 0 ? primary : 'text.secondary',
                borderBottom: i === 0 ? `2px solid ${primary}` : '2px solid transparent',
                cursor: 'pointer',
              }}
            >
              {tab}
            </Typography>
          ))}
        </Stack>

        <Box sx={{ p: 3 }}>
          {/* Quote */}
          <Box
            sx={{
              p: 2.5,
              borderRadius: 2,
              bgcolor: isDark ? alpha('#ffffff', 0.03) : alpha('#000', 0.03),
              mb: 4
            }}
          >
            <Typography sx={{ fontStyle: 'italic', color: 'text.secondary', fontSize: '0.95rem', lineHeight: 1.6 }}>
              "Financial guardian who thinks in unit economics, modeling base, optimistic, and pessimistic scenarios while stress-testing every assumption. The voice of financial discipline who never says 'we cannot afford it' but instead quantifies cost, return, payback period, and trade-offs."
            </Typography>
          </Box>

          {/* Grid for About & Contact */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, mb: 4 }}>
            {/* ABOUT */}
            <Box>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'text.secondary', mb: 2, letterSpacing: '0.05em' }}>ABOUT</Typography>
              <Stack spacing={1.5}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ color: primary, fontSize: '0.85rem', fontWeight: 600 }}>Role</Typography>
                  <Typography sx={{ color: 'text.primary', fontSize: '0.85rem', fontWeight: 600 }}>CFO</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ color: primary, fontSize: '0.85rem', fontWeight: 600 }}>Organization</Typography>
                  <Typography sx={{ color: 'text.primary', fontSize: '0.85rem', fontWeight: 600 }}>Orqaly Inc.</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ color: primary, fontSize: '0.85rem', fontWeight: 600 }}>Location</Typography>
                  <Typography sx={{ color: 'text.primary', fontSize: '0.85rem', fontWeight: 600 }}>Ljubljana (CET)</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ color: primary, fontSize: '0.85rem', fontWeight: 600 }}>Age</Typography>
                  <Typography sx={{ color: 'text.primary', fontSize: '0.85rem', fontWeight: 600 }}>45 · she/her</Typography>
                </Box>
              </Stack>
            </Box>

            {/* CONTACT */}
            <Box>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'text.secondary', mb: 2, letterSpacing: '0.05em' }}>CONTACT</Typography>
              <Stack spacing={1.5}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <AppIcon
                    name='EmailOutlined'
                    fallback={EmailOutlinedIcon}
                    sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>veronika.horvat@orqaly.com</Typography>
                </Stack>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <AppIcon
                    name='PhoneOutlined'
                    fallback={PhoneOutlinedIcon}
                    sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>+386-1-555-0145</Typography>
                </Stack>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <AppIcon
                    name='LinkedIn'
                    fallback={LinkedInIcon}
                    sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>linkedin.com/in/veronika-horvat</Typography>
                </Stack>
              </Stack>
            </Box>
          </Box>

          {/* Action Buttons */}
          <Stack direction="row" spacing={2} sx={{ mb: 4 }}>
            <Button
              variant="contained"
              fullWidth
              startIcon={<AppIcon name='ChatBubbleOutline' fallback={ChatBubbleOutlineIcon} />}
              sx={{
                bgcolor: '#10B981',
                color: '#fff',
                py: 1.5,
                fontWeight: 600,
                borderRadius: 2,
                textTransform: 'none',
                boxShadow: `0 8px 16px ${alpha('#10B981', 0.2)}`,
                '&:hover': {
                  bgcolor: '#059669',
                }
              }}
            >
              Chat Now
            </Button>
            <Button
              variant="outlined"
              fullWidth
              startIcon={<AppIcon name='PersonAddAlt1' fallback={PersonAddAlt1Icon} />}
              sx={{
                borderColor: alpha('#10B981', 0.5),
                color: '#10B981',
                py: 1.5,
                fontWeight: 600,
                borderRadius: 2,
                textTransform: 'none',
                '&:hover': {
                  borderColor: '#10B981',
                  bgcolor: alpha('#10B981', 0.05),
                }
              }}
            >
              Hire Agent
            </Button>
          </Stack>

          {/* Comm Style */}
          <Box sx={{ mb: 4 }}>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'text.secondary', mb: 1.5, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Communication Style
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={1}>
              {['Style: Analytical', 'Verbosity: Direct', 'Emoji: Never', 'Formality: Formal'].map(tag => (
                <Box
                  key={tag}
                  sx={{
                    px: 1.5,
                    py: 0.5,
                    borderRadius: 4,
                    border: `1px solid ${alpha(theme.palette.text.primary, 0.2)}`,
                    fontSize: '0.75rem',
                    color: 'text.primary',
                    bgcolor: alpha(theme.palette.text.primary, 0.02)
                  }}
                >
                  {tag}
                </Box>
              ))}
            </Stack>
          </Box>

          {/* Stats Row */}
          <Stack direction="row" spacing={2} sx={{ mb: 4 }}>
            <Box sx={{ flex: 1, p: 2, borderRadius: 3, border: `1px solid ${alpha(theme.palette.text.primary, 0.1)}`, textAlign: 'center', bgcolor: alpha(theme.palette.text.primary, 0.02) }}>
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600, mb: 0.5 }}>Tasks</Typography>
              <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, color: 'text.primary' }}>1,280</Typography>
            </Box>
            <Box sx={{ flex: 1, p: 2, borderRadius: 3, border: `1px solid ${alpha(theme.palette.text.primary, 0.1)}`, textAlign: 'center', bgcolor: alpha(theme.palette.text.primary, 0.02) }}>
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600, mb: 0.5 }}>Completed</Typography>
              <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, color: 'text.primary' }}>1,262</Typography>
            </Box>
            <Box sx={{ flex: 1, p: 2, borderRadius: 3, border: `1px solid ${alpha(theme.palette.text.primary, 0.1)}`, textAlign: 'center', bgcolor: alpha(theme.palette.text.primary, 0.02) }}>
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600, mb: 0.5 }}>Success Rate</Typography>
              <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, color: '#10B981' }}>98.6%</Typography>
            </Box>
            <Box sx={{ flex: 1.2, p: 2, borderRadius: 3, border: `1px solid ${alpha(theme.palette.text.primary, 0.1)}`, textAlign: 'center', bgcolor: alpha(theme.palette.text.primary, 0.02) }}>
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600, mb: 0.5 }}>Cost/Task</Typography>
              <Typography sx={{ fontSize: '1.1rem', fontWeight: 800, color: 'text.primary', mb: 0.25 }}>$0.045</Typography>
              <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5}>
                <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>2,400 tokens</Typography>
                <AppIcon
                  name='InfoOutlined'
                  fallback={InfoOutlinedIcon}
                  sx={{ fontSize: 12, color: 'text.secondary' }} />
              </Stack>
            </Box>
          </Stack>

          {/* Collapsible section mock */}
          <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${alpha(theme.palette.text.primary, 0.1)}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0 }}>
             <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: 'text.secondary', letterSpacing: '0.05em' }}>BACKSTORY</Typography>
             <AppIcon
               name='KeyboardArrowDown'
               fallback={KeyboardArrowDownIcon}
               sx={{ color: 'text.secondary' }} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
