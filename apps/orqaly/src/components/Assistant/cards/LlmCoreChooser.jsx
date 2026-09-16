/**
 * LlmCoreChooser — shared choice for how an assistant/workspace connects its
 * AI: a Google Gemini key (the only remote provider used by normal goal
 * execution in this release) or platform credits (visible but disabled until
 * user-goal billing exists). Used
 * by both the AssistantSetupWizard's ByokByosCard and the /setup page's
 * KeysStep so the two flows never drift.
 *
 * Owns no page chrome (no title, no save/skip buttons) and no key-list
 * fetching — `keys` comes from the parent's own `useUserApiKeys()` so both
 * callers share one key list instead of each mounting a separate copy of the
 * hook. Reports the current selection via `value`/`onChange`; the parent then
 * passes its own `save` fn (from the same hook) into `commitLlmCoreChoice` to
 * persist it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  TextField,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Radio,
  RadioGroup,
  FormControlLabel,
  Typography,
  Button,
  Stack,
  Chip,
  useTheme,
  alpha,
} from '@mui/material';
import {
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_PROVIDER,
  modelsForProvider,
} from '../../../config/assistantBrain';
import { stepEntranceSx } from '../../../theme/wizardGlow';

export const CORE_MODES = {
  PLATFORM: 'platform',
  OPENROUTER: 'openrouter',
  BYOK: 'byok',
  ENV_LOCAL: 'env-local',
};

const GEMINI_MODELS = modelsForProvider(DEFAULT_LLM_PROVIDER);

// User-owned goal execution currently requires a user-scoped key. Lead with
// Gemini BYOK and show the future platform-credits path only as unavailable so
// setup never implies an OpenAI/OpenRouter key can run this pinned pipeline.
const MODE_ORDER = [CORE_MODES.BYOK, CORE_MODES.PLATFORM];

/** One mode's card: radio + label/description, highlighted when `promoted`. */
function ModeCard({
  value,
  selected,
  promoted,
  disabled,
  title,
  description,
  extra,
  onSelect,
  children,
  entranceSx,
}) {
  const theme = useTheme();
  const tint = theme.palette.primary.main;
  return (
    <Box
      onClick={disabled ? undefined : onSelect}
      aria-disabled={disabled || undefined}
      sx={{
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: selected ? alpha(tint, 0.45) : alpha(tint, promoted ? 0.28 : 0.14),
        background: promoted
          ? `linear-gradient(160deg, ${alpha(tint, selected ? 0.14 : 0.09)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 75%)`
          : selected
            ? alpha(tint, 0.06)
            : 'transparent',
        p: 1.5,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.68 : 1,
        transition: 'border-color 150ms ease, box-shadow 150ms ease, background 150ms ease',
        '&:hover': disabled ? undefined : { borderColor: alpha(tint, 0.4) },
        ...entranceSx,
      }}
    >
      <FormControlLabel
        value={value}
        disabled={disabled}
        control={<Radio size="small" checked={selected} sx={{ p: 0.5, mt: '2px' }} />}
        sx={{ alignItems: 'flex-start', m: 0, width: '100%' }}
        label={
          <Box sx={{ pl: 0.5, py: 0.25 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                rowGap: 0.5,
                columnGap: 1,
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.4 }}>
                {title}
              </Typography>
              {promoted && (
                <Chip
                  label="Recommended"
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    lineHeight: 1,
                    color: tint,
                    bgcolor: alpha(tint, 0.14),
                    '& .MuiChip-label': { px: 1 },
                  }}
                />
              )}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {description}
            </Typography>
            {extra}
          </Box>
        }
      />
      {selected && children && (
        <Box sx={{ pl: 4, pt: 1.25 }} onClick={(e) => e.stopPropagation()}>
          {children}
        </Box>
      )}
    </Box>
  );
}

export default function LlmCoreChooser({ value, onChange, keys, onTestKey }) {
  const mode = value?.mode || CORE_MODES.BYOK;

  const initialModel =
    value?.provider === DEFAULT_LLM_PROVIDER && GEMINI_MODELS.includes(value?.model)
      ? value.model
      : DEFAULT_LLM_MODEL;
  const [model, setModel] = useState(initialModel);
  const [keyId, setKeyId] = useState(
    value?.provider === DEFAULT_LLM_PROVIDER ? value?.keyId || '' : ''
  );
  const [newKey, setNewKey] = useState(value?.newKey || '');
  const [testing, setTesting] = useState(false);
  const [testNotice, setTestNotice] = useState(null);
  const [mounted, setMounted] = useState(false);
  const lastAutoSelectionRef = useRef(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const matchingKeys = useMemo(() => {
    return (keys || []).filter((k) => k.provider === `llm:${DEFAULT_LLM_PROVIDER}`);
  }, [keys]);

  // Normalize the goal Core in one pass and reflect automatic choices through
  // the controlled value. Comparing against the parent value before emitting
  // keeps this from looping when the parent stores the normalized selection.
  useEffect(() => {
    if (mode !== CORE_MODES.BYOK) return;

    const normalizedModel = GEMINI_MODELS.includes(model) ? model : DEFAULT_LLM_MODEL;
    const normalizedKeyId =
      keyId === 'new' || matchingKeys.some((key) => key.id === keyId)
        ? keyId
        : matchingKeys[0]?.id || 'new';

    if (model !== normalizedModel) setModel(normalizedModel);
    if (keyId !== normalizedKeyId) setKeyId(normalizedKeyId);

    const parentNeedsNormalization =
      value?.mode !== CORE_MODES.BYOK ||
      value?.provider !== DEFAULT_LLM_PROVIDER ||
      value?.model !== normalizedModel ||
      value?.keyId !== normalizedKeyId;
    const normalizedSignature = `${normalizedModel}\u0000${normalizedKeyId}`;

    if (parentNeedsNormalization && lastAutoSelectionRef.current !== normalizedSignature) {
      lastAutoSelectionRef.current = normalizedSignature;
      onChange({
        mode: CORE_MODES.BYOK,
        provider: DEFAULT_LLM_PROVIDER,
        model: normalizedModel,
        keyId: normalizedKeyId,
        newKey,
      });
    } else if (!parentNeedsNormalization) {
      lastAutoSelectionRef.current = null;
    }
  }, [keyId, matchingKeys, mode, model, newKey, onChange, value]);

  const emit = (patch) => {
    onChange({
      mode,
      provider: DEFAULT_LLM_PROVIDER,
      model,
      keyId,
      newKey,
      ...patch,
    });
  };

  const handleModeChange = (nextMode) => {
    setNewKey('');
    setTestNotice(null);
    if (nextMode === CORE_MODES.BYOK) {
      onChange({
        mode: nextMode,
        provider: DEFAULT_LLM_PROVIDER,
        model: GEMINI_MODELS.includes(model) ? model : DEFAULT_LLM_MODEL,
        keyId: '',
        newKey: '',
      });
      return;
    }
    // PLATFORM / ENV_LOCAL — no sub-fields, no key material.
    onChange({ mode: nextMode, provider: null, model: null, keyId: null, newKey: '' });
  };

  const handleTest = async () => {
    if (!onTestKey || !newKey.trim() || testing) return;
    setTesting(true);
    setTestNotice(null);
    try {
      const res = await onTestKey({
        provider: `llm:${DEFAULT_LLM_PROVIDER}`,
        apiKey: newKey.trim(),
      });
      setTestNotice(
        res?.ok === false
          ? `Key looks invalid: ${res?.error || res?.message || 'failed'}`
          : 'Key looks valid.'
      );
    } catch (err) {
      setTestNotice(err.message || 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  const keySelector = (label) => (
    <>
      <FormControl size="small" fullWidth>
        <InputLabel>Saved key</InputLabel>
        <Select
          label="Saved key"
          value={keyId}
          onChange={(e) => {
            setKeyId(e.target.value);
            emit({ keyId: e.target.value });
          }}
        >
          {matchingKeys.map((k) => (
            <MenuItem key={k.id} value={k.id}>
              {k.label || `${label} key`} ({k.maskedPreview || '••••'})
            </MenuItem>
          ))}
          <MenuItem value="new">+ Use a new key</MenuItem>
        </Select>
      </FormControl>
      {keyId === 'new' && (
        <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mt: 1.25 }}>
          <TextField
            size="small"
            fullWidth
            type="password"
            label="New API key"
            placeholder={`Paste your ${label} key`}
            value={newKey}
            onChange={(e) => {
              setNewKey(e.target.value);
              emit({ newKey: e.target.value });
            }}
            autoComplete="new-password"
          />
          {onTestKey && (
            <Button
              size="small"
              onClick={handleTest}
              disabled={!newKey.trim() || testing}
              sx={{ textTransform: 'none', fontWeight: 600, mt: 0.5, whiteSpace: 'nowrap' }}
            >
              {testing ? 'Testing…' : 'Test'}
            </Button>
          )}
        </Stack>
      )}
      {testNotice && (
        <Typography
          variant="caption"
          color={testNotice.startsWith('Key looks valid') ? 'success.main' : 'error'}
          sx={{ display: 'block', mt: 0.75 }}
        >
          {testNotice}
        </Typography>
      )}
    </>
  );

  const cardsByMode = {
    [CORE_MODES.PLATFORM]: (
      <ModeCard
        key={CORE_MODES.PLATFORM}
        value={CORE_MODES.PLATFORM}
        selected={mode === CORE_MODES.PLATFORM}
        disabled
        title="Platform credits (coming soon)"
        description="Not available for user goals yet. Connect a Gemini key to run goals today."
        onSelect={() => handleModeChange(CORE_MODES.PLATFORM)}
        entranceSx={stepEntranceSx(mounted, 0, { base: 60, step: 0 })}
      />
    ),
    [CORE_MODES.BYOK]: (
      <ModeCard
        key={CORE_MODES.BYOK}
        value={CORE_MODES.BYOK}
        selected={mode === CORE_MODES.BYOK}
        promoted
        title="Connect Google Gemini"
        description="A Gemini API key is required to run goals in this release."
        onSelect={() => handleModeChange(CORE_MODES.BYOK)}
      >
        <Stack spacing={1.25}>
          <FormControl size="small" fullWidth>
            <InputLabel>Gemini model</InputLabel>
            <Select
              label="Gemini model"
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
                emit({ model: e.target.value });
              }}
            >
              {GEMINI_MODELS.map((geminiModel) => (
                <MenuItem key={geminiModel} value={geminiModel}>
                  {geminiModel}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {keySelector('Gemini')}
        </Stack>
      </ModeCard>
    ),
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        Connect the AI used for goals
      </Typography>
      <RadioGroup value={mode} onChange={(e) => handleModeChange(e.target.value)}>
        <Stack spacing={1}>{MODE_ORDER.map((m) => cardsByMode[m])}</Stack>
      </RadioGroup>
    </Box>
  );
}

/**
 * Persist the chooser's current selection, saving a new Gemini BYOK key if
 * needed. `saveKey` is the `save` fn from the parent's `useUserApiKeys()`.
 * Platform, local-environment, and non-Gemini remote modes fail closed because
 * hosted goal setup cannot truthfully mark them ready in this release.
 */
export async function commitLlmCoreChoice(selection, saveKey, keys = []) {
  const { mode, provider, model, keyId, newKey } = selection;
  if (mode !== CORE_MODES.BYOK || provider !== DEFAULT_LLM_PROVIDER) {
    throw new Error('Connect a Google Gemini API key to run goals.');
  }
  let resolvedKeyId = keyId;
  if (keyId === 'new') {
    if (!newKey?.trim()) throw new Error('Enter an API key or pick an existing one.');
    const saved = await saveKey({
      provider: `llm:${DEFAULT_LLM_PROVIDER}`,
      apiKey: newKey.trim(),
      label: 'Assistant Gemini',
    });
    resolvedKeyId = saved?.id || 'new';
  } else {
    const validExistingKey = (keys || []).some(
      (key) => key.provider === `llm:${DEFAULT_LLM_PROVIDER}` && key.id === keyId
    );
    if (!keyId || !validExistingKey) {
      throw new Error('Choose an existing Gemini API key or enter a new one.');
    }
  }
  return {
    mode,
    provider: DEFAULT_LLM_PROVIDER,
    model: GEMINI_MODELS.includes(model) ? model : DEFAULT_LLM_MODEL,
    keyId: resolvedKeyId,
    usePlatformKey: false,
  };
}
