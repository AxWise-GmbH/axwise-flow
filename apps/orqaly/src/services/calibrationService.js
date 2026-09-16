/**
 * Calibration service — frontend API for the Library Universe calibration loop.
 *
 * Calibration runs as a server-side job (type='library-calibration') in two
 * phases: 'start' (generate 6 samples) and 'synthesize' (write criteria docs).
 * Between the two phases, the user walks through the wizard and leaves
 * comments on each sample.
 */
import { supabase } from '../lib/supabase';
import { waitForJobResult } from './agentJobService';

/**
 * Kick off a new calibration run. Returns the calibrationRunId so the wizard
 * can load samples by id.
 *
 * If the inline enqueue request times out at the network layer (long LLM calls
 * + browser/proxy timeout), the job often still finishes server-side. The
 * caller can recover by polling the most recent calibration_sample row's
 * calibration_run_id metadata.
 */
function withOrganizationScope(query, organizationId) {
  return organizationId
    ? query.eq('organization_id', organizationId)
    : query.is('organization_id', null);
}

async function requestCalibration(action, payload) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  const res = await fetch(`/api/app?path=library-calibration&action=${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(result.error || 'Calibration request failed');
  return waitForJobResult(result, 180000);
}

export async function startCalibration({
  costPreference = 'free_first',
  organizationId = null,
} = {}) {
  const result = await requestCalibration('start', {
    organizationId,
    costPreference,
  });

  if (result.status === 'failed') {
    throw new Error(result.error || 'Calibration failed to start');
  }

  // Result shape from enqueue.js immediate-mode includes the handler return value
  // nested in result.result.
  const payload = result.result || result;
  const calibrationRunId = payload.calibrationRunId;
  if (!calibrationRunId) {
    throw new Error('No calibrationRunId returned from start phase');
  }
  return { calibrationRunId };
}

/**
 * Recovery path: find the most recent calibration run for the current user
 * by querying calibration_sample rows. Used by the wizard when the inline
 * start request hangs but the job actually succeeded server-side.
 */
export async function findLatestCalibrationRun(organizationId = null) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  let query = supabase
    .from('knowledge_documents')
    .select('metadata, created_at')
    .eq('category', 'calibration_sample')
    .eq('user_id', user.id);
  query = withOrganizationScope(query, organizationId);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(1);

  if (error || !data || data.length === 0) return null;
  return data[0].metadata?.calibration_run_id || null;
}

/**
 * Load the 6 samples for a calibration run.
 */
export async function loadCalibrationSamples(calibrationRunId, organizationId = null) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  let query = supabase
    .from('knowledge_documents')
    .select('id, title, content, metadata, created_at')
    .eq('category', 'calibration_sample')
    .eq('metadata->>calibration_run_id', calibrationRunId)
    .eq('user_id', user.id);
  query = withOrganizationScope(query, organizationId);
  const { data, error } = await query.order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Save a user comment to a sample row. Updates metadata.user_comment.
 */
export async function saveSampleComment(sampleId, comment, organizationId = null) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  let loadQuery = supabase
    .from('knowledge_documents')
    .select('metadata')
    .eq('id', sampleId)
    .eq('category', 'calibration_sample')
    .eq('user_id', user.id);
  loadQuery = withOrganizationScope(loadQuery, organizationId);
  const { data: row, error: loadErr } = await loadQuery.single();

  if (loadErr) throw new Error(loadErr.message);

  const updatedMetadata = {
    ...(row?.metadata || {}),
    user_comment: comment || null,
  };

  let updateQuery = supabase
    .from('knowledge_documents')
    .update({ metadata: updatedMetadata })
    .eq('id', sampleId)
    .eq('user_id', user.id);
  updateQuery = withOrganizationScope(updateQuery, organizationId);
  const { error: updateErr } = await updateQuery;

  if (updateErr) throw new Error(updateErr.message);
}

/**
 * Regenerate one sample with the user's comment merged into the prompt.
 * For visual categories (landing/banner/slides) this also produces a real
 * artifact (Cloudflare URL / image / PDF). Display-only — the result is
 * not persisted into the sample row.
 *
 * @param {string} sampleId
 * @param {string} comment
 * @param {number} [iteration=1]
 * @param {string|null} [preferredTool=null] - tool id from deliverableToolsCatalog
 *   (e.g. 'html-browserless'). Forwarded to the backend so it knows which
 *   renderer to use. null means use the platform default for that category.
 *
 * Returns { improvedDescription, originalDescription, artifact_after }.
 */
export async function previewCommentImpact(
  sampleId,
  comment,
  iteration = 1,
  preferredTool = null,
  organizationId = null
) {
  const result = await requestCalibration('preview', {
    sampleId,
    comment,
    iteration,
    preferredTool,
    organizationId,
  });

  if (result.status === 'failed') {
    throw new Error(result.error || 'Preview failed');
  }
  const payload = result.result || result;
  return {
    improvedDescription: payload.improvedDescription || '',
    originalDescription: payload.originalDescription || '',
    artifact_after: payload.artifact_after || { kind: 'text', text: null },
  };
}

/**
 * Trigger the synthesize phase. Returns when criteria are written.
 */
export async function synthesizeCalibration(calibrationRunId, organizationId = null) {
  const result = await requestCalibration('synthesize', {
    calibrationRunId,
    organizationId,
  });

  if (result.status === 'failed') {
    throw new Error(result.error || 'Calibration synthesis failed');
  }
  return result.result || result;
}

/**
 * Read the current calibration mode flag.
 */
export async function getCalibrationMode(organizationId = null) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { mode: 'observe', active_run_id: null };

  let query = supabase
    .from('knowledge_documents')
    .select('content, metadata')
    .eq('category', 'system_flag')
    .eq('source', 'library_calibration_mode')
    .eq('user_id', user.id);
  query = withOrganizationScope(query, organizationId);
  const { data } = await query.maybeSingle();

  if (!data) return { mode: 'observe', active_run_id: null };
  return {
    mode: data.content || 'observe',
    active_run_id: data.metadata?.active_run_id || null,
  };
}
