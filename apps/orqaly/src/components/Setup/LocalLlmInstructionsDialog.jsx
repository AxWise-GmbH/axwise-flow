import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
  Box,
  Tabs,
  Tab,
  useTheme,
  alpha,
  Divider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

import AppIcon from '../icons/AppIcon';

export default function LocalLlmInstructionsDialog({ open, onClose }) {
  const theme = useTheme();
  const tint = theme.palette.primary.main;
  const [tab, setTab] = useState(0);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pr: 6, fontWeight: 800 }}>
        Local LLM Setup Guide
        <IconButton
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8, color: 'text.secondary' }}
          aria-label="Close"
        >
          <AppIcon name="Close" fallback={CloseIcon} />
        </IconButton>
      </DialogTitle>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
        <Tabs value={tab} onChange={(e, v) => setTab(v)}>
          <Tab label="Ollama (Recommended)" />
          <Tab label="LM Studio (GUI)" />
          <Tab label="Ngrok (Cloud Users)" />
        </Tabs>
      </Box>
      <DialogContent sx={{ p: 3, pt: 2, minHeight: 400 }}>
        {tab === 0 && (
          <Box>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>
              Run Models with Ollama
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Ollama is a lightweight tool that runs in your terminal, providing the fastest and
              easiest way to run local models like Llama 3.
            </Typography>

            <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 2 }}>
              Step 1: Install Ollama
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2, mt: 0.5 }}>
              Download and install Ollama from{' '}
              <a href="https://ollama.com" target="_blank" rel="noreferrer" style={{ color: tint }}>
                ollama.com
              </a>
              .
            </Typography>

            <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 2 }}>
              Step 2: Run a Model
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2, mt: 0.5 }}>
              Open your terminal and run the following command to download and start a model:
            </Typography>
            <Box
              sx={{
                bgcolor: alpha(tint, 0.05),
                border: '1px solid',
                borderColor: alpha(tint, 0.15),
                borderRadius: 1,
                p: 1.5,
                mt: 1,
                ml: 2,
                fontFamily: 'monospace',
                fontSize: '0.85rem',
              }}
            >
              ollama run llama3
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2, mt: 1 }}>
              Leave the terminal open. Your model is now running at{' '}
              <strong>http://localhost:11434</strong>.
            </Typography>

            <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 2 }}>
              Step 3: Connect to Platform
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2, mt: 0.5 }}>
              In the "Run Locally" card, select <strong>Ollama</strong> as the engine and use the
              Base URL <strong>http://localhost:11434</strong>.
            </Typography>
          </Box>
        )}

        {tab === 1 && (
          <Box>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>
              Run Models with LM Studio
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              LM Studio offers a full graphical user interface to search for, download, and run
              models from Hugging Face.
            </Typography>

            <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 2 }}>
              Step 1: Install LM Studio
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2, mt: 0.5 }}>
              Download and install LM Studio from{' '}
              <a
                href="https://lmstudio.ai"
                target="_blank"
                rel="noreferrer"
                style={{ color: tint }}
              >
                lmstudio.ai
              </a>
              .
            </Typography>

            <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 2 }}>
              Step 2: Download a Model
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2, mt: 0.5 }}>
              Open LM Studio, search for "Llama-3", and download one of the <strong>Q4_K_M</strong>{' '}
              variants from the right panel.
            </Typography>

            <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 2 }}>
              Step 3: Start Local Server
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2, mt: 0.5 }}>
              Click the <strong>↔️ (Local Server)</strong> icon on the left sidebar. Select your
              downloaded model from the top dropdown, and click the green{' '}
              <strong>Start Server</strong> button.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2, mt: 1 }}>
              Your server is now running at <strong>http://localhost:1234/v1</strong>.
            </Typography>

            <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 2 }}>
              Step 4: Connect to Platform
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2, mt: 0.5 }}>
              In the "Run Locally" card, select <strong>LM Studio / Compatible</strong> as the
              engine and use the Base URL <strong>http://localhost:1234/v1</strong>.
            </Typography>
          </Box>
        )}

        {tab === 2 && (
          <Box>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>
              Exposing Localhost with Ngrok (Cloud Users)
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              If you are accessing a live, cloud-hosted version of this platform, it cannot connect
              to your local computer's <strong>localhost</strong> directly. You must expose your
              local LLM to the internet using a tunneling service like Ngrok.
            </Typography>

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle2" fontWeight={700}>
              Step 1: Install Ngrok
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2, mt: 0.5 }}>
              Sign up and download Ngrok from{' '}
              <a href="https://ngrok.com" target="_blank" rel="noreferrer" style={{ color: tint }}>
                ngrok.com
              </a>
              . Authenticate it using your token.
            </Typography>

            <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 2 }}>
              Step 2: Start your Local LLM
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2, mt: 0.5 }}>
              Run Ollama or LM Studio as normal on your machine.
            </Typography>

            <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 2 }}>
              Step 3: Tunnel the Port
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2, mt: 0.5 }}>
              Open a new terminal window and start an Ngrok tunnel pointing to your LLM's port.
            </Typography>
            <Box
              sx={{
                bgcolor: alpha(tint, 0.05),
                border: '1px solid',
                borderColor: alpha(tint, 0.15),
                borderRadius: 1,
                p: 1.5,
                mt: 1,
                ml: 2,
                fontFamily: 'monospace',
                fontSize: '0.85rem',
              }}
            >
              # For Ollama (Port 11434)
              <br />
              ngrok http 11434
              <br />
              <br />
              # For LM Studio (Port 1234)
              <br />
              ngrok http 1234
            </Box>

            <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 2 }}>
              Step 4: Connect to Platform
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2, mt: 0.5 }}>
              Ngrok will output a public URL (e.g.,{' '}
              <strong>https://8a2b-12-34.ngrok-free.app</strong>).
              <br />
              <br />
              Copy that exact URL and paste it as the <strong>Base URL</strong> in the "Run Locally"
              setup card. (If using LM Studio, append <strong>/v1</strong> to the URL).
            </Typography>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
