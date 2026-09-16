/**
 * Library Universe service — frontend API for the curated + promoted
 * deliverable library.
 *
 * Library entries live in `knowledge_documents` with category='library_example'
 * and a metadata shape defined in supabase/migrations/099_library_universe.sql.
 */
import { supabase } from '../lib/supabase';

const PAGE_SIZE = 60;

/**
 * List library entries, optionally filtered by deliverable type and source.
 *
 * @param {object} opts
 * @param {string} [opts.deliverableType] - landing_page | presentation | smm_banner | document_template | table_structure | code
 * @param {string} [opts.source] - 'curated' | 'promoted' | undefined (all)
 * @param {number} [opts.limit]
 */
export async function listLibraryEntries({ deliverableType, source, limit = PAGE_SIZE } = {}) {
  let query = supabase
    .from('knowledge_documents')
    .select('id, title, content, source, category, metadata, tags, created_at')
    .eq('category', 'library_example')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (deliverableType) {
    query = query.eq('metadata->>deliverable_type', deliverableType);
  }
  if (source) {
    query = query.eq('metadata->>source', source);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Promote a goal deliverable to the library. Used by the auto-promote path
 * (Osja stage handler) and the manual "Promote to Library" button on the
 * goal detail page.
 */
export async function promoteDeliverableToLibrary(
  sourceDocumentId,
  {
    quality_score,
    what_makes_it_great,
    recreate_prompt,
    recreate_tools = [],
    deliverable_type,
    asset_url,
    preview_url,
    title,
    brand,
    source_goal_id,
    promoted_by,
  }
) {
  const metadata = {
    deliverable_type,
    brand: brand || null,
    asset_url,
    preview_url: preview_url || asset_url,
    quality_score: Number(quality_score) || 0,
    source: 'promoted',
    source_goal_id: source_goal_id || null,
    source_document_id: sourceDocumentId || null,
    what_makes_it_great: what_makes_it_great || '',
    recreate_prompt: recreate_prompt || '',
    recreate_tools,
    promoted_by: promoted_by || null,
    promoted_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('knowledge_documents')
    .insert({
      title,
      content: what_makes_it_great || title,
      source: asset_url || '',
      category: 'library_example',
      metadata,
      content_type: 'note',
      tags: [],
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Delete a library entry. Useful for removing low-quality auto-promoted
 * entries from the Promoted view.
 */
export async function deleteLibraryEntry(entryId) {
  const { error } = await supabase
    .from('knowledge_documents')
    .delete()
    .eq('id', entryId)
    .eq('category', 'library_example');

  if (error) throw new Error(error.message);
}

/**
 * Count library entries grouped by deliverable_type. Used by the tab to
 * show counts on filter chips ("Landing pages · 9").
 */
export async function countByDeliverableType() {
  const { data, error } = await supabase
    .from('knowledge_documents')
    .select('metadata')
    .eq('category', 'library_example');

  if (error) throw new Error(error.message);

  const counts = {};
  for (const row of data || []) {
    const t = row.metadata?.deliverable_type || 'unknown';
    counts[t] = (counts[t] || 0) + 1;
  }
  return counts;
}
