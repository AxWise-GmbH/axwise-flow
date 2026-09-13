import { useState } from 'react';
import { Tabs, Tab, Box, Button, Alert, Typography, CircularProgress, Chip } from '@mui/material';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import FormDialog from '../../../../components/Common/FormDialog';
import ImportUploadTab from './ImportUploadTab';
import ImportPasteTab from './ImportPasteTab';
import ImportScanProgress from './ImportScanProgress';
import ImportPreviewTable from './ImportPreviewTable';
import { useImportKeys } from './useImportKeys';
import SecurityFlagAlert from '../../../../components/Common/SecurityFlagAlert';

export default function ImportKeysDialog({ open, onClose, onComplete }) {
  const [tab, setTab] = useState(0);
  const [pickedFile, setPickedFile] = useState(null);
  const [pasteText, setPasteText] = useState('');
  const [selections, setSelections] = useState([]);

  const {
    stage,
    previewRows,
    counts,
    vtStatus,
    error,
    applyResults,
    securityWarning,
    securityBlock,
    runPreview,
    runApply,
    runCancel,
    reset,
  } = useImportKeys();

  const close = async () => {
    if (stage !== 'idle' && stage !== 'done') await runCancel();
    else reset();
    setPickedFile(null);
    setPasteText('');
    setSelections([]);
    setTab(0);
    onClose();
  };

  const handleStart = async () => {
    if (tab === 0) {
      if (!pickedFile) return;
      await runPreview({ sourceType: 'file', file: pickedFile });
    } else {
      if (!pasteText.trim()) return;
      await runPreview({ sourceType: 'paste', text: pasteText, format: 'paste' });
    }
  };

  const handleApply = async () => {
    if (selections.length === 0) return;
    const result = await runApply(selections);
    if (result?.applied > 0) onComplete?.();
  };

  const isBusy = ['uploading', 'scanning', 'parsing', 'applying'].includes(stage);
  const canStart = (tab === 0 ? !!pickedFile : !!pasteText.trim()) && !isBusy;
  const canApply = stage === 'preview' && selections.length > 0;

  return (
    <FormDialog
      open={open}
      onClose={isBusy ? undefined : close}
      maxWidth="md"
      title="Import keys"
      icon={UploadFileOutlinedIcon}
      titleAdornment={
        vtStatus === 'clean' && stage !== 'idle' ? (
          <Chip
            size="small"
            label="VirusTotal ✓"
            color="success"
            variant="outlined"
            sx={{ ml: 1, height: 20 }}
          />
        ) : null
      }
      disableEscapeKeyDown={isBusy}
      actions={
        <>
          {stage === 'idle' && (
            <>
              <Button onClick={close}>Cancel</Button>
              <Button variant="contained" onClick={handleStart} disabled={!canStart}>
                Continue
              </Button>
            </>
          )}
          {stage === 'preview' && (
            <>
              <Button onClick={close}>Cancel</Button>
              <Button variant="contained" onClick={handleApply} disabled={!canApply}>
                Import {selections.length} {selections.length === 1 ? 'key' : 'keys'}
              </Button>
            </>
          )}
          {(stage === 'blocked' || stage === 'done') && (
            <Button variant="contained" onClick={close}>
              Close
            </Button>
          )}
          {isBusy && (
            <Button onClick={close} disabled>
              Please wait…
            </Button>
          )}
        </>
      }
    >
      {stage === 'idle' && (
        <>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
            <Tab label="Upload file" />
            <Tab label="Paste text" />
          </Tabs>

          {tab === 0 ? (
            <ImportUploadTab onFile={setPickedFile} disabled={isBusy} />
          ) : (
            <ImportPasteTab value={pasteText} onChange={setPasteText} disabled={isBusy} />
          )}

          {pickedFile && tab === 0 && (
            <Alert severity="info" sx={{ mt: 1.5 }}>
              Selected: <strong>{pickedFile.name}</strong> ({Math.round(pickedFile.size / 1024)} KB)
            </Alert>
          )}
        </>
      )}

      {isBusy && stage !== 'applying' && <ImportScanProgress stage={stage} />}

      {stage === 'applying' && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <CircularProgress />
          <Typography variant="body2" sx={{ mt: 2 }}>
            Saving {selections.length} keys - probing each provider...
          </Typography>
        </Box>
      )}

      {stage === 'blocked' && (
        <>
          <Alert severity="error">
            <Typography fontWeight={700}>Import blocked</Typography>
            {error}
          </Alert>
          {securityBlock && (
            <SecurityFlagAlert
              severity={securityBlock.severity}
              action="block"
              flags={securityBlock.flags}
            />
          )}
        </>
      )}

      {stage === 'preview' && (
        <>
          <Alert severity={counts.matched > 0 ? 'success' : 'warning'} sx={{ mb: 1.5 }}>
            Parsed <strong>{counts.parsed}</strong> entries - <strong>{counts.matched}</strong>{' '}
            matched known providers, <strong>{counts.unknown}</strong> unknown.
            {vtStatus && vtStatus !== 'skipped' && ` VirusTotal: ${vtStatus}.`}
          </Alert>
          {securityWarning && (
            <SecurityFlagAlert
              severity={securityWarning.severity}
              action="warn"
              flags={securityWarning.flags}
            />
          )}
          <ImportPreviewTable rows={previewRows} onSelectionsChange={setSelections} />
        </>
      )}

      {stage === 'done' && applyResults && (
        <Alert severity={applyResults.failed === 0 ? 'success' : 'warning'} sx={{ mb: 1.5 }}>
          Imported <strong>{applyResults.applied}</strong> keys.
          {applyResults.failed > 0 && ` ${applyResults.failed} failed validation.`}
        </Alert>
      )}

      {error && stage !== 'blocked' && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {error}
        </Alert>
      )}
    </FormDialog>
  );
}
