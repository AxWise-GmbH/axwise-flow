import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  TextField,
  Button,
  Chip,
  Snackbar,
  Alert,
  Autocomplete,
  useTheme,
  alpha,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined';
import DevicesOutlinedIcon from '@mui/icons-material/DevicesOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import GlassIcon from '../icons/GlassIcon';
import { createGoal } from '../../services/goalService';
import { saveUserKey } from '../../services/userKeysService';
import { PROVIDERS, CATEGORIES } from '../../data/providerCatalog';
import LocalLlmInstructionsDialog from './LocalLlmInstructionsDialog';

import AppIcon from '../icons/AppIcon';

const CATEGORY_LABEL = CATEGORIES.reduce((acc, c) => {
  acc[c.id] = c.label;
  return acc;
}, {});

/**
 * SetupCard — shared chrome for the three account options. Header (icon /
 * eyebrow / title / description) sits at the top; a flex spacer pushes the
 * `children` action zone to the bottom so every card's primary CTA aligns,
 * regardless of description length or whether a form is expanded.
 */
function SetupCard({
  tint,
  theme,
  primary,
  iconName,
  iconFallback,
  eyebrow,
  title,
  description,
  pad,
  children,
}) {
  return (
    <Box
      sx={{
        p: pad,
        borderRadius: 3,
        border: '1px solid',
        borderColor: alpha(tint, primary ? 0.3 : 0.15),
        background: primary
          ? `linear-gradient(160deg, ${alpha(tint, 0.1)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`
          : alpha(tint, 0.04),
        display: 'flex',
        flexDirection: 'column',
        gap: 1.1,
        height: '100%',
        transition: 'border-color 150ms ease, box-shadow 150ms ease',
        '&:hover': {
          borderColor: alpha(tint, primary ? 0.5 : 0.32),
          boxShadow: `0 6px 20px ${alpha(tint, primary ? 0.14 : 0.08)}`,
        },
      }}
    >
      <Box
        sx={{
          width: 44,
          height: 44,
          borderRadius: 2.2,
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
        <GlassIcon name={iconName} fallback={iconFallback} size={22} tone={tint} />
      </Box>

      <Box>
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            fontWeight: 800,
            letterSpacing: '0.10em',
            color: tint,
            textTransform: 'uppercase',
            fontSize: '0.64rem',
          }}
        >
          {eyebrow}
        </Typography>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.25 }}>
          {title}
        </Typography>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
        {description}
      </Typography>

      {/* Spacer pins the action zone to the bottom so CTAs align across cards. */}
      <Box sx={{ flex: 1, minHeight: 12 }} />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>{children}</Box>
    </Box>
  );
}

/**
 * Three-card pair: "Have us create it" (account-creator agent), "I have keys"
 * (BYO import) and "Run Locally" (Ollama / local server).
 * Used inline on /setup and inside the marketplace AccountActionDialog.
 *
 * Props:
 *  - onAfterImport?: () => void  - fired after a successful BYO key / local save.
 *  - onAfterStartManaged?: ({ goalId }) => void  - fired after a managed goal is enqueued.
 *  - navigateOnManaged?: boolean (default true)  - navigate to /job-pool after enqueueing.
 *  - compact?: boolean  - tighter spacing (used inside dialogs).
 */
export default function ManagedVsByoCards({
  onAfterImport,
  onAfterStartManaged,
  navigateOnManaged = true,
  compact = false,
}) {
  const theme = useTheme();
  const navigate = useNavigate();
  const tint = theme.palette.primary.main;

  const [selectedProvider, setSelectedProvider] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'info' });
  const [importOpen, setImportOpen] = useState(false);
  const [importProvider, setImportProvider] = useState('');
  const [importKey, setImportKey] = useState('');
  const [importing, setImporting] = useState(false);

  const [localOpen, setLocalOpen] = useState(false);
  const [localProvider, setLocalProvider] = useState('llm:ollama');
  const [localUrl, setLocalUrl] = useState('');
  const [localSaving, setLocalSaving] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  const showToast = useCallback((message, severity = 'info') => {
    setToast({ open: true, message, severity });
  }, []);

  const handleStart = useCallback(async () => {
    if (!selectedProvider || submitting) return;
    const label = selectedProvider.label;
    setSubmitting(true);
    try {
      const created = await createGoal({
        title: `Create ${label} account`,
        description:
          `Account-creator agent: buy a ${label} subscription and securely return ` +
          `the API key. Capture credentials in the user's key vault.`,
        budget_usd: 5,
        mode: 'simple',
        executor_type: 'agent',
        parsed_requirements: JSON.stringify({
          category: 'account_creation',
          provider_id: selectedProvider.id,
          service: label,
        }),
      });
      setSelectedProvider(null);
      onAfterStartManaged?.({ goalId: created?.id });
      if (navigateOnManaged) {
        if (created?.id) navigate(`/job-pool?goalId=${created.id}`);
        else navigate('/job-pool');
      }
    } catch (err) {
      showToast(err?.message || 'Failed to start account creation.', 'error');
    } finally {
      setSubmitting(false);
    }
  }, [selectedProvider, submitting, navigate, navigateOnManaged, onAfterStartManaged, showToast]);

  const handleImport = useCallback(async () => {
    const prov = importProvider.trim().toLowerCase();
    const key = importKey.trim();
    if (!prov || key.length < 8 || importing) return;
    setImporting(true);
    try {
      await saveUserKey({ provider: prov, apiKey: key, skipProbe: true });
      setImportProvider('');
      setImportKey('');
      setImportOpen(false);
      showToast('API key imported successfully.', 'success');
      onAfterImport?.();
    } catch (err) {
      showToast(err?.message || 'Failed to import key.', 'error');
    } finally {
      setImporting(false);
    }
  }, [importProvider, importKey, importing, showToast, onAfterImport]);

  const handleSaveLocal = useCallback(async () => {
    const prov = localProvider;
    const url =
      localUrl.trim() ||
      (prov === 'llm:ollama' ? 'http://localhost:11434' : 'http://localhost:1234/v1');
    if (localSaving) return;
    setLocalSaving(true);
    try {
      await saveUserKey({ provider: prov, apiKey: url, skipProbe: true });
      setLocalOpen(false);
      showToast('Local LLM configured successfully.', 'success');
      onAfterImport?.();
    } catch (err) {
      showToast(err?.message || 'Failed to configure Local LLM.', 'error');
    } finally {
      setLocalSaving(false);
    }
  }, [localProvider, localUrl, localSaving, showToast, onAfterImport]);

  const pad = compact ? 2 : 2.5;

  // Shared CTA styles.
  const primaryBtnSx = {
    textTransform: 'none',
    fontWeight: 700,
    borderRadius: 2,
    boxShadow: `0 6px 18px ${alpha(tint, 0.3)}`,
  };
  const outlinedBtnSx = {
    textTransform: 'none',
    fontWeight: 700,
    borderRadius: 2,
    borderColor: alpha(tint, 0.4),
    color: 'text.primary',
    '&:hover': { borderColor: tint, bgcolor: alpha(tint, 0.06) },
  };

  return (
    <>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fit, minmax(220px, 1fr))' },
          alignItems: 'stretch',
          gap: 2,
        }}
      >
        {/* ── Card 1 — Managed ── */}
        <SetupCard
          tint={tint}
          theme={theme}
          pad={pad}
          primary
          iconName="AutoAwesome"
          iconFallback={AutoAwesomeOutlinedIcon}
          eyebrow="Managed"
          title="Have us create it"
          description="Pick a service. An account-creator agent buys the subscription and returns the API key to you."
        >
          <Autocomplete
            options={PROVIDERS}
            groupBy={(opt) => CATEGORY_LABEL[opt.category] || opt.category}
            getOptionLabel={(opt) => opt?.label || ''}
            isOptionEqualToValue={(opt, val) => opt.id === val.id}
            value={selectedProvider}
            onChange={(_e, val) => setSelectedProvider(val)}
            disabled={submitting}
            size="small"
            fullWidth
            renderInput={(params) => (
              <TextField
                {...params}
                label="Service"
                placeholder="Pick a tool or LLM"
                inputProps={{ ...params.inputProps, 'aria-label': 'Service' }}
              />
            )}
          />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Chip
              label="$5 / account"
              size="small"
              sx={{
                fontWeight: 700,
                color: tint,
                bgcolor: alpha(tint, 0.12),
                border: '1px solid',
                borderColor: alpha(tint, 0.3),
                height: 24,
              }}
            />
            <Typography variant="caption" color="text.secondary">
              flat fee
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.35, mt: -0.5 }}>
            You approve before any spend starts.
          </Typography>

          <Button
            onClick={handleStart}
            variant="contained"
            fullWidth
            disabled={!selectedProvider || submitting}
            endIcon={<AppIcon name="ArrowForwardRounded" fallback={ArrowForwardRoundedIcon} />}
            sx={primaryBtnSx}
          >
            {submitting ? 'Starting…' : 'Start account creation'}
          </Button>
        </SetupCard>

        {/* ── Card 2 — BYO keys ── */}
        <SetupCard
          tint={tint}
          theme={theme}
          pad={pad}
          iconName="VpnKeyOutlined"
          iconFallback={VpnKeyOutlinedIcon}
          eyebrow="BYO keys"
          title="I have keys"
          description="Already have an API key for a service? Paste it in. We store it encrypted and route requests through it."
        >
          {!importOpen ? (
            <Button
              onClick={() => setImportOpen(true)}
              variant="outlined"
              fullWidth
              disabled={submitting}
              sx={outlinedBtnSx}
            >
              Import a key
            </Button>
          ) : (
            <>
              <TextField
                label="Provider"
                placeholder="e.g. openai, anthropic, stripe"
                value={importProvider}
                onChange={(e) => setImportProvider(e.target.value)}
                size="small"
                fullWidth
                disabled={importing}
                inputProps={{ 'aria-label': 'Provider name' }}
              />
              <TextField
                label="API key"
                placeholder="Paste your API key"
                value={importKey}
                onChange={(e) => setImportKey(e.target.value)}
                size="small"
                fullWidth
                type="password"
                disabled={importing}
                inputProps={{ 'aria-label': 'API key' }}
              />
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  onClick={handleImport}
                  variant="contained"
                  sx={{ ...primaryBtnSx, flex: 1 }}
                  disabled={!importProvider.trim() || importKey.trim().length < 8 || importing}
                >
                  {importing ? 'Saving…' : 'Save key'}
                </Button>
                <Button
                  onClick={() => {
                    setImportOpen(false);
                    setImportProvider('');
                    setImportKey('');
                  }}
                  disabled={importing}
                  sx={{ textTransform: 'none', color: 'text.secondary', fontWeight: 600 }}
                >
                  Cancel
                </Button>
              </Box>
            </>
          )}
        </SetupCard>

        {/* ── Card 3 — Local hardware ── */}
        <SetupCard
          tint={tint}
          theme={theme}
          pad={pad}
          iconName="DevicesOutlined"
          iconFallback={DevicesOutlinedIcon}
          eyebrow="Local hardware"
          title="Run Locally"
          description={
            <>
              Connect to Ollama or an OpenAI-compatible local server. Ensure your local server is
              running.{' '}
              <Box
                component="span"
                sx={{
                  color: tint,
                  cursor: 'pointer',
                  fontWeight: 600,
                  '&:hover': { textDecoration: 'underline' },
                }}
                onClick={() => setInstructionsOpen(true)}
              >
                How to set up?
              </Box>
            </>
          }
        >
          {!localOpen ? (
            <Button
              onClick={() => setLocalOpen(true)}
              variant="outlined"
              fullWidth
              disabled={submitting}
              sx={outlinedBtnSx}
            >
              Configure
            </Button>
          ) : (
            <>
              <FormControl size="small" fullWidth>
                <InputLabel id="local-provider-label">Engine</InputLabel>
                <Select
                  labelId="local-provider-label"
                  value={localProvider}
                  label="Engine"
                  onChange={(e) => {
                    setLocalProvider(e.target.value);
                    setLocalUrl('');
                  }}
                  disabled={localSaving}
                >
                  <MenuItem value="llm:ollama">Ollama</MenuItem>
                  <MenuItem value="llm:local-openai">LM Studio / Compatible</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Base URL"
                placeholder={
                  localProvider === 'llm:ollama'
                    ? 'http://localhost:11434'
                    : 'http://localhost:1234/v1'
                }
                value={localUrl}
                onChange={(e) => setLocalUrl(e.target.value)}
                size="small"
                fullWidth
                disabled={localSaving}
                inputProps={{ 'aria-label': 'Base URL' }}
              />
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  onClick={handleSaveLocal}
                  variant="contained"
                  sx={{ ...primaryBtnSx, flex: 1 }}
                  disabled={localSaving}
                >
                  {localSaving ? 'Saving…' : 'Save'}
                </Button>
                <Button
                  onClick={() => {
                    setLocalOpen(false);
                    setLocalUrl('');
                  }}
                  disabled={localSaving}
                  sx={{ textTransform: 'none', color: 'text.secondary', fontWeight: 600 }}
                >
                  Cancel
                </Button>
              </Box>
            </>
          )}
        </SetupCard>
      </Box>
      <LocalLlmInstructionsDialog
        open={instructionsOpen}
        onClose={() => setInstructionsOpen(false)}
      />
      <Snackbar
        open={toast.open}
        autoHideDuration={5000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={toast.severity}
          variant="filled"
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          sx={{ minWidth: 300 }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </>
  );
}
