import { Box, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import PublishOutlinedIcon from '@mui/icons-material/PublishOutlined';

export default function DemoMarketplaceCreator() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      sx={{
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${alpha(primary, 0.25)}`,
        boxShadow: `0 16px 40px ${alpha(primary, 0.14)}`,
        p: { xs: 2.5, md: 3 },
      }}
    >
      <Stack spacing={2}>
        <Typography sx={{ fontWeight: 800, fontSize: '1.15rem', color: 'text.primary' }}>
          Builders earn crypto
        </Typography>
        <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary', lineHeight: 1.6 }}>
          Stripe Connect payouts. VirusTotal scan on tools. You ship — we handle billing and trust &amp; safety.
        </Typography>
        <Stack spacing={1}>
          {[
            { Icon: PublishOutlinedIcon, label: 'Draft in workspace', sub: 'Publish when ready' },
            { Icon: SecurityOutlinedIcon, label: 'VirusTotal scan', sub: 'Tools before go-live' },
            { Icon: AccountBalanceWalletOutlinedIcon, label: 'Stripe Connect', sub: 'Payouts to 30+ countries' },
          ].map(({ Icon, label, sub }) => (
            <Stack
              key={label}
              direction="row"
              alignItems="center"
              spacing={1.25}
              sx={{
                p: 1.25,
                borderRadius: 2,
                bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.02),
              }}
            >
              <Icon sx={{ fontSize: 18, color: 'primary.main' }} />
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: '0.82rem' }}>{label}</Typography>
                <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{sub}</Typography>
              </Box>
            </Stack>
          ))}
        </Stack>
        <Chip label="7 listing types" size="small" sx={{ alignSelf: 'flex-start', fontWeight: 700, fontSize: '0.68rem' }} />
      </Stack>
    </Box>
  );
}
