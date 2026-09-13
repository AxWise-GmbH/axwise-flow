import { useState } from 'react';
import { Box, Slider, FormControl, Select, MenuItem, useTheme } from '@mui/material';
import KeyRoundedIcon from '@mui/icons-material/KeyRounded';
import BentoCard from '../../../components/Common/BentoCard';
import { EditButton, SectionLabel } from './_shared';
import { PROVIDERS, TONES, modelsForProvider } from '../../../config/assistantBrain';
import PulseLine from './PulseLine';

// Creativity slider is 0-100; assistant_setup.config.temperature is 0-1.5.
const creativityToTemperature = (c) => Math.round((c / 100) * 1.5 * 100) / 100;

const selectSx = { '& .MuiSelect-select': { py: 0.85, fontWeight: 700 } };

function Field({ label, children }) {
  return (
    <Box sx={{ flex: 1, minWidth: 108 }}>
      <SectionLabel>{label}</SectionLabel>
      <Box sx={{ mt: 0.5 }}>{children}</Box>
    </Box>
  );
}

/** Editable provider / model / tone dropdowns + creativity slider. Saves via onChange. */
export default function ProfileBrainCard({ brain, onEdit, onChange }) {
  const theme = useTheme();
  // Local slider value for smooth dragging; re-sync (during render, the React-
  // recommended pattern) when the saved value changes after a commit.
  const [creativity, setCreativity] = useState(brain.creativity);
  const [lastSaved, setLastSaved] = useState(brain.creativity);
  if (brain.creativity !== lastSaved) {
    setLastSaved(brain.creativity);
    setCreativity(brain.creativity);
  }

  const models = modelsForProvider(brain.provider);
  const tone = TONES.includes(brain.tone) ? brain.tone : TONES[0];
  const model = models.includes(brain.model) ? brain.model : models[0] || '';
  const save = (patch) => onChange && onChange(patch);

  return (
    <BentoCard
      title="Core"
      icon={KeyRoundedIcon}
      action={<EditButton onClick={onEdit} />}
      plainHeader
      scrollBody
    >
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        <Field label="Provider">
          <FormControl size="small" fullWidth>
            <Select
              value={brain.provider}
              aria-label="Provider"
              onChange={(e) =>
                save({ provider: e.target.value, model: modelsForProvider(e.target.value)[0] })
              }
              sx={selectSx}
            >
              {PROVIDERS.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Field>
        <Field label="Model">
          <FormControl size="small" fullWidth>
            <Select
              value={model}
              aria-label="Model"
              onChange={(e) => save({ model: e.target.value })}
              sx={selectSx}
            >
              {models.map((m) => (
                <MenuItem key={m} value={m}>
                  {m}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Field>
        <Field label="Tone">
          <FormControl size="small" fullWidth>
            <Select
              value={tone}
              aria-label="Tone"
              onChange={(e) => save({ tone: e.target.value })}
              sx={{ ...selectSx, textTransform: 'capitalize' }}
            >
              {TONES.map((t) => (
                <MenuItem key={t} value={t} sx={{ textTransform: 'capitalize' }}>
                  {t}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Field>
      </Box>

      <Box sx={{ mt: 2 }}>
        <SectionLabel>Creativity</SectionLabel>
        <Box sx={{ px: 0.5 }}>
          <Slider
            value={creativity}
            min={0}
            max={100}
            aria-label="Creativity level"
            valueLabelDisplay="on"
            marks={[
              { value: 0, label: '0' },
              { value: 50, label: '50' },
              { value: 100, label: '100' },
            ]}
            onChange={(_e, v) => setCreativity(v)}
            onChangeCommitted={(_e, v) => save({ temperature: creativityToTemperature(v) })}
            sx={{
              mt: 2.5,
              color: theme.palette.primary.main,
              '& .MuiSlider-markLabel': { fontSize: '0.65rem' },
            }}
          />
        </Box>
      </Box>

      <PulseLine ariaLabel="Assistant activity pulse" height={120} />
    </BentoCard>
  );
}
