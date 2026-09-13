import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  IconButton,
  Snackbar,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import FormDialog from '../Common/FormDialog';
import QRCode from 'qrcode';
import FavoriteIcon from '@mui/icons-material/Favorite';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { fireConfetti } from '../../utils/confettiCanvas';
import { WALLET_ADDRESSES } from './walletAddresses';

import AppIcon from '../icons/AppIcon';

const CURRENCIES = [
  { id: 'USDT', label: 'USDT', glyph: '₮', tint: '#26A17B' },
  { id: 'BTC', label: 'BTC', glyph: '₿', tint: '#F7931A' },
  { id: 'ETH', label: 'ETH', glyph: 'Ξ', tint: '#627EEA' },
  { id: 'TRX', label: 'TRX', glyph: 'T', tint: '#EF0027' },
];

const NETWORKS = [
  { id: 'erc20', label: 'ERC-20', sub: 'Ethereum' },
  { id: 'sol', label: 'Solana', sub: 'SPL' },
  { id: 'trc20', label: 'TRC-20', sub: 'Tron' },
];

const NETWORK_DESCRIPTIONS = {
  'USDT.erc20': 'ERC-20 (Ethereum mainnet)',
  'USDT.sol': 'Solana (SPL)',
  'USDT.trc20': 'TRC-20 (Tron)',
  BTC: 'Bitcoin network',
  ETH: 'Ethereum mainnet',
  TRX: 'Tron mainnet',
};

function CurrencyMark({ symbol, color, size = 26 }) {
  const glyph = CURRENCIES.find((c) => c.id === symbol)?.glyph ?? symbol[0];
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        bgcolor: color,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.55,
        fontWeight: 800,
        lineHeight: 1,
        flexShrink: 0,
        boxShadow: `0 4px 12px ${alpha(color, 0.4)}`,
      }}
    >
      {glyph}
    </Box>
  );
}

function getAddress(currency, network) {
  if (currency === 'USDT') return WALLET_ADDRESSES.USDT[network];
  return WALLET_ADDRESSES[currency];
}

function getNetworkLabel(currency, network) {
  return currency === 'USDT'
    ? NETWORK_DESCRIPTIONS[`USDT.${network}`]
    : NETWORK_DESCRIPTIONS[currency];
}

export default function CryptoDonateDialog({ open, onClose }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const primary = theme.palette.primary.main;

  const [currency, setCurrency] = useState('USDT');
  const [network, setNetwork] = useState('erc20');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copiedAddress, setCopiedAddress] = useState(null);
  const [thanksOpen, setThanksOpen] = useState(false);

  const currentAddress = useMemo(() => getAddress(currency, network), [currency, network]);
  const networkLabel = useMemo(() => getNetworkLabel(currency, network), [currency, network]);
  const activeTint = CURRENCIES.find((c) => c.id === currency)?.tint ?? primary;
  const copied = copiedAddress !== null && copiedAddress === currentAddress;

  // Regenerate the QR code whenever the active address changes.
  useEffect(() => {
    if (!currentAddress) return undefined;
    let cancelled = false;
    QRCode.toDataURL(currentAddress, {
      margin: 1,
      width: 240,
      errorCorrectionLevel: 'M',
      color: {
        dark: theme.palette.text.primary,
        light: '#00000000',
      },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [currentAddress, theme.palette.text.primary]);

  const handleCurrencyChange = (_evt, next) => {
    if (!next) return;
    setCurrency(next);
    if (next === 'USDT') setNetwork('erc20');
  };

  const handleNetworkChange = (_evt, next) => {
    if (!next) return;
    setNetwork(next);
  };

  const handleCopy = async () => {
    if (!currentAddress) return;
    try {
      await navigator.clipboard.writeText(currentAddress);
      const justCopied = currentAddress;
      setCopiedAddress(justCopied);
      setTimeout(() => {
        setCopiedAddress((prev) => (prev === justCopied ? null : prev));
      }, 1600);
    } catch {
      // clipboard may be unavailable in some embedded contexts; silently ignore
    }
  };

  const handleSent = () => {
    fireConfetti({ origin: { y: 0.7 }, particleCount: 140, spread: 80, startVelocity: 35 });
    setThanksOpen(true);
  };

  return (
    <>
      <FormDialog
        open={open}
        onClose={onClose}
        title="Donate with crypto"
        subtitle="Thank you for keeping us building."
        headerIcon={
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              bgcolor: alpha(primary, 0.12),
              color: primary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              '@keyframes heartPulse': {
                '0%, 100%': { transform: 'scale(1)' },
                '50%': { transform: 'scale(1.12)' },
              },
              animation: 'heartPulse 1.8s ease-in-out infinite',
            }}
          >
            <AppIcon name="Favorite" fallback={FavoriteIcon} sx={{ fontSize: 22 }} />
          </Box>
        }
        paperSx={{
          borderRadius: 4,
          bgcolor: isDark ? '#000000' : '#ffffff',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          border: `1px solid ${theme.palette.divider}`,
          backgroundImage: 'none',
        }}
        contentSx={{ px: { xs: 3, sm: 4.5 }, pt: { xs: 2, sm: 2.5 }, pb: 1.5, overflow: 'visible' }}
        actions={
          <>
            <Button
              onClick={onClose}
              color="inherit"
              sx={{ fontWeight: 600, textTransform: 'none', px: 2.5, py: 1.25 }}
            >
              Maybe later
            </Button>
            <Button
              onClick={handleSent}
              variant="contained"
              size="large"
              startIcon={<AppIcon name="Favorite" fallback={FavoriteIcon} />}
              sx={{
                fontWeight: 700,
                textTransform: 'none',
                borderRadius: 2,
                px: 3.5,
                py: 1.4,
                fontSize: '0.95rem',
                boxShadow: `0 8px 22px ${alpha(primary, 0.35)}`,
              }}
            >
              I sent it
            </Button>
          </>
        }
      >
        <Stack spacing={4}>
          {/* Coin + network group - tight inner spacing so they read as one selector */}
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            {/* Currency selector */}
            <ToggleButtonGroup
              value={currency}
              exclusive
              onChange={handleCurrencyChange}
              aria-label="Donation currency"
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 1.5,
                '& .MuiToggleButton-root': {
                  borderRadius: 2.5,
                  border: `1.5px solid ${theme.palette.divider}`,
                  textTransform: 'none',
                  fontWeight: 700,
                  py: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                  transition:
                    'transform 180ms ease, border-color 180ms ease, background-color 180ms ease, box-shadow 220ms ease',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    borderColor: alpha(theme.palette.primary.main, 0.45),
                  },
                },
                '& .MuiToggleButton-root.Mui-selected': {
                  borderColor: (t) => t.palette.primary.main,
                  bgcolor: (t) => alpha(t.palette.primary.main, isDark ? 0.18 : 0.08),
                  boxShadow: (t) =>
                    `0 0 0 1px ${t.palette.primary.main}, ` +
                    `0 0 14px ${alpha(t.palette.primary.main, 0.35)}, ` +
                    `0 0 32px ${alpha(t.palette.primary.main, 0.22)}`,
                  '&:hover': {
                    borderColor: (t) => t.palette.primary.main,
                    boxShadow: (t) =>
                      `0 0 0 1px ${t.palette.primary.main}, ` +
                      `0 0 18px ${alpha(t.palette.primary.main, 0.45)}, ` +
                      `0 0 38px ${alpha(t.palette.primary.main, 0.28)}`,
                  },
                },
              }}
            >
              {CURRENCIES.map((c) => (
                <ToggleButton key={c.id} value={c.id} aria-label={c.label}>
                  <CurrencyMark symbol={c.id} color={c.tint} size={28} />
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.02em' }}>
                    {c.label}
                  </Typography>
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            {/* Network sub-selector (USDT only) */}
            {currency === 'USDT' && (
              <ToggleButtonGroup
                value={network}
                exclusive
                onChange={handleNetworkChange}
                aria-label="USDT network"
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 1.5,
                  '& .MuiToggleButton-root': {
                    borderRadius: 2.5,
                    border: `1.5px solid ${theme.palette.divider}`,
                    textTransform: 'none',
                    fontWeight: 600,
                    py: 1.4,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.4,
                    transition:
                      'border-color 180ms ease, background-color 180ms ease, box-shadow 220ms ease',
                    '&:hover': {
                      borderColor: alpha(theme.palette.primary.main, 0.45),
                    },
                  },
                  '& .MuiToggleButton-root.Mui-selected': {
                    borderColor: (t) => t.palette.primary.main,
                    bgcolor: (t) => alpha(t.palette.primary.main, isDark ? 0.18 : 0.08),
                    boxShadow: (t) =>
                      `0 0 0 1px ${t.palette.primary.main}, ` +
                      `0 0 12px ${alpha(t.palette.primary.main, 0.3)}, ` +
                      `0 0 26px ${alpha(t.palette.primary.main, 0.18)}`,
                    '&:hover': {
                      borderColor: (t) => t.palette.primary.main,
                    },
                  },
                }}
              >
                {NETWORKS.map((n) => (
                  <ToggleButton key={n.id} value={n.id} aria-label={`USDT on ${n.label}`}>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700 }}>{n.label}</Typography>
                    <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                      {n.sub}
                    </Typography>
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            )}
          </Stack>

          {/* QR + address panel */}
          <Box
            key={currentAddress}
            sx={{
              position: 'relative',
              borderRadius: 3,
              p: { xs: 3, sm: 4 },
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: isDark ? alpha('#fff', 0.025) : alpha(activeTint, 0.04),
              overflow: 'hidden',
              '@keyframes panelFlash': {
                '0%': { opacity: 0, transform: 'scale(0.96)' },
                '60%': { opacity: 0.55, transform: 'scale(1)' },
                '100%': { opacity: 0, transform: 'scale(1.04)' },
              },
              '&::before': {
                content: '""',
                position: 'absolute',
                inset: 0,
                background: `radial-gradient(circle at 50% 30%, ${alpha(activeTint, 0.35)} 0%, transparent 70%)`,
                animation: 'panelFlash 900ms ease-out',
                pointerEvents: 'none',
              },
            }}
          >
            <Stack spacing={3}>
              {/* Top row: QR on the left, header info filling the right */}
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={{ xs: 2.5, sm: 3.5 }}
                alignItems={{ xs: 'center', sm: 'center' }}
              >
                <Box
                  sx={{
                    width: 180,
                    height: 180,
                    flexShrink: 0,
                    borderRadius: 2.5,
                    bgcolor: isDark ? alpha('#fff', 0.04) : '#fff',
                    border: `1px solid ${alpha(activeTint, 0.35)}`,
                    p: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: `0 8px 24px ${alpha(activeTint, 0.18)}`,
                  }}
                >
                  {qrDataUrl ? (
                    <Box
                      component="img"
                      src={qrDataUrl}
                      alt={`QR code for ${currency} address on ${networkLabel}`}
                      sx={{ width: '100%', height: '100%', display: 'block' }}
                    />
                  ) : (
                    <Typography
                      sx={{ fontSize: '0.75rem', color: 'text.secondary', textAlign: 'center' }}
                    >
                      Generating QR…
                    </Typography>
                  )}
                </Box>

                <Stack
                  spacing={1.5}
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    alignItems: { xs: 'center', sm: 'flex-start' },
                    textAlign: { xs: 'center', sm: 'left' },
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1.5}>
                    <CurrencyMark symbol={currency} color={activeTint} size={32} />
                    <Typography
                      sx={{
                        fontWeight: 800,
                        fontSize: '1.3rem',
                        lineHeight: 1.15,
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {currency}
                    </Typography>
                  </Stack>
                  <Typography
                    sx={{ fontSize: '0.95rem', color: 'text.secondary', lineHeight: 1.5 }}
                  >
                    on{' '}
                    <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>
                      {networkLabel}
                    </Box>
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: '0.85rem',
                      color: 'text.secondary',
                      lineHeight: 1.55,
                      maxWidth: 280,
                    }}
                  >
                    Scan the QR with your wallet, or copy the address below.
                  </Typography>
                </Stack>
              </Stack>

              {/* Bottom row: full-width single-line address bar with inline copy icon */}
              <Stack
                direction="row"
                alignItems="stretch"
                spacing={0}
                data-testid="donate-address-row"
                sx={{
                  bgcolor: isDark ? alpha('#000', 0.3) : alpha('#000', 0.04),
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <Box
                  data-testid="donate-address"
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    px: 2,
                    py: 1.6,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                    fontSize: { xs: '0.72rem', sm: '0.82rem' },
                    color: 'text.primary',
                    lineHeight: 1.5,
                    whiteSpace: 'nowrap',
                    overflowX: 'auto',
                    overflowY: 'hidden',
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                    '&::-webkit-scrollbar': { display: 'none' },
                  }}
                >
                  {currentAddress}
                </Box>
                <Tooltip title={copied ? 'Copied!' : 'Copy address'} arrow>
                  <IconButton
                    onClick={handleCopy}
                    aria-label={`Copy ${currency} address`}
                    sx={{
                      borderRadius: 0,
                      borderLeft: `1px solid ${theme.palette.divider}`,
                      px: 2,
                      color: copied ? activeTint : 'primary.main',
                      '&:hover': { bgcolor: alpha(activeTint, 0.08) },
                    }}
                  >
                    {copied ? (
                      <AppIcon name="CheckRounded" fallback={CheckRoundedIcon} fontSize="small" />
                    ) : (
                      <AppIcon
                        name="ContentCopyOutlined"
                        fallback={ContentCopyOutlinedIcon}
                        fontSize="small"
                      />
                    )}
                  </IconButton>
                </Tooltip>
              </Stack>
            </Stack>
          </Box>

          <Alert
            severity="warning"
            variant="outlined"
            sx={{
              borderRadius: 2.5,
              py: 1.75,
              px: 2.5,
              alignItems: 'center',
              '& .MuiAlert-icon': { mr: 2, fontSize: 24 },
              '& .MuiAlert-message': { fontSize: '0.88rem', lineHeight: 1.6, py: 0 },
            }}
          >
            Only send <b>{currency}</b> on <b>{networkLabel}</b>. Other tokens or networks will be
            lost.
          </Alert>
        </Stack>
      </FormDialog>
      <Snackbar
        open={thanksOpen}
        autoHideDuration={4000}
        onClose={() => setThanksOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        message={
          <Stack direction="row" spacing={1} alignItems="center">
            <AppIcon
              name="Favorite"
              fallback={FavoriteIcon}
              sx={{ fontSize: 18, color: '#ff6b9d' }}
            />
            <span>Thank you. Every bit moves us forward.</span>
          </Stack>
        }
      />
    </>
  );
}
