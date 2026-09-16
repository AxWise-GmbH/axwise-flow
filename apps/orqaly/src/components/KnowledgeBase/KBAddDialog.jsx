import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Autocomplete,
  CircularProgress,
  Alert,
  useTheme,
  alpha,
} from '@mui/material';
import FormDialog, { FORM_FIELD_SX } from '../Common/FormDialog';
import AddIcon from '@mui/icons-material/Add';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';

import { addDocument, updateDocument } from '../../services/knowledgeBaseService';
import { listOrganizations } from '../../services/organizationService';
import { loadConcilium } from '../../services/conciliumBackend';
import { uploadKBFile, validateKBFile, formatFileSize } from '../../services/kbFileService';
import { supabase, hasSupabase } from '../../lib/supabase';

import AppIcon from '../icons/AppIcon';

const CATEGORIES = ['general', 'technical', 'business', 'legal', 'support', 'other'];
const OWNER_TYPES = [
  { value: 'user', label: 'My KB' },
  { value: 'agent', label: 'Agent' },
  { value: 'team', label: 'Team' },
  { value: 'partner', label: 'Partner' },
];

const TYPE_TABS = [
  { id: 'note', label: 'Note', icon: DescriptionOutlinedIcon },
  { id: 'file', label: 'File', icon: InsertDriveFileOutlinedIcon },
  { id: 'link', label: 'Link', icon: LinkOutlinedIcon },
];

export default function KBAddDialog({
  open,
  onClose,
  onSaved,
  editDoc = null,
  existingTags = [],
  bookmarkMode = false,
}) {
  const theme = useTheme();
  const isEdit = !!editDoc;
  const fileRef = useRef(null);

  const [contentType, setContentType] = useState(
    editDoc?.content_type || (bookmarkMode ? 'link' : 'note')
  );
  const [title, setTitle] = useState(editDoc?.title || '');
  const [content, setContent] = useState(editDoc?.content || '');
  const [category, setCategory] = useState(editDoc?.category || (bookmarkMode ? 'bookmark' : 'general'));
  const [tags, setTags] = useState(editDoc?.tags || []);
  const [ownerType, setOwnerType] = useState(editDoc?.owner_type || 'user');
  const [ownerId, setOwnerId] = useState(editDoc?.owner_id || '');
  const [url, setUrl] = useState(editDoc?.url || '');
  const [isPinned, setIsPinned] = useState(editDoc?.is_pinned || false);

  // Organization + Consilium scoping (optional)
  const [organizationId, setOrganizationId] = useState(editDoc?.organization_id || '');
  const [conciliumId, setConciliumId] = useState(editDoc?.concilium_id || '');
  const [orgs, setOrgs] = useState([]);
  const [boards, setBoards] = useState([]);

  // Load organizations + consilium boards once the dialog opens.
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    (async () => {
      const [orgList, boardList] = await Promise.all([
        listOrganizations().catch(() => []),
        loadConcilium().catch(() => []),
      ]);
      if (!alive) return;
      setOrgs(Array.isArray(orgList) ? orgList : []);
      setBoards(Array.isArray(boardList) ? boardList : []);
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  // Picking an organization defaults the consilium to its linked board
  // (organizations.consilium_id); the user can still choose any board.
  const handleOrgChange = useCallback(
    (e) => {
      const nextOrgId = e.target.value;
      setOrganizationId(nextOrgId);
      const org = orgs.find((o) => o.id === nextOrgId);
      if (org?.consilium_id) setConciliumId(org.consilium_id);
    },
    [orgs]
  );

  // File state
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleFileSelect = useCallback(
    (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      const check = validateKBFile(f);
      if (!check.ok) {
        setFileError(check.error);
        return;
      }
      setFile(f);
      setFileError('');
      if (!title) setTitle(f.name);
    },
    [title]
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError('');
    try {
      let fileMeta = {};

      // Upload file if needed
      if (contentType === 'file' && file && !isEdit) {
        let userId = null;
        if (hasSupabase()) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          userId = user?.id;
        }
        fileMeta = await uploadKBFile(userId || 'local', file);
      }

      // Bookmark mode: always a link under category 'bookmark', with a
      // 'bookmark' tag so it surfaces in the Bookmarks tab even if the raw
      // category is later edited. Other tags act as collection labels.
      const finalCategory = bookmarkMode ? 'bookmark' : category;
      const finalTags = bookmarkMode ? Array.from(new Set(['bookmark', ...tags])) : tags;

      const doc = {
        title: title.trim() || undefined,
        content: content.trim() || undefined,
        category: finalCategory,
        tags: finalTags,
        owner_type: ownerType,
        owner_id: ownerType !== 'user' ? ownerId.trim() : null,
        content_type: contentType,
        is_pinned: isPinned,
        organization_id: organizationId || null,
        concilium_id: conciliumId || null,
        ...(contentType === 'link' ? { url: url.trim() } : {}),
        ...fileMeta,
      };

      let savedId = null;
      if (isEdit) {
        await updateDocument(editDoc.id, doc);
        savedId = editDoc.id;
        onSaved?.({ mode: 'edit', id: savedId, doc });
      } else {
        const created = await addDocument(doc);
        savedId = created?.id ?? null;
        onSaved?.({ mode: 'add', id: savedId, doc });
      }

      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [
    contentType,
    title,
    content,
    category,
    tags,
    ownerType,
    ownerId,
    url,
    isPinned,
    organizationId,
    conciliumId,
    file,
    isEdit,
    editDoc,
    onSaved,
    onClose,
    bookmarkMode,
  ]);

  const canSave = () => {
    if (contentType === 'note' && !content.trim()) return false;
    if (contentType === 'file' && !file && !isEdit) return false;
    if (contentType === 'link' && !url.trim()) return false;
    return true;
  };

  return (
    <FormDialog
      open={open}
      onClose={() => !saving && onClose()}
      title={
        isEdit
          ? bookmarkMode
            ? 'Edit Bookmark'
            : 'Edit Document'
          : bookmarkMode
            ? 'Add Bookmark'
            : 'Add to Knowledge Base'
      }
      icon={AddIcon}
      primaryLabel={saving ? 'Saving...' : isEdit ? 'Update' : 'Add'}
      onPrimary={handleSave}
      primaryDisabled={saving || !canSave()}
      primaryLoading={saving}
      contentSx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
    >
      {error && (
        <Alert severity="error" onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {/* Type selector (only for new docs; hidden in bookmark mode — always a link) */}
      {!isEdit && !bookmarkMode && (
        <Box
          sx={{
            bgcolor: alpha(theme.palette.text.primary, 0.04),
            p: 0.5,
            borderRadius: 3,
            width: 'fit-content',
            display: 'flex',
          }}
        >
          {TYPE_TABS.map((t) => (
            <Button
              key={t.id}
              startIcon={<AppIcon fallback={t.icon} sx={{ fontSize: 18 }} />}
              onClick={() => setContentType(t.id)}
              sx={{
                borderRadius: 2.5,
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.82rem',
                bgcolor:
                  contentType === t.id ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
                color: contentType === t.id ? 'primary.main' : 'text.secondary',
              }}
            >
              {t.label}
            </Button>
          ))}
        </Box>
      )}
      {/* Title */}
      <TextField
        label="Title"
        size="small"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={contentType === 'file' ? 'Auto from filename' : 'Auto from content'}
        sx={FORM_FIELD_SX}
      />
      {/* Note: content field */}
      {(contentType === 'note' || contentType === 'template') && (
        <TextField
          label="Content"
          multiline
          minRows={4}
          maxRows={12}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write or paste content..."
          required
        />
      )}
      {/* File: upload zone */}
      {contentType === 'file' && !isEdit && (
        <Box
          onClick={() => fileRef.current?.click()}
          sx={{
            border: '2px dashed',
            borderColor: file ? 'success.main' : alpha(theme.palette.text.primary, 0.2),
            borderRadius: 2,
            p: 3,
            textAlign: 'center',
            cursor: 'pointer',
            bgcolor: file ? alpha(theme.palette.success.main, 0.04) : 'transparent',
            '&:hover': {
              borderColor: 'primary.main',
              bgcolor: alpha(theme.palette.primary.main, 0.04),
            },
          }}
        >
          <input ref={fileRef} type="file" hidden onChange={handleFileSelect} />
          <AppIcon
            name="CloudUploadOutlined"
            fallback={CloudUploadOutlinedIcon}
            sx={{ fontSize: 36, color: 'text.secondary', mb: 1 }}
          />
          {file ? (
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {file.name} ({formatFileSize(file.size)})
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Click to select file (max 25 MB)
            </Typography>
          )}
          {fileError && (
            <Typography variant="caption" color="error">
              {fileError}
            </Typography>
          )}
        </Box>
      )}
      {/* Link: URL field */}
      {contentType === 'link' && (
        <>
          <TextField
            label="URL"
            size="small"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            required
          />
          <TextField
            label="Description"
            size="small"
            multiline
            minRows={2}
            maxRows={4}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Optional notes about this link..."
          />
        </>
      )}
      {/* Category + Owner */}
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        {!bookmarkMode && (
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>Category</InputLabel>
            <Select value={category} label="Category" onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <MenuItem key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Owner</InputLabel>
          <Select value={ownerType} label="Owner" onChange={(e) => setOwnerType(e.target.value)}>
            {OWNER_TYPES.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {ownerType !== 'user' && (
          <TextField
            size="small"
            label={`${ownerType} ID`}
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            sx={{ flex: 1 }}
            placeholder={`Enter ${ownerType} ID`}
          />
        )}
      </Box>
      {/* Organization + Consilium scoping */}
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <FormControl size="small" sx={{ flex: 1 }}>
          <InputLabel>Organization</InputLabel>
          <Select value={organizationId} label="Organization" onChange={handleOrgChange}>
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {orgs.map((o) => (
              <MenuItem key={o.id} value={o.id}>
                {o.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ flex: 1 }}>
          <InputLabel>Consilium</InputLabel>
          <Select
            value={conciliumId}
            label="Consilium"
            onChange={(e) => setConciliumId(e.target.value)}
          >
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {boards.map((b) => (
              <MenuItem key={b.id} value={b.id}>
                {b.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
      {/* Tags */}
      <Autocomplete
        multiple
        freeSolo
        size="small"
        options={existingTags}
        value={tags}
        onChange={(_, v) => setTags(v)}
        renderTags={(value, getTagProps) =>
          value.map((t, i) => (
            <Chip
              {...getTagProps({ index: i })}
              key={t}
              label={`#${t}`}
              size="small"
              sx={{ fontSize: '0.7rem' }}
            />
          ))
        }
        renderInput={(params) => (
          <TextField
            {...params}
            label={bookmarkMode ? 'Collections' : 'Tags'}
            placeholder={bookmarkMode ? 'e.g. research, competitors...' : 'Add tags...'}
          />
        )}
      />
      {/* Pin toggle */}
      <Button
        size="small"
        variant={isPinned ? 'contained' : 'outlined'}
        color="warning"
        onClick={() => setIsPinned(!isPinned)}
        sx={{ textTransform: 'none', fontWeight: 600, width: 'fit-content', fontSize: '0.78rem' }}
      >
        {isPinned ? 'Pinned' : 'Pin this document'}
      </Button>
    </FormDialog>
  );
}
