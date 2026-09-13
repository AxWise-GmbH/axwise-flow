/**
 * Notion -> Knowledge Base ingest core. Shared by the notion-sync endpoint and
 * the kb-connections "sync now" so both behave identically.
 */
import { generateEmbedding, estimateTokens } from '../../_shared/embeddings.js';
import { fetchWithRetry } from '../../../api/_lib/fetch.js';

const NOTION_VERSION = '2022-06-28';

/** Parse a Notion block array into a single markdown-ish text representation. */
export function parseNotionBlocks(blocks) {
  let text = '';
  for (const block of blocks || []) {
    const type = block.type;
    if (!type || !block[type]) continue;
    const richText = block[type].rich_text || block[type].text;
    if (!richText) continue;
    const blockText = richText.map((t) => t.plain_text).join('');
    if (!blockText) continue;

    if (type.startsWith('heading_')) {
      const level = type.slice(-1);
      text += `\n${'#'.repeat(parseInt(level, 10) || 1)} ${blockText}\n`;
    } else if (type === 'bulleted_list_item' || type === 'numbered_list_item') {
      text += `* ${blockText}\n`;
    } else if (type === 'to_do') {
      const checked = block.to_do.checked ? '[x]' : '[ ]';
      text += `${checked} ${blockText}\n`;
    } else if (type === 'code') {
      text += `\n\`\`\`${block.code.language || ''}\n${blockText}\n\`\`\`\n`;
    } else {
      text += `${blockText}\n`;
    }
  }
  return text.trim();
}

/**
 * Pull shared Notion pages and upsert them into knowledge_documents.
 * @param {object} p
 * @param {object} p.admin      supabase admin client
 * @param {string} p.userId
 * @param {string} p.apiKey     Notion integration token
 * @param {string|null} [p.connectionId]  kb_connections.id to tag ingested docs
 * @returns {Promise<{ count: number, pages: Array<{id,title,url}> }>}
 * @throws {Error} with `.status` on Notion API failure
 */
export async function syncNotionToKb({ admin, userId, apiKey, connectionId = null }) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };

  const searchRes = await fetchWithRetry(
    'https://api.notion.com/v1/search',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ filter: { property: 'object', value: 'page' }, page_size: 15 }),
    },
    { timeoutMs: 15000, retries: 1 }
  );
  if (!searchRes.ok) {
    const errData = await searchRes.json().catch(() => ({}));
    const err = new Error(errData.message || 'Notion API search failed');
    err.status = searchRes.status;
    throw err;
  }

  const searchData = await searchRes.json();
  const pages = searchData.results || [];
  const synced = [];

  for (const page of pages) {
    const pageId = page.id;
    const title =
      page.properties?.title?.title?.[0]?.plain_text ||
      page.properties?.Name?.title?.[0]?.plain_text ||
      'Untitled Notion Page';

    const blocksRes = await fetchWithRetry(
      `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`,
      { method: 'GET', headers },
      { timeoutMs: 15000, retries: 1 }
    );
    let contentText = '';
    if (blocksRes.ok) {
      const blocksData = await blocksRes.json();
      contentText = parseNotionBlocks(blocksData.results);
    }
    if (!contentText) contentText = `Empty Notion page: ${title}`;

    const embedding = await generateEmbedding(contentText);
    const docRow = {
      user_id: userId,
      title,
      content: contentText,
      source: `notion:${pageId}`,
      category: 'business',
      content_type: 'note',
      owner_type: 'user',
      tags: ['notion', 'imported'],
      embedding: `[${embedding.join(',')}]`,
      token_count: estimateTokens(contentText),
      metadata: {
        notion_page_id: pageId,
        last_synced_at: new Date().toISOString(),
        url: page.url,
        ...(connectionId ? { kb_connection_id: connectionId } : {}),
      },
    };

    const { data: existing } = await admin
      .from('knowledge_documents')
      .select('id')
      .eq('user_id', userId)
      .eq('source', `notion:${pageId}`)
      .maybeSingle();

    if (existing) {
      await admin
        .from('knowledge_documents')
        .update({ ...docRow, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      await admin.from('knowledge_documents').insert(docRow);
    }

    synced.push({ id: pageId, title, url: page.url });
  }

  return { count: synced.length, pages: synced };
}
