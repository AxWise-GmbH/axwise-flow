/**
 * AgentProfileEditor — full form for editing an agent's identity profile.
 * Uses MUI Accordion sections for organized editing of all profile fields.
 */
import { useState } from 'react';
import {
  Box,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Typography,
  Stack,
  alpha,
  useTheme,
} from '@mui/material';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import AppIcon from '../icons/AppIcon';

const GENDER_OPTIONS = ['male', 'female', 'non-binary', 'other'];
const TIMEZONE_OPTIONS = [
  'CET',
  'EET',
  'MSK',
  'GMT',
  'PST',
  'EST',
  'CST',
  'MST',
  'IST',
  'JST',
  'AEST',
  'UTC',
];
const STYLE_OPTIONS = ['professional', 'friendly', 'technical', 'creative', 'minimal'];
const VERBOSITY_OPTIONS = ['concise', 'detailed', 'minimal'];
const EMOJI_OPTIONS = ['never', 'sparingly', 'frequently'];
const FORMALITY_OPTIONS = ['formal', 'neutral', 'casual'];

function buildDefaults(profile) {
  return {
    display_name: profile?.display_name ?? '',
    pronouns: profile?.pronouns ?? '',
    age: profile?.age ?? '',
    gender: profile?.gender ?? '',
    job_title: profile?.job_title ?? '',
    role: profile?.role ?? '',
    organization: profile?.organization ?? '',
    location: profile?.location ?? '',
    timezone: profile?.timezone ?? '',
    bio: profile?.bio ?? '',
    backstory: profile?.backstory ?? '',
    email: profile?.email ?? '',
    phone: profile?.phone ?? '',
    linkedin_url: profile?.linkedin_url ?? '',
    whatsapp: profile?.whatsapp ?? '',
    telegram: profile?.telegram ?? '',
    communication_tone: {
      style: 'professional',
      verbosity: 'concise',
      emoji_usage: 'never',
      formality: 'neutral',
      ...profile?.communication_tone,
    },
    email_signature: profile?.email_signature ?? '',
    behavior_rules: {
      reply_delay_min_sec: profile?.behavior_rules?.reply_delay_min_sec ?? '',
      reply_delay_max_sec: profile?.behavior_rules?.reply_delay_max_sec ?? '',
      escalation_rules: Array.isArray(profile?.behavior_rules?.escalation_rules)
        ? profile.behavior_rules.escalation_rules.join(', ')
        : (profile?.behavior_rules?.escalation_rules ?? ''),
      topics_to_avoid: Array.isArray(profile?.behavior_rules?.topics_to_avoid)
        ? profile.behavior_rules.topics_to_avoid.join(', ')
        : (profile?.behavior_rules?.topics_to_avoid ?? ''),
    },
  };
}

function parseCommaSeparated(str) {
  if (!str || !str.trim()) return [];
  return str
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const accordionSx = (theme) => ({
  disableGutters: true,
  sx: {
    border: `1px solid ${alpha(theme.palette.divider, 0.15)}`,
    '&:not(:last-child)': { borderBottom: 0 },
    '&::before': { display: 'none' },
  },
});

export default function AgentProfileEditor({ profile, onSave, onCancel, saving }) {
  const theme = useTheme();
  const [form, setForm] = useState(() => buildDefaults(profile));

  const set = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const setNested = (parent, field, value) => {
    setForm((prev) => ({
      ...prev,
      [parent]: { ...prev[parent], [field]: value },
    }));
  };

  const handleSave = () => {
    const out = {
      ...form,
      age: form.age !== '' ? Number(form.age) : null,
      behavior_rules: {
        reply_delay_min_sec:
          form.behavior_rules.reply_delay_min_sec !== ''
            ? Number(form.behavior_rules.reply_delay_min_sec)
            : null,
        reply_delay_max_sec:
          form.behavior_rules.reply_delay_max_sec !== ''
            ? Number(form.behavior_rules.reply_delay_max_sec)
            : null,
        escalation_rules: parseCommaSeparated(form.behavior_rules.escalation_rules),
        topics_to_avoid: parseCommaSeparated(form.behavior_rules.topics_to_avoid),
      },
    };
    onSave(out);
  };

  const aSx = accordionSx(theme);

  return (
    <Box>
      {/* Section 1: Identity */}
      <Accordion disableGutters elevation={0} {...aSx}>
        <AccordionSummary expandIcon={<AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />}>
          <Typography variant="subtitle2">Identity</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={1.5}>
            <TextField
              label="Display Name"
              size="small"
              fullWidth
              value={form.display_name}
              onChange={(e) => set('display_name', e.target.value)}
              disabled={saving}
            />
            <TextField
              label="Pronouns"
              size="small"
              fullWidth
              placeholder="she/her, he/him, they/them"
              value={form.pronouns}
              onChange={(e) => set('pronouns', e.target.value)}
              disabled={saving}
            />
            <TextField
              label="Age"
              size="small"
              fullWidth
              type="number"
              value={form.age}
              onChange={(e) => set('age', e.target.value)}
              disabled={saving}
            />
            <FormControl size="small" fullWidth disabled={saving}>
              <InputLabel>Gender</InputLabel>
              <Select
                label="Gender"
                value={form.gender}
                onChange={(e) => set('gender', e.target.value)}
              >
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                {GENDER_OPTIONS.map((g) => (
                  <MenuItem key={g} value={g}>
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </AccordionDetails>
      </Accordion>
      {/* Section 2: Professional */}
      <Accordion disableGutters elevation={0} {...aSx}>
        <AccordionSummary expandIcon={<AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />}>
          <Typography variant="subtitle2">Professional</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={1.5}>
            <TextField
              label="Job Title"
              size="small"
              fullWidth
              value={form.job_title}
              onChange={(e) => set('job_title', e.target.value)}
              disabled={saving}
            />
            <TextField
              label="Role"
              size="small"
              fullWidth
              value={form.role}
              onChange={(e) => set('role', e.target.value)}
              disabled={saving}
            />
            <TextField
              label="Organization"
              size="small"
              fullWidth
              value={form.organization}
              onChange={(e) => set('organization', e.target.value)}
              disabled={saving}
            />
          </Stack>
        </AccordionDetails>
      </Accordion>
      {/* Section 3: Location */}
      <Accordion disableGutters elevation={0} {...aSx}>
        <AccordionSummary expandIcon={<AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />}>
          <Typography variant="subtitle2">Location</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={1.5}>
            <TextField
              label="Location"
              size="small"
              fullWidth
              placeholder="City, Country"
              value={form.location}
              onChange={(e) => set('location', e.target.value)}
              disabled={saving}
            />
            <FormControl size="small" fullWidth disabled={saving}>
              <InputLabel>Timezone</InputLabel>
              <Select
                label="Timezone"
                value={form.timezone}
                onChange={(e) => set('timezone', e.target.value)}
              >
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                {TIMEZONE_OPTIONS.map((tz) => (
                  <MenuItem key={tz} value={tz}>
                    {tz}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </AccordionDetails>
      </Accordion>
      {/* Section 4: About */}
      <Accordion disableGutters elevation={0} {...aSx}>
        <AccordionSummary expandIcon={<AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />}>
          <Typography variant="subtitle2">About</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={1.5}>
            <TextField
              label="Bio"
              size="small"
              fullWidth
              multiline
              rows={3}
              value={form.bio}
              onChange={(e) => set('bio', e.target.value)}
              disabled={saving}
            />
            <TextField
              label="Backstory"
              size="small"
              fullWidth
              multiline
              rows={4}
              value={form.backstory}
              onChange={(e) => set('backstory', e.target.value)}
              disabled={saving}
            />
          </Stack>
        </AccordionDetails>
      </Accordion>
      {/* Section 5: Contact */}
      <Accordion disableGutters elevation={0} {...aSx}>
        <AccordionSummary expandIcon={<AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />}>
          <Typography variant="subtitle2">Contact</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={1.5}>
            <TextField
              label="Email"
              size="small"
              fullWidth
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              disabled={saving}
            />
            <TextField
              label="Phone"
              size="small"
              fullWidth
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              disabled={saving}
            />
            <TextField
              label="LinkedIn URL"
              size="small"
              fullWidth
              value={form.linkedin_url}
              onChange={(e) => set('linkedin_url', e.target.value)}
              disabled={saving}
            />
            <TextField
              label="WhatsApp"
              size="small"
              fullWidth
              value={form.whatsapp}
              onChange={(e) => set('whatsapp', e.target.value)}
              disabled={saving}
            />
            <TextField
              label="Telegram"
              size="small"
              fullWidth
              value={form.telegram}
              onChange={(e) => set('telegram', e.target.value)}
              disabled={saving}
            />
          </Stack>
        </AccordionDetails>
      </Accordion>
      {/* Section 6: Communication Style */}
      <Accordion disableGutters elevation={0} {...aSx}>
        <AccordionSummary expandIcon={<AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />}>
          <Typography variant="subtitle2">Communication Style</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={1.5}>
            <FormControl size="small" fullWidth disabled={saving}>
              <InputLabel>Style</InputLabel>
              <Select
                label="Style"
                value={form.communication_tone.style}
                onChange={(e) => setNested('communication_tone', 'style', e.target.value)}
              >
                {STYLE_OPTIONS.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth disabled={saving}>
              <InputLabel>Verbosity</InputLabel>
              <Select
                label="Verbosity"
                value={form.communication_tone.verbosity}
                onChange={(e) => setNested('communication_tone', 'verbosity', e.target.value)}
              >
                {VERBOSITY_OPTIONS.map((v) => (
                  <MenuItem key={v} value={v}>
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth disabled={saving}>
              <InputLabel>Emoji Usage</InputLabel>
              <Select
                label="Emoji Usage"
                value={form.communication_tone.emoji_usage}
                onChange={(e) => setNested('communication_tone', 'emoji_usage', e.target.value)}
              >
                {EMOJI_OPTIONS.map((em) => (
                  <MenuItem key={em} value={em}>
                    {em.charAt(0).toUpperCase() + em.slice(1)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth disabled={saving}>
              <InputLabel>Formality</InputLabel>
              <Select
                label="Formality"
                value={form.communication_tone.formality}
                onChange={(e) => setNested('communication_tone', 'formality', e.target.value)}
              >
                {FORMALITY_OPTIONS.map((f) => (
                  <MenuItem key={f} value={f}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </AccordionDetails>
      </Accordion>
      {/* Section 7: Email Signature */}
      <Accordion disableGutters elevation={0} {...aSx}>
        <AccordionSummary expandIcon={<AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />}>
          <Typography variant="subtitle2">Email Signature</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <TextField
            label="Email Signature"
            size="small"
            fullWidth
            multiline
            rows={3}
            value={form.email_signature}
            onChange={(e) => set('email_signature', e.target.value)}
            disabled={saving}
            InputProps={{ sx: { fontFamily: 'monospace' } }}
          />
        </AccordionDetails>
      </Accordion>
      {/* Section 8: Behavior Rules */}
      <Accordion disableGutters elevation={0} {...aSx}>
        <AccordionSummary expandIcon={<AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />}>
          <Typography variant="subtitle2">Behavior Rules</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={1.5}>
            <TextField
              label="Min reply delay (seconds)"
              size="small"
              fullWidth
              type="number"
              value={form.behavior_rules.reply_delay_min_sec}
              onChange={(e) => setNested('behavior_rules', 'reply_delay_min_sec', e.target.value)}
              disabled={saving}
            />
            <TextField
              label="Max reply delay (seconds)"
              size="small"
              fullWidth
              type="number"
              value={form.behavior_rules.reply_delay_max_sec}
              onChange={(e) => setNested('behavior_rules', 'reply_delay_max_sec', e.target.value)}
              disabled={saving}
            />
            <TextField
              label="Escalation Rules"
              size="small"
              fullWidth
              placeholder="rule1, rule2, rule3"
              value={form.behavior_rules.escalation_rules}
              onChange={(e) => setNested('behavior_rules', 'escalation_rules', e.target.value)}
              disabled={saving}
              helperText="Comma-separated list"
            />
            <TextField
              label="Topics to Avoid"
              size="small"
              fullWidth
              placeholder="topic1, topic2, topic3"
              value={form.behavior_rules.topics_to_avoid}
              onChange={(e) => setNested('behavior_rules', 'topics_to_avoid', e.target.value)}
              disabled={saving}
              helperText="Comma-separated list"
            />
          </Stack>
        </AccordionDetails>
      </Accordion>
      {/* Save / Cancel */}
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 2 }}>
        <Button onClick={onCancel} sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
          sx={{ textTransform: 'none' }}
        >
          {saving ? 'Saving...' : 'Save Profile'}
        </Button>
      </Box>
    </Box>
  );
}
