/**
 * Injection – materials storage and injection run.
 * Uses Supabase storage bucket "injection-hub" and table injection_materials.
 */
import { supabase, hasSupabase } from '../lib/supabase';
import { maybeNotify } from './emailNotificationDispatcher';
import { INJECTION_TYPES, renderSnippet, PLACEMENT } from '../utils/injectionTypes';
import { packArchive } from '../utils/archiveUtils';

const BUCKET = 'injection-hub';
const LS_KEY = 'orch_injection_materials_v1';
const LS_KEY_CATEGORIES = 'orch_injection_hub_categories_v1';

function canUseStorage() {
  return typeof window !== 'undefined' && !!window.localStorage;
}
function loadJson(key, fallback) {
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function saveJson(key, value) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

async function ensureBucket() {
  if (!hasSupabase()) return false;
  const { data, error } = await supabase.storage.getBucket(BUCKET);
  if (data) return true;
  const notFound = error?.message && /not found|does not exist/i.test(String(error.message));
  if (error && !notFound) throw new Error(error.message || 'Storage bucket check failed');
  const { error: createError } = await supabase.storage.createBucket(BUCKET, { public: false });
  if (createError) {
    throw new Error(
      `Storage bucket "${BUCKET}" does not exist. Create it in Supabase Dashboard: Storage → New bucket → name "${BUCKET}" (private), then try again.`
    );
  }
  return true;
}

/**
 * Inject snippets into HTML content by placement.
 * @param {string} html
 * @param {Array<{ typeId: string, values: Record<string, string> }>} injections
 * @returns {string}
 */
export function injectSnippetsIntoHtml(html, injections) {
  let out = html;
  const byPlacement = {};
  for (const inj of injections) {
    const type = INJECTION_TYPES.find((t) => t.id === inj.typeId);
    if (!type?.snippetTemplate) continue;
    const snippet = renderSnippet(inj.typeId, inj.values || {});
    if (!snippet) continue;
    const placement = type.placement || PLACEMENT.BEFORE_BODY_CLOSE;
    if (!byPlacement[placement]) byPlacement[placement] = [];
    byPlacement[placement].push(snippet);
  }
  if (byPlacement[PLACEMENT.BEFORE_HEAD_CLOSE]?.length) {
    const block = byPlacement[PLACEMENT.BEFORE_HEAD_CLOSE].join('\n');
    out = out.replace(/(<\/head\s*>)/i, `${block}\n$1`);
  }
  if (byPlacement[PLACEMENT.AFTER_BODY_OPEN]?.length) {
    const block = byPlacement[PLACEMENT.AFTER_BODY_OPEN].join('\n');
    out = out.replace(/(<body[^>]*>)/i, `$1\n${block}`);
  }
  if (byPlacement[PLACEMENT.BEFORE_BODY_CLOSE]?.length) {
    const block = byPlacement[PLACEMENT.BEFORE_BODY_CLOSE].join('\n');
    out = out.replace(/(<\/body\s*>)/i, `${block}\n$1`);
  }
  return out;
}

/**
 * Apply URL token params to links in HTML (simple append to href).
 * @param {string} html
 * @param {Record<string, string>} params e.g. { subid: '123', utm_source: 'campaign' }
 */
export function appendParamsToLinks(html, params = {}) {
  const q = new URLSearchParams(params).toString();
  if (!q) return html;
  return html.replace(/(<a\s[^>]*href=["'])([^"']+)(["'])/gi, (_, prefix, href, suffix) => {
    try {
      const url = new URL(href, 'https://dummy');
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
      const isRelative = url.protocol === 'https:' && url.host === 'dummy';
      const out = isRelative ? url.pathname + (url.search || '') : url.href;
      return prefix + out + suffix;
    } catch {
      return _ + href + suffix;
    }
  });
}

/**
 * Run injection on entries: modify HTML entries with snippets and optional URL params.
 * @param {Array<{ path: string, content: string | Uint8Array }>} entries
 * @param {Array<{ typeId: string, values: Record<string, string> }>} injections
 * @param {{ urlParams?: Record<string, string> }} options
 * @returns {Array<{ path: string, content: string | Uint8Array }>}
 */
export function runInjection(entries, injections, options = {}) {
  const { urlParams } = options;
  return entries.map(({ path, content }) => {
    if (typeof content !== 'string') return { path, content };
    if (!/\.(html?|htm)$/i.test(path)) return { path, content };
    let html = injectSnippetsIntoHtml(content, injections);
    if (urlParams && Object.keys(urlParams).length) {
      html = appendParamsToLinks(html, urlParams);
    }
    return { path, content: html };
  });
}

/**
 * List materials (from Supabase or localStorage fallback).
 */
export async function listMaterials() {
  if (hasSupabase()) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data, error } = await supabase
        .from('injection_materials')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error) return data || [];
    }
    return [];
  }
  return loadJson(LS_KEY, []);
}

/**
 * Save material metadata and upload merged blob to storage.
 * @param {Blob} mergedBlob - result of packArchive()
 * @param {{ name: string, campaignId?: string, campaignName?: string, injectionTypeIds: string[], injectionConfig?: object, fileNames: string[] }} meta
 */
export async function saveMaterial(mergedBlob, meta) {
  const prefix = `materials/${Date.now()}-${(meta.name || 'material').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)}`;
  const mergedPath = `${prefix}/merged.zip`;

  if (hasSupabase()) {
    const bucketReady = await ensureBucket();
    if (!bucketReady)
      throw new Error(
        `Storage bucket "${BUCKET}" is not available. Create it in Supabase Dashboard → Storage.`
      );
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(mergedPath, mergedBlob, { contentType: 'application/zip', upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    const injectionConfig = {
      ...(meta.injectionConfig || {}),
      category_id: meta.categoryId ?? null,
      category_name: meta.categoryName ?? null,
      material_type: meta.materialType || 'injection',
      user_email: user?.email ?? null,
    };
    const row = {
      user_id: user?.id ?? null,
      name: meta.name,
      campaign_id: meta.campaignId ?? null,
      campaign_name: meta.campaignName ?? null,
      injection_type_ids: meta.injectionTypeIds || [],
      injection_config: injectionConfig,
      merged_path: mergedPath,
      file_names: meta.fileNames || [],
    };
    const { data: inserted, error } = await supabase
      .from('injection_materials')
      .insert(row)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    maybeNotify('material_uploaded', { name: inserted.name });
    return inserted;
  }

  const list = loadJson(LS_KEY, []);
  const id = `mat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let userEmail = null;
  if (hasSupabase()) {
    const {
      data: { user },
    } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    userEmail = user?.email ?? null;
  }
  const injectionConfig = {
    ...(meta.injectionConfig || {}),
    category_id: meta.categoryId ?? null,
    category_name: meta.categoryName ?? null,
    material_type: meta.materialType || 'injection',
    user_email: userEmail,
  };
  const record = {
    id,
    name: meta.name,
    campaign_id: meta.campaignId ?? null,
    campaign_name: meta.campaignName ?? null,
    injection_type_ids: meta.injectionTypeIds || [],
    injection_config: injectionConfig,
    merged_path: null,
    file_names: meta.fileNames || [],
    created_at: new Date().toISOString(),
  };
  list.unshift(record);
  saveJson(LS_KEY, list);
  maybeNotify('material_uploaded', { name: record.name });
  return record;
}

/**
 * Get signed download URL for a material's merged file.
 */
export async function getMaterialDownloadUrl(material) {
  if (material.merged_path && hasSupabase()) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(material.merged_path, 3600);
    if (!error && data?.signedUrl) return data.signedUrl;
  }
  return null;
}

/**
 * Delete material (DB row and storage file).
 */
export async function deleteMaterial(material) {
  if (hasSupabase()) {
    if (material.merged_path) {
      await supabase.storage.from(BUCKET).remove([material.merged_path]);
    }
    const { error } = await supabase.from('injection_materials').delete().eq('id', material.id);
    if (error) throw new Error(error.message);
    maybeNotify('material_deleted', { name: material.name });
    return;
  }
  const list = loadJson(LS_KEY, []).filter((m) => m.id !== material.id);
  saveJson(LS_KEY, list);
  maybeNotify('material_deleted', { name: material.name });
}

// ── Categories (structure materials) ────────────────────────────────────────
export function getCategories() {
  return loadJson(LS_KEY_CATEGORIES, []);
}

export function addCategory(name) {
  const list = getCategories();
  const id = `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  list.push({ id, name: (name || '').trim() || 'Uncategorized' });
  saveJson(LS_KEY_CATEGORIES, list);
  return { id, name: list[list.length - 1].name };
}

export function updateCategory(id, name) {
  const list = getCategories();
  const idx = list.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  list[idx].name = (name || '').trim() || list[idx].name;
  saveJson(LS_KEY_CATEGORIES, list);
  return list[idx];
}

export function removeCategory(id) {
  const list = getCategories().filter((c) => c.id !== id);
  saveJson(LS_KEY_CATEGORIES, list);
  return list;
}

/** Update material's category (injection_config). */
export async function setMaterialCategory(material, categoryId, categoryName) {
  const config = {
    ...(material.injection_config || {}),
    category_id: categoryId ?? null,
    category_name: categoryName ?? null,
  };
  if (hasSupabase()) {
    const { error } = await supabase
      .from('injection_materials')
      .update({ injection_config: config, updated_at: new Date().toISOString() })
      .eq('id', material.id);
    if (error) throw new Error(error.message);
    return { ...material, injection_config: config };
  }
  const list = loadJson(LS_KEY, []);
  const idx = list.findIndex((m) => m.id === material.id);
  if (idx < 0) return null;
  list[idx].injection_config = config;
  saveJson(LS_KEY, list);
  return list[idx];
}

/** Update material's campaign (campaign_id, campaign_name). */
export async function setMaterialCampaign(material, campaignId, campaignName) {
  if (hasSupabase()) {
    const { error } = await supabase
      .from('injection_materials')
      .update({
        campaign_id: campaignId ?? null,
        campaign_name: campaignName ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', material.id);
    if (error) throw new Error(error.message);
    return { ...material, campaign_id: campaignId ?? null, campaign_name: campaignName ?? null };
  }
  const list = loadJson(LS_KEY, []);
  const idx = list.findIndex((m) => m.id === material.id);
  if (idx < 0) return null;
  list[idx].campaign_id = campaignId ?? null;
  list[idx].campaign_name = campaignName ?? null;
  saveJson(LS_KEY, list);
  return list[idx];
}

/**
 * Append a partner to material's used_by (injection_config.used_by).
 * Persists to DB or localStorage. Used together with adding the material to the partner's materials list.
 */
export async function addMaterialUsedBy(material, partnerId, partnerName) {
  const usedBy = getMaterialUsedByFromMaterial(material);
  const addedAt = new Date().toISOString();
  const entry = { partnerId, partnerName: partnerName || partnerId, addedAt };
  const nextUsedBy = [...usedBy, entry];
  const config = { ...(material.injection_config || {}), used_by: nextUsedBy };

  if (hasSupabase()) {
    const { error } = await supabase
      .from('injection_materials')
      .update({ injection_config: config, updated_at: addedAt })
      .eq('id', material.id);
    if (error) throw new Error(error.message);
    return { ...material, injection_config: config };
  }
  const list = loadJson(LS_KEY, []);
  const idx = list.findIndex((m) => m.id === material.id);
  if (idx < 0) return null;
  list[idx].injection_config = config;
  saveJson(LS_KEY, list);
  return list[idx];
}

function getMaterialUsedByFromMaterial(m) {
  if (m?.used_by && Array.isArray(m.used_by)) return m.used_by;
  if (m?.injection_config?.used_by && Array.isArray(m.injection_config.used_by))
    return m.injection_config.used_by;
  return [];
}
