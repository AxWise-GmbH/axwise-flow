import { Typography, useTheme, alpha } from '@mui/material';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import FormDialog from '../Common/FormDialog';
import ManagedVsByoCards from '../Setup/ManagedVsByoCards';

/**
 * AccountActionDialog - opened from the Marketplace "Account" tile.
 * Thin wrapper around <ManagedVsByoCards/> which is the single source of
 * truth for the managed-vs-BYO pair (also rendered inline on /setup).
 */
export default function AccountActionDialog({ open, onClose }) {
  const theme = useTheme();
  const tint = theme.palette.primary.main;

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      title="Get a Tool or LLM account"
      subtitle="Have an agent buy it for you, or paste your own keys."
      icon={AccountCircleOutlinedIcon}
      paperSx={{
        borderRadius: 4,
        overflow: 'hidden',
        background: `linear-gradient(160deg, ${alpha(tint, 0.1)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 65%)`,
        border: '1px solid',
        borderColor: alpha(tint, 0.22),
        boxShadow: `0 20px 60px ${alpha('#000', 0.5)}, 0 0 0 1px ${alpha(tint, 0.1)} inset`,
      }}
      hideCancel
      primaryLabel="Cancel"
      onPrimary={onClose}
      contentSx={{ px: { xs: 2.5, sm: 4 }, pt: 2, pb: { xs: 2.5, sm: 4 } }}
    >
      <Typography
        variant="caption"
        sx={{
          fontWeight: 800,
          letterSpacing: '0.10em',
          color: tint,
          textTransform: 'uppercase',
          fontSize: '0.66rem',
          display: 'block',
          mb: 1,
        }}
      >
        Account
      </Typography>
      <ManagedVsByoCards
        onAfterStartManaged={() => onClose?.()}
        onAfterImport={() => onClose?.()}
        navigateOnManaged
      />
    </FormDialog>
  );
}
