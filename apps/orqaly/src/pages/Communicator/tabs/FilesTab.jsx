/**
 * [module: design-system + connection-hub]
 * FilesTab - list of files uploaded via the Telegram bot.
 * Mobile-first: cards on small screens, table on desktop.
 */
import { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Tooltip,
  Chip,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  useTheme,
  alpha,
  useMediaQuery,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import {
  getCommunicatorFiles,
  deleteCommunicatorFile,
  getCommunicatorFileUrl,
} from '../../../services/communicatorService';
import PaneStatusStrip from '../components/PaneStatusStrip';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import FormDialog from '../../../components/Common/FormDialog';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';

import AppIcon from '../../../components/icons/AppIcon';

export default function FilesTab() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [files, setFiles] = useState(null);
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState(null);

  async function reload() {
    setErr('');
    setFiles(null);
    try {
      const data = await getCommunicatorFiles({ limit: 100 });
      setFiles(data);
    } catch (e) {
      setErr(e.message);
      setFiles([]);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleDelete(f) {
    if (!confirm(`Delete ${f.filename}? This cannot be undone.`)) return;
    try {
      await deleteCommunicatorFile(f.id);
      setFiles((cur) => cur.filter((x) => x.id !== f.id));
    } catch (e) {
      setErr(e.message);
    }
  }

  async function handleDownload(f) {
    try {
      const url = await getCommunicatorFileUrl(f.id);
      if (url) window.open(url, '_blank', 'noopener');
    } catch (e) {
      setErr(e.message);
    }
  }

  // Status strip stats
  const totalBytes = (files || []).reduce((a, f) => a + (Number(f.size_bytes) || 0), 0);
  const expiringSoon = (files || []).filter((f) => {
    if (!f.expires_at) return false;
    const days = (new Date(f.expires_at) - Date.now()) / 86400000;
    return days <= 7 && days >= 0;
  }).length;

  return (
    <Box>
      <PaneStatusStrip
        stats={[
          {
            value: files?.length ?? '-',
            label: 'Files stored',
            color: 'primary',
            icon: InsertDriveFileOutlinedIcon,
          },
          {
            value: fmtBytes(totalBytes),
            label: 'Storage used',
            color: 'info',
            icon: StorageOutlinedIcon,
          },
          {
            value: expiringSoon,
            label: 'Expiring ≤ 7 days',
            color: expiringSoon > 0 ? 'warning' : 'neutral',
            icon: HourglassEmptyOutlinedIcon,
          },
        ]}
      />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.92rem', flex: 1 }}>
          Files forwarded to the bot
        </Typography>
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={reload}>
            <AppIcon name="Refresh" fallback={RefreshIcon} sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>
      {err && (
        <Alert severity="error" sx={{ borderRadius: 2, mb: 1.5 }}>
          {err}
        </Alert>
      )}
      {files === null && (
        <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress size={24} />
        </Box>
      )}
      {files?.length === 0 && <EmptyState />}
      {files?.length > 0 &&
        (isMobile ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {files.map((f) => (
              <FileCard
                key={f.id}
                file={f}
                onDelete={() => handleDelete(f)}
                onDownload={() => handleDownload(f)}
                onPreview={() => setPreview(f)}
              />
            ))}
          </Box>
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2.5 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem' }}></TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem' }}>Filename</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem' }}>Size</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem' }}>Extracted</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem' }}>Sent</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem' }}>Expires</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.72rem' }}>
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {files.map((f) => (
                  <TableRow key={f.id} hover>
                    <TableCell>
                      <FileIcon mime={f.mime_type} />
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: '0.78rem',
                        maxWidth: 260,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {f.filename}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                      {fmtBytes(f.size_bytes)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={f.extraction_method || '-'}
                        sx={{ height: 18, fontSize: '0.62rem' }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                      {fmtDate(f.created_at)}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                      {fmtDate(f.expires_at)}
                    </TableCell>
                    <TableCell align="right">
                      {f.extracted_text && (
                        <Tooltip title="Preview extracted text">
                          <IconButton size="small" onClick={() => setPreview(f)}>
                            <AppIcon
                              name="Visibility"
                              fallback={VisibilityIcon}
                              sx={{ fontSize: 16 }}
                            />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="Download">
                        <IconButton size="small" onClick={() => handleDownload(f)}>
                          <AppIcon name="Download" fallback={DownloadIcon} sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          onClick={() => handleDelete(f)}
                          sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}
                        >
                          <AppIcon
                            name="DeleteOutline"
                            fallback={DeleteOutlineIcon}
                            sx={{ fontSize: 16 }}
                          />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ))}
      <PreviewDialog file={preview} onClose={() => setPreview(null)} />
    </Box>
  );
}

function FileCard({ file, onDelete, onDownload, onPreview }) {
  const theme = useTheme();
  return (
    <Paper
      variant="outlined"
      sx={{ p: 1.25, borderRadius: 2.5, display: 'flex', alignItems: 'center', gap: 1.25 }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: 1.5,
          flexShrink: 0,
          bgcolor: alpha(theme.palette.primary.main, 0.1),
          color: 'primary.main',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <FileIcon mime={file.mime_type} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.82rem' }} noWrap>
          {file.filename}
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: 'text.secondary', fontSize: '0.68rem', display: 'block' }}
        >
          {fmtBytes(file.size_bytes)} · {fmtDate(file.created_at)}
        </Typography>
      </Box>
      {file.extracted_text && (
        <IconButton size="small" onClick={onPreview}>
          <AppIcon name="Visibility" fallback={VisibilityIcon} sx={{ fontSize: 16 }} />
        </IconButton>
      )}
      <IconButton size="small" onClick={onDownload}>
        <AppIcon name="Download" fallback={DownloadIcon} sx={{ fontSize: 16 }} />
      </IconButton>
      <IconButton
        size="small"
        onClick={onDelete}
        sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}
      >
        <AppIcon name="DeleteOutline" fallback={DeleteOutlineIcon} sx={{ fontSize: 16 }} />
      </IconButton>
    </Paper>
  );
}

function FileIcon({ mime }) {
  if (/pdf/i.test(mime || ''))
    return (
      <AppIcon
        name="PictureAsPdfOutlined"
        fallback={PictureAsPdfOutlinedIcon}
        sx={{ fontSize: 16 }}
      />
    );
  if (/^image/i.test(mime || ''))
    return <AppIcon name="ImageOutlined" fallback={ImageOutlinedIcon} sx={{ fontSize: 16 }} />;
  if (/text|markdown|json/i.test(mime || ''))
    return (
      <AppIcon
        name="DescriptionOutlined"
        fallback={DescriptionOutlinedIcon}
        sx={{ fontSize: 16 }}
      />
    );
  return (
    <AppIcon
      name="InsertDriveFileOutlined"
      fallback={InsertDriveFileOutlinedIcon}
      sx={{ fontSize: 16 }}
    />
  );
}

function PreviewDialog({ file, onClose }) {
  return (
    <FormDialog
      open={!!file}
      onClose={onClose}
      title={file?.filename}
      subtitle={
        file
          ? `Extracted via ${file.extraction_method || 'unknown'} · ${fmtBytes(file.size_bytes)}`
          : ''
      }
      icon={DescriptionOutlinedIcon}
      maxWidth="md"
      hideCancel
      actions={
        <Button onClick={onClose} sx={{ borderRadius: 2, textTransform: 'none' }}>
          Close
        </Button>
      }
    >
      <Box
        component="pre"
        sx={{
          fontFamily: 'monospace',
          fontSize: '0.76rem',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          m: 0,
          color: 'text.secondary',
          maxHeight: '60vh',
          overflow: 'auto',
        }}
      >
        {file?.extracted_text || '(no extracted text)'}
      </Box>
    </FormDialog>
  );
}

function EmptyState() {
  const theme = useTheme();
  return (
    <Box
      sx={{
        py: 5,
        px: 2,
        textAlign: 'center',
        borderRadius: 3,
        bgcolor: alpha(theme.palette.primary.main, 0.04),
        border: '1px dashed',
        borderColor: 'divider',
      }}
    >
      <Box
        sx={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          mx: 'auto',
          mb: 1.5,
          bgcolor: alpha(theme.palette.primary.main, 0.1),
          color: 'primary.main',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AppIcon
          name="InsertDriveFileOutlined"
          fallback={InsertDriveFileOutlinedIcon}
          sx={{ fontSize: 26 }}
        />
      </Box>
      <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5, fontSize: '0.92rem' }}>
        No files yet
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: 'text.secondary',
          display: 'block',
          maxWidth: 360,
          mx: 'auto',
          fontSize: '0.78rem',
        }}
      >
        Forward a PDF, photo, or document to the bot in Telegram (with a caption telling it what to
        do) and the file appears here.
      </Typography>
    </Box>
  );
}

function fmtBytes(n) {
  const x = Number(n) || 0;
  if (x < 1024) return `${x} B`;
  if (x < 1024 * 1024) return `${(x / 1024).toFixed(1)} KB`;
  return `${(x / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(s) {
  if (!s) return '-';
  return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
