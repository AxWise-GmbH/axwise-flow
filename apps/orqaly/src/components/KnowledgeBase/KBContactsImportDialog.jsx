import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  useTheme,
  alpha,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

import AppIcon from '../icons/AppIcon';

export default function KBContactsImportDialog({ open, onClose, onImport }) {
  const theme = useTheme();
  const [csvText, setCsvText] = useState('');
  const [parsedContacts, setParsedContacts] = useState([]);
  const [error, setError] = useState('');
  const [successCount, setSuccessCount] = useState(0);

  const handleTextChange = (e) => {
    setCsvText(e.target.value);
    parseContactsContent(e.target.value);
  };

  const parseContactsContent = (text) => {
    if (!text.trim()) {
      setParsedContacts([]);
      setError('');
      return;
    }

    if (text.includes('BEGIN:VCARD')) {
      parseVCF(text);
    } else {
      parseCSV(text);
    }
  };

  const parseVCF = (text) => {
    try {
      const cards = text.split('END:VCARD');
      const contacts = [];

      for (const card of cards) {
        if (!card.includes('BEGIN:VCARD')) continue;

        const contact = {
          name: '',
          email: '',
          phone: '',
          attitude: 'neutral',
          comment: '',
        };

        const lines = card.split('\n');
        for (let line of lines) {
          line = line.trim();
          if (!line) continue;

          if (line.startsWith('FN:')) {
            contact.name = line.substring(3).trim();
          } else if (line.startsWith('FN;') && line.includes(':')) {
            contact.name = line.substring(line.indexOf(':') + 1).trim();
          } else if (!contact.name && (line.startsWith('N:') || line.startsWith('N;'))) {
            const nVal = line.substring(line.indexOf(':') + 1).trim();
            const parts = nVal.split(';').map((p) => p.trim());
            const last = parts[0] || '';
            const first = parts[1] || '';
            const middle = parts[2] || '';
            contact.name = `${first} ${middle} ${last}`.replace(/\s+/g, ' ').trim();
          }

          if (line.startsWith('EMAIL:') || (line.startsWith('EMAIL;') && line.includes(':'))) {
            contact.email = line.substring(line.indexOf(':') + 1).trim();
          }

          if (line.startsWith('TEL:') || (line.startsWith('TEL;') && line.includes(':'))) {
            contact.phone = line.substring(line.indexOf(':') + 1).trim();
          }

          if (line.startsWith('NOTE:') || (line.startsWith('NOTE;') && line.includes(':'))) {
            contact.comment = line.substring(line.indexOf(':') + 1).trim();
          }
        }

        if (contact.name) {
          contacts.push(contact);
        }
      }

      setParsedContacts(contacts);
      setError('');
      setSuccessCount(contacts.length);
    } catch {
      setError('Failed to parse vCard format.');
      setParsedContacts([]);
    }
  };

  const parseCSV = (text) => {
    try {
      const lines = text.split('\n');
      const contacts = [];
      let header = [];
      let dataLines = [];

      if (lines.length > 0) {
        const firstLine = lines[0].toLowerCase();
        if (
          firstLine.includes('name') ||
          firstLine.includes('email') ||
          firstLine.includes('phone') ||
          firstLine.includes('attitude')
        ) {
          header = lines[0].split(',').map((h) => h.trim().toLowerCase());
          dataLines = lines.slice(1);
        } else {
          header = ['name', 'email', 'phone', 'attitude', 'comment'];
          dataLines = lines;
        }
      }

      for (let line of dataLines) {
        if (!line.trim()) continue;

        const parts = line.split(',').map((p) => p.trim());
        const contact = {
          name: '',
          email: '',
          phone: '',
          attitude: 'neutral',
          comment: '',
        };

        header.forEach((fieldName, index) => {
          if (parts[index] !== undefined) {
            if (fieldName === 'name') contact.name = parts[index];
            else if (fieldName === 'email') contact.email = parts[index];
            else if (fieldName === 'phone') contact.phone = parts[index];
            else if (
              fieldName === 'comment' ||
              fieldName === 'notes' ||
              fieldName === 'description'
            )
              contact.comment = parts[index];
            else if (fieldName === 'attitude') {
              const val = parts[index].toLowerCase().replace(' ', '_');
              if (['vip', 'friendly', 'neutral', 'cold_lead', 'hostile'].includes(val)) {
                contact.attitude = val;
              }
            }
          }
        });

        if (!header.includes('name') && parts[0]) contact.name = parts[0];
        if (!header.includes('email') && parts[1]) contact.email = parts[1];
        if (!header.includes('phone') && parts[2]) contact.phone = parts[2];

        if (contact.name) {
          contacts.push(contact);
        }
      }

      setParsedContacts(contacts);
      setError('');
      setSuccessCount(contacts.length);
    } catch {
      setError('Failed to parse CSV. Please check formatting.');
      setParsedContacts([]);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      setCsvText(text);
      parseContactsContent(text);
    };
    reader.readAsText(file);
  };

  const handleImportSubmit = () => {
    if (parsedContacts.length === 0) {
      setError('No contacts parsed to import');
      return;
    }
    onImport(parsedContacts);
    handleReset();
  };

  const handleReset = () => {
    setCsvText('');
    setParsedContacts([]);
    setError('');
    setSuccessCount(0);
    onClose();
  };

  const templateText = `Name,Email,Phone,Attitude,Comment
John Doe,john@example.com,+12345678,vip,Interested in seed investment
Jane Smith,jane@work.com,,friendly,Needs product demo
Bob Miller,bob@host.com,+9876543,,Interested in developer role`;

  return (
    <Dialog
      open={open}
      onClose={handleReset}
      maxWidth="md"
      fullWidth
      slotProps={{
        paper: {
          sx: { borderRadius: 3, p: 1 },
        },
      }}
    >
      <DialogTitle
        sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Import Contacts
        </Typography>
        <IconButton onClick={handleReset} size="small">
          <AppIcon name="Close" fallback={CloseIcon} />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
        {/* Compliance Warning banner */}
        <Alert
          severity="warning"
          icon={<AppIcon name="InfoOutlined" fallback={InfoOutlinedIcon} />}
          sx={{
            borderRadius: 2.5,
            bgcolor: alpha(theme.palette.warning.main, 0.05),
            color: 'warning.dark',
            border: '1px solid',
            borderColor: alpha(theme.palette.warning.main, 0.2),
            '& .MuiAlert-icon': { color: 'warning.main' },
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
            BYOK/BYOS Privacy Compliance
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.4 }}>
            Ensure you have configured your Bring Your Own Keys (BYOK) and Bring Your Own Storage
            (BYOS) connections in settings before uploading or importing contact lists to maintain
            full privacy ownership and data sovereignty.
          </Typography>
        </Alert>

        <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
          {/* File select / Input block */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Paste CSV Text
            </Typography>
            <TextField
              multiline
              rows={6}
              placeholder={templateText}
              value={csvText}
              onChange={handleTextChange}
              fullWidth
              sx={{
                '& .MuiInputBase-root': {
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  borderRadius: 2,
                },
              }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Button
                variant="outlined"
                component="label"
                startIcon={
                  <AppIcon name="CloudUploadOutlined" fallback={CloudUploadOutlinedIcon} />
                }
                size="small"
                sx={{ textTransform: 'none', borderRadius: 2, fontWeight: 600 }}
              >
                Upload File (.csv, .vcf)
                <input type="file" accept=".csv,.vcf" hidden onChange={handleFileUpload} />
              </Button>
              <Button
                variant="text"
                size="small"
                onClick={() => handleTextChange({ target: { value: templateText } })}
                sx={{ textTransform: 'none', fontSize: '0.75rem' }}
              >
                Load Template
              </Button>
            </Box>
          </Box>

          {/* Preview grid */}
          <Box sx={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>Preview ({successCount} parsed)</span>
              {error && (
                <span style={{ color: theme.palette.error.main, fontSize: '0.75rem' }}>
                  {error}
                </span>
              )}
            </Typography>

            <TableContainer
              component={Paper}
              variant="outlined"
              sx={{ flex: 1, borderRadius: 2, overflow: 'auto', maxHeight: 200 }}
            >
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, bgcolor: 'background.paper' }}>
                      Name
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, bgcolor: 'background.paper' }}>
                      Email
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, bgcolor: 'background.paper' }}>
                      Attitude
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {parsedContacts.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        align="center"
                        sx={{ py: 4, color: 'text.disabled', fontSize: '0.75rem' }}
                      >
                        No preview available
                      </TableCell>
                    </TableRow>
                  ) : (
                    parsedContacts.slice(0, 10).map((contact, idx) => (
                      <TableRow key={idx}>
                        <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>
                          {contact.name}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.75rem' }}>{contact.email || '—'}</TableCell>
                        <TableCell sx={{ fontSize: '0.75rem' }}>{contact.attitude}</TableCell>
                      </TableRow>
                    ))
                  )}
                  {parsedContacts.length > 10 && (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        align="center"
                        sx={{
                          py: 1,
                          color: 'text.secondary',
                          fontSize: '0.7rem',
                          fontStyle: 'italic',
                        }}
                      >
                        And {parsedContacts.length - 10} more...
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, pt: 1 }}>
        <Button
          onClick={handleReset}
          sx={{ textTransform: 'none', borderRadius: 2, fontWeight: 600 }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleImportSubmit}
          variant="contained"
          disabled={parsedContacts.length === 0}
          sx={{ textTransform: 'none', borderRadius: 2, fontWeight: 600 }}
        >
          Import Contacts
        </Button>
      </DialogActions>
    </Dialog>
  );
}
