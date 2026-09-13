/**
 * DataCard - the merged "Data" step (replaces the old Knowledge + Connect
 * steps). One cohesive, mobile-first card that brings every kind of company
 * material into the assistant's Knowledge Base / CRM. Pick a source from the
 * segmented selector, add it, and the running summary tracks what landed -
 * several sources can be added in one step before "Continue" finishes it.
 *
 * Sources (reusing the existing service layer, no logic duplicated):
 *  - Company info / Conversations: file and/or pasted notes -> Knowledge Base
 *    (uploadKBFile + addDocument), tagged company-info / conversation-examples.
 *  - Contacts: .csv/.vcf file or pasted CSV/vCard -> Contacts CRM (parseContacts
 *    + importContacts), phone or email.
 *  - Files: bulk multi-file upload -> Knowledge Base (bulkUploadFiles).
 *  - Obsidian: a .md vault export -> Knowledge Base (syncObsidian).
 *    Notion stays a disabled hint (add the key in BYOK).
 */
import { useRef, useState } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Chip,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import DatasetRoundedIcon from '@mui/icons-material/DatasetRounded';
import { supabase, hasSupabase } from '../../../lib/supabase';
import { uploadKBFile, validateKBFile, formatFileSize } from '../../../services/kbFileService';
import { addDocument } from '../../../services/knowledgeBaseService';
import { importContacts } from '../../../services/contactsService';
import { bulkUploadFiles, syncObsidian } from '../../../services/assistantIngestService';
import { parseContacts } from '../../../utils/contactParsers';
import SetupCardShell from './SetupCardShell';

async function getUserId() {
  if (!hasSupabase()) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id || null;
}

function readText(file) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onerror = () => resolve('');
    r.onload = () => resolve(String(r.result || ''));
    r.readAsText(file);
  });
}

// Sources that share the "file and/or paste, then Add" pattern.
const PASTE_SOURCES = ['info', 'contacts', 'conversation'];

export default function DataCard({ onComplete, onSkip, embedded }) {
  const [source, setSource] = useState('info'); // info | contacts | conversation | files | obsidian
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState('');
  const [contactType, setContactType] = useState('phone'); // phone | mail
  const [counts, setCounts] = useState({ notes: 0, contacts: 0, files: 0, obsidian: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const filesRef = useRef(null);
  const vaultRef = useRef(null);

  const isContacts = source === 'contacts';
  const isPaste = PASTE_SOURCES.includes(source);
  const parsedCount = isContacts ? parseContacts(notes).contacts.length : 0;

  const changeSource = (_e, v) => {
    if (!v) return;
    setSource(v);
    setFile(null);
    setNotes('');
    setError(null);
  };

  // info / conversation keep the File for upload on Add; contacts read it to text now.
  const pickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (isContacts) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setNotes(String(ev.target?.result || ''));
        setError(null);
      };
      reader.readAsText(f);
      return;
    }
    const check = validateKBFile(f);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError(null);
    setFile(f);
  };

  // The in-card "Add" action for the paste-style sources: ingest, tally, reset
  // the inputs so another source can be added without leaving the step.
  const handleAdd = async () => {
    setError(null);
    setBusy(true);
    try {
      if (isContacts) {
        const { contacts } = parseContacts(notes);
        if (!contacts.length) throw new Error('Paste or upload contacts (CSV or vCard) first.');
        await importContacts(contacts.map((c) => ({ ...c, contact_type: contactType })));
        setCounts((c) => ({ ...c, contacts: c.contacts + contacts.length }));
      } else {
        const isConv = source === 'conversation';
        if (!file && !notes.trim()) {
          throw new Error(
            isConv
              ? 'Add a conversation file or paste an example.'
              : 'Add a file or paste some company info.'
          );
        }
        const tags = isConv ? ['conversation-examples'] : ['company-info'];
        const extra = isConv ? { source: 'conversation-example' } : {};
        let added = 0;
        if (file) {
          const userId = await getUserId();
          if (!userId) throw new Error('Sign-in required to upload files.');
          const meta = await uploadKBFile(userId, file);
          await addDocument({
            title: meta.file_name,
            content_type: isConv ? 'conversation' : 'file',
            category: 'company',
            tags,
            ...extra,
            ...meta,
          });
          added += 1;
        }
        if (notes.trim()) {
          await addDocument({
            title: isConv ? 'Conversation example' : 'Company info',
            content: notes.trim(),
            content_type: isConv ? 'conversation' : 'note',
            category: 'company',
            tags,
            ...extra,
          });
          added += 1;
        }
        setCounts((c) => ({ ...c, notes: c.notes + added }));
      }
      setFile(null);
      setNotes('');
    } catch (err) {
      setError(err.message || 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  const onFiles = async (e) => {
    const files = e.target.files;
    e.target.value = '';
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    try {
      const { added } = await bulkUploadFiles(files);
      setCounts((c) => ({ ...c, files: c.files + (added || 0) }));
    } catch (err) {
      setError(err.message || 'File upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const onVault = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setError(null);
    setBusy(true);
    try {
      const notesPayload = await Promise.all(
        files.map(async (f) => ({
          path: f.webkitRelativePath || f.name,
          content: await readText(f),
        }))
      );
      const { synced } = await syncObsidian(notesPayload);
      setCounts((c) => ({ ...c, obsidian: c.obsidian + (synced || 0) }));
    } catch (err) {
      setError(err.message || 'Obsidian sync failed.');
    } finally {
      setBusy(false);
    }
  };

  const total = counts.notes + counts.contacts + counts.files + counts.obsidian;

  const finish = () =>
    onComplete({
      config: {
        knowledge: { added: counts.notes + counts.contacts },
        connectors: { files: counts.files, obsidian: counts.obsidian },
      },
    });

  const pasteLabel = isContacts
    ? 'Paste contacts (CSV or vCard)'
    : source === 'conversation'
      ? 'Or paste a conversation example'
      : 'Or paste company info';

  return (
    <SetupCardShell
      title="Add your data"
      icon={DatasetRoundedIcon}
      embedded={embedded}
      primaryLabel={total > 0 ? 'Continue' : 'Done'}
      onPrimary={finish}
      busy={busy}
      onSkip={onSkip}
      error={error}
    >
      <ToggleButtonGroup
        size="small"
        exclusive
        value={source}
        onChange={changeSource}
        aria-label="Data source"
        sx={{
          flexWrap: 'wrap',
          '& .MuiToggleButton-root': {
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 2,
            px: 1.5,
          },
        }}
      >
        <ToggleButton value="info">Company info</ToggleButton>
        <ToggleButton value="contacts">Contacts</ToggleButton>
        <ToggleButton value="conversation">Conversations</ToggleButton>
        <ToggleButton value="files">Files</ToggleButton>
        <ToggleButton value="obsidian">Obsidian</ToggleButton>
      </ToggleButtonGroup>

      {isContacts && (
        <ToggleButtonGroup
          size="small"
          exclusive
          value={contactType}
          onChange={(_e, v) => v && setContactType(v)}
          aria-label="Contact type"
          sx={{
            '& .MuiToggleButton-root': {
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 2,
              px: 1.5,
            },
          }}
        >
          <ToggleButton value="phone">Phone</ToggleButton>
          <ToggleButton value="mail">Email</ToggleButton>
        </ToggleButtonGroup>
      )}

      {/* Paste-style sources: file and/or paste, then Add. */}
      {isPaste && (
        <>
          <Box>
            <input
              ref={inputRef}
              type="file"
              hidden
              accept={isContacts ? '.csv,.vcf' : undefined}
              onChange={pickFile}
            />
            <Button
              size="small"
              variant="outlined"
              onClick={() => inputRef.current?.click()}
              sx={{ textTransform: 'none', borderRadius: 2 }}
            >
              {isContacts ? 'Upload .csv / .vcf' : file ? 'Change file' : 'Choose a file'}
            </Button>
            {!isContacts && file && (
              <Typography variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
                {file.name} ({formatFileSize(file.size)})
              </Typography>
            )}
            {isContacts && parsedCount > 0 && (
              <Typography variant="caption" sx={{ ml: 1, color: 'success.main' }}>
                {parsedCount} contact{parsedCount === 1 ? '' : 's'} found
              </Typography>
            )}
          </Box>

          <TextField
            size="small"
            fullWidth
            multiline
            minRows={2}
            maxRows={6}
            label={pasteLabel}
            placeholder={
              isContacts
                ? 'Name,Email,Phone,Attitude,Comment'
                : source === 'conversation'
                  ? 'Paste a sample chat / email thread the assistant should learn from...'
                  : 'Who you are, what you do, key priorities...'
            }
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <Box>
            <Button
              size="small"
              variant="outlined"
              onClick={handleAdd}
              disabled={busy}
              sx={{ textTransform: 'none', borderRadius: 2, fontWeight: 700 }}
            >
              {isContacts ? 'Add contacts' : 'Add'}
            </Button>
          </Box>
        </>
      )}

      {/* Bulk file upload. */}
      {source === 'files' && (
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Upload files and folders - I&apos;ll read them into the knowledge base.
          </Typography>
          <input ref={filesRef} type="file" hidden multiple onChange={onFiles} />
          <Button
            size="small"
            variant="outlined"
            onClick={() => filesRef.current?.click()}
            disabled={busy}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            Upload files
          </Button>
        </Box>
      )}

      {/* Obsidian vault export. */}
      {source === 'obsidian' && (
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Sync an Obsidian vault export (.md notes). Notion is added later via its key in BYOK.
          </Typography>
          <input
            ref={vaultRef}
            type="file"
            hidden
            multiple
            accept=".md,text/markdown"
            onChange={onVault}
          />
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button
              size="small"
              variant="outlined"
              onClick={() => vaultRef.current?.click()}
              disabled={busy}
              sx={{ textTransform: 'none', borderRadius: 2 }}
            >
              Sync Obsidian (.md)
            </Button>
            <Button
              size="small"
              variant="outlined"
              disabled
              sx={{ textTransform: 'none', borderRadius: 2 }}
            >
              Notion (add key in BYOK)
            </Button>
          </Stack>
        </Box>
      )}

      {/* Running summary of what's landed across sources. */}
      {total > 0 && (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {counts.notes > 0 && (
            <Chip
              size="small"
              color="success"
              variant="outlined"
              label={`${counts.notes} note${counts.notes === 1 ? '' : 's'}`}
            />
          )}
          {counts.contacts > 0 && (
            <Chip
              size="small"
              color="success"
              variant="outlined"
              label={`${counts.contacts} contact${counts.contacts === 1 ? '' : 's'}`}
            />
          )}
          {counts.files > 0 && (
            <Chip
              size="small"
              color="success"
              variant="outlined"
              label={`${counts.files} file${counts.files === 1 ? '' : 's'}`}
            />
          )}
          {counts.obsidian > 0 && (
            <Chip
              size="small"
              color="success"
              variant="outlined"
              label={`${counts.obsidian} Obsidian note${counts.obsidian === 1 ? '' : 's'}`}
            />
          )}
        </Stack>
      )}
    </SetupCardShell>
  );
}
