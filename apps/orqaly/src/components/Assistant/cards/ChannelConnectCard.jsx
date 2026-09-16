/**
 * ChannelConnectCard — Step 1. Connect a Communicator channel so the assistant
 * can reach the user. Telegram works today (validate token -> add channel ->
 * register webhook); Slack/other are shown as coming next.
 */
import { useState } from 'react';
import { Box, TextField, MenuItem, FormControl, InputLabel, Select } from '@mui/material';
import ForumRoundedIcon from '@mui/icons-material/ForumRounded';
import {
  addChannel,
  validateTelegramToken,
  registerTelegramWebhook,
} from '../../../services/communicatorService';
import SetupCardShell from './SetupCardShell';

const PLATFORMS = [
  { id: 'telegram', label: 'Telegram', ready: true },
  { id: 'slack', label: 'Slack', ready: true },
  { id: 'other', label: 'Other (coming next)', ready: false },
];

const TOKEN_FIELDS = {
  telegram: { label: 'Telegram bot token', placeholder: '123456:ABC-DEF…' },
  slack: { label: 'Slack bot token', placeholder: 'xoxb-…' },
};

export default function ChannelConnectCard({ onComplete, onSkip, embedded }) {
  const [platform, setPlatform] = useState('telegram');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const ready = PLATFORMS.find((p) => p.id === platform)?.ready;

  const handleConnect = async () => {
    setError(null);
    if (!ready) {
      setError('That channel is coming soon.');
      return;
    }
    if (!token.trim()) {
      setError('Paste your bot token.');
      return;
    }
    setBusy(true);
    try {
      if (platform === 'telegram') {
        const check = await validateTelegramToken(token.trim());
        if (check && check.ok === false) throw new Error(check.error || 'Invalid bot token');
        const channel = await addChannel({
          platform: 'telegram',
          name: check?.botName || check?.username || 'Telegram',
          config: { token: token.trim() },
          status: 'active',
        });
        if (channel?.id) await registerTelegramWebhook(channel.id).catch(() => {});
        onComplete({
          config: { channel: { id: channel?.id, platform: 'telegram', name: channel?.name } },
        });
      } else if (platform === 'slack') {
        if (!token.trim().startsWith('xoxb-'))
          throw new Error('Slack bot tokens start with "xoxb-".');
        const channel = await addChannel({
          platform: 'slack',
          name: 'Slack',
          config: { botToken: token.trim() },
          status: 'active',
        });
        onComplete({ config: { channel: { id: channel?.id, platform: 'slack', name: 'Slack' } } });
      }
    } catch (err) {
      setError(err.message || 'Could not connect the channel.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SetupCardShell
      title="Connect a channel"
      icon={ForumRoundedIcon}
      embedded={embedded}
      primaryLabel="Connect"
      onPrimary={handleConnect}
      busy={busy}
      onSkip={onSkip}
      error={error}
    >
      <FormControl size="small" fullWidth>
        <InputLabel>Platform</InputLabel>
        <Select label="Platform" value={platform} onChange={(e) => setPlatform(e.target.value)}>
          {PLATFORMS.map((p) => (
            <MenuItem key={p.id} value={p.id} disabled={!p.ready}>
              {p.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {TOKEN_FIELDS[platform] && (
        <Box>
          <TextField
            size="small"
            fullWidth
            type="password"
            label={TOKEN_FIELDS[platform].label}
            placeholder={TOKEN_FIELDS[platform].placeholder}
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </Box>
      )}
    </SetupCardShell>
  );
}
