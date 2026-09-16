import { useCallback, useState } from 'react';
import {
  previewImport,
  applyImport,
  cancelImport,
  fileToBase64,
} from '../../../../services/importKeysService';

/**
 * Stage machine:
 *   idle → uploading → scanning → parsing → preview → applying → done
 *                                       ↓
 *                                    blocked (VT malicious/unknown)
 */
export function useImportKeys() {
  const [stage, setStage] = useState('idle');
  const [importId, setImportId] = useState(null);
  const [previewRows, setPreviewRows] = useState([]);
  const [counts, setCounts] = useState({ parsed: 0, matched: 0, unknown: 0 });
  const [vtStatus, setVtStatus] = useState(null);
  const [error, setError] = useState(null);
  const [applyResults, setApplyResults] = useState(null);
  const [securityWarning, setSecurityWarning] = useState(null);
  const [securityBlock, setSecurityBlock] = useState(null);

  const reset = useCallback(() => {
    setStage('idle');
    setImportId(null);
    setPreviewRows([]);
    setCounts({ parsed: 0, matched: 0, unknown: 0 });
    setVtStatus(null);
    setError(null);
    setApplyResults(null);
    setSecurityWarning(null);
    setSecurityBlock(null);
  }, []);

  const runPreview = useCallback(async ({ sourceType, file, text, format }) => {
    setError(null);
    try {
      setStage('uploading');
      let content;
      let filename = null;
      if (sourceType === 'file') {
        content = await fileToBase64(file);
        filename = file.name;
        setStage('scanning');
      } else {
        content = text;
        setStage('parsing');
      }
      const result = await previewImport({ sourceType, content, filename, format });
      setImportId(result.importId);
      setPreviewRows(result.preview || []);
      setCounts(result.counts || { parsed: 0, matched: 0, unknown: 0 });
      setVtStatus(result.vtStatus || null);
      setSecurityWarning(result.securityWarning || null);
      setStage('preview');
      return result;
    } catch (err) {
      if (err.blocked) {
        setStage('blocked');
        setError(err.message);
        if (err.severity || err.flags) {
          setSecurityBlock({ severity: err.severity, flags: err.flags || [] });
        }
        return { blocked: true, error: err.message };
      }
      setStage('idle');
      setError(err.message);
      throw err;
    }
  }, []);

  const runApply = useCallback(
    async (selections) => {
      if (!importId) return;
      setStage('applying');
      try {
        const result = await applyImport({ importId, selections });
        setApplyResults(result);
        setStage('done');
        return result;
      } catch (err) {
        setError(err.message);
        setStage('preview');
        throw err;
      }
    },
    [importId]
  );

  const runCancel = useCallback(async () => {
    if (!importId) {
      reset();
      return;
    }
    try {
      await cancelImport(importId);
    } catch {
      /* noop */
    }
    reset();
  }, [importId, reset]);

  return {
    stage,
    importId,
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
    setPreviewRows,
  };
}
