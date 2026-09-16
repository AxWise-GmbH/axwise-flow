import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
  Box,
  Tabs,
  Tab,
  Alert,
  useTheme,
  alpha,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

import AppIcon from '../icons/AppIcon';

/**
 * VoiceboxInstructionsDialog - setup guide for the local Voicebox voice engine.
 * Voicebox (https://voicebox.sh) runs on the user's own machine at
 * http://127.0.0.1:17493. The make-or-break step is CORS: Voicebox only allows a
 * fixed set of origins by default, so the user MUST add this site's origin via
 * the VOICEBOX_CORS_ORIGINS env var, otherwise every call is blocked.
 */
export default function VoiceboxInstructionsDialog({ open, onClose }) {
  const theme = useTheme();
  const tint = theme.palette.primary.main;
  const [tab, setTab] = useState(0);

  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://localhost:5176';

  const codeBox = {
    bgcolor: alpha(tint, 0.05),
    border: '1px solid',
    borderColor: alpha(tint, 0.15),
    borderRadius: 1,
    p: 1.5,
    mt: 1,
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pr: 6, fontWeight: 800 }}>
        Voicebox Voice Setup
        <IconButton
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8, color: 'text.secondary' }}
          aria-label="Close"
        >
          <AppIcon name="Close" fallback={CloseIcon} />
        </IconButton>
      </DialogTitle>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
        <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="fullWidth">
          <Tab label="1. Install & run" />
          <Tab label="2. Allow this site" />
          <Tab label="3. Browser notes" />
        </Tabs>
      </Box>
      <DialogContent sx={{ p: 3, pt: 2, minHeight: 360 }}>
        {tab === 0 && (
          <Box>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>
              Run Voicebox on your computer
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Voicebox is a free, open-source desktop app that runs voice models locally -
              speech-to-text (Whisper) and human-like text-to-speech. Nothing leaves your machine.
            </Typography>

            <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 2 }}>
              Step 1: Get Voicebox
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2, mt: 0.5 }}>
              Download the app from{' '}
              <a
                href="https://voicebox.sh"
                target="_blank"
                rel="noreferrer"
                style={{ color: tint }}
              >
                voicebox.sh
              </a>
              , or run it from the bundled source.
            </Typography>

            <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 2 }}>
              Step 2: Start the API
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2, mt: 0.5 }}>
              Launch Voicebox (the API listens on port <strong>17493</strong>). From source you can
              run just the server:
            </Typography>
            <Box sx={{ ...codeBox, ml: 2 }}>cd voicebox-main{'\n'}bun run dev:server</Box>
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2, mt: 1 }}>
              Your voice engine is now running at <strong>http://127.0.0.1:17493</strong>. No API
              key is needed.
            </Typography>
          </Box>
        )}

        {tab === 1 && (
          <Box>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>
              Allow this site to reach Voicebox (required)
            </Typography>
            <Alert severity="warning" sx={{ mb: 2 }}>
              This is the step everyone misses. Voicebox blocks unknown websites by default. You
              must add this site&apos;s address to its allow-list, or the connection will silently
              fail.
            </Alert>

            <Typography variant="body2" color="text.secondary" paragraph>
              Start Voicebox with the <strong>VOICEBOX_CORS_ORIGINS</strong> environment variable
              set to this exact origin (add your production URL too, comma-separated, if you use the
              hosted site):
            </Typography>
            <Box sx={codeBox}>{`VOICEBOX_CORS_ORIGINS="${origin}" bun run dev:server`}</Box>

            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              The origin to allow is:
            </Typography>
            <Box sx={codeBox}>{origin}</Box>

            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              If you run the packaged desktop app, set the same environment variable before
              launching it (or use the CORS / allowed-origins field in Voicebox&apos;s settings, if
              present). Then come back and press
              <strong> Test connection</strong> on the Voice card.
            </Typography>
          </Box>
        )}

        {tab === 2 && (
          <Box>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>
              Browser &amp; troubleshooting
            </Typography>

            <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 1 }}>
              Use Chrome or Edge
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2, mt: 0.5 }}>
              On a secure (HTTPS) site, Chrome and Edge allow calls to{' '}
              <strong>http://127.0.0.1</strong> because loopback is treated as trustworthy.{' '}
              <strong>Safari</strong> may block this - if so, the assistant automatically falls back
              to the built-in cloud/browser voice.
            </Typography>

            <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 2 }}>
              &quot;Not reachable&quot; after setup?
            </Typography>
            <Box
              component="ul"
              sx={{ color: 'text.secondary', fontSize: '0.875rem', pl: 3, mt: 0.5 }}
            >
              <li>
                Confirm Voicebox is running: open <strong>http://127.0.0.1:17493/health</strong> in
                a tab.
              </li>
              <li>
                Confirm this exact origin is in <strong>VOICEBOX_CORS_ORIGINS</strong> (no trailing
                slash).
              </li>
              <li>Restart Voicebox after changing the env var.</li>
            </Box>

            <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 2 }}>
              First reply is slow?
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2, mt: 0.5 }}>
              The first transcription downloads the Whisper model. If you see a &quot;model
              downloading&quot; notice, wait a moment and try again.
            </Typography>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
