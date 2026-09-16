/**
 * Parsers for chat-history export files from external AI apps. These apps expose
 * no history API, so users download their official data export and we parse it in
 * the browser, normalizing every platform to a common shape:
 *
 *   { provider, conversations: [{ id, title, messages: [{ role, content }] }], warnings }
 *
 * Supported: ChatGPT (conversations.json, incl. inside the export .zip), Claude
 * (export JSON), Gemini (Google Takeout .zip / MyActivity.json, best-effort), and
 * a generic importer (normalized JSON or plain text/markdown) that also backs
 * Perplexity / DeepSeek / Qwen / Kimi etc.
 */
import JSZip from 'jszip';

// Caps mirror the server schema (api/_lib/validate.js -> aiChatImportSchema) so
// the payload always validates.
const MAX_CONTENT = 20000;
const MAX_MESSAGES = 500;
const MAX_TITLE = 300;
const MAX_ID = 200;

function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
}

// File.text()/arrayBuffer() aren't available in every environment (e.g. jsdom),
// so fall back to FileReader.
function readText(file) {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(r.error || new Error('Could not read file'));
    r.readAsText(file);
  });
}

function readArrayBuffer(file) {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('Could not read file'));
    r.readAsArrayBuffer(file);
  });
}

function partsToText(parts) {
  if (!Array.isArray(parts)) return typeof parts === 'string' ? parts : '';
  return parts
    .map((p) => (typeof p === 'string' ? p : p && typeof p.text === 'string' ? p.text : ''))
    .filter(Boolean)
    .join('\n');
}

/** Build a capped, cleaned conversation; returns null if it has no messages. */
function normConversation(id, title, messages, idx) {
  const clean = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim())
    .slice(0, MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, MAX_CONTENT) }));
  if (clean.length === 0) return null;
  return {
    id: String(id || `conv-${idx + 1}`).slice(0, MAX_ID),
    title: String(title || '').slice(0, MAX_TITLE),
    messages: clean,
  };
}

function compact(list) {
  return list.filter(Boolean);
}

// ── Per-provider parsers (input: parsed JSON) ─────────────────────

function parseChatGPT(data) {
  const convos = Array.isArray(data) ? data : data && data.mapping ? [data] : [];
  return compact(
    convos.map((c, idx) => {
      const nodes = Object.values(c.mapping || {})
        .map((n) => n && n.message)
        .filter((msg) => msg && msg.author && msg.content)
        .sort((a, b) => (a.create_time || 0) - (b.create_time || 0));
      const messages = compact(
        nodes.map((msg) => {
          const role = msg.author.role;
          if (role !== 'user' && role !== 'assistant') return null;
          const content = partsToText(msg.content.parts);
          return content.trim() ? { role, content } : null;
        })
      );
      return normConversation(c.conversation_id || c.id, c.title, messages, idx);
    })
  );
}

function parseClaude(data) {
  const convos = Array.isArray(data) ? data : data && data.chat_messages ? [data] : [];
  return compact(
    convos.map((c, idx) => {
      const messages = compact(
        (c.chat_messages || c.messages || []).map((m) => {
          const sender = m.sender || m.role;
          const role = sender === 'human' || sender === 'user' ? 'user' : sender === 'assistant' ? 'assistant' : null;
          if (!role) return null;
          const content = m.text || partsToText(m.content) || '';
          return content.trim() ? { role, content } : null;
        })
      );
      return normConversation(c.uuid || c.id, c.name || c.title, messages, idx);
    })
  );
}

/** Google Takeout "My Activity" for Gemini/Bard — best-effort (prompts, maybe replies). */
function parseGeminiActivity(data) {
  const items = Array.isArray(data) ? data : [];
  return compact(
    items.map((it, idx) => {
      const prompt = String(it.title || '').replace(/^Prompted?\s+/i, '').trim();
      const reply = partsToText(it.subtitles ? it.subtitles.map((s) => s.name) : []);
      const messages = compact([
        prompt ? { role: 'user', content: prompt } : null,
        reply.trim() ? { role: 'assistant', content: reply } : null,
      ]);
      return normConversation(it.titleUrl || `gemini-${idx}`, prompt.slice(0, 80) || 'Gemini chat', messages, idx);
    })
  );
}

/** Generic: already-normalized JSON, {conversations:[…]}, [{role,content}], or unknown. */
function parseGeneric(data) {
  if (Array.isArray(data) && data.length && data[0] && Array.isArray(data[0].messages)) {
    return compact(data.map((c, idx) => normConversation(c.id, c.title, c.messages, idx)));
  }
  if (data && Array.isArray(data.conversations)) {
    return compact(data.conversations.map((c, idx) => normConversation(c.id, c.title, c.messages, idx)));
  }
  if (Array.isArray(data) && data.length && data[0] && 'role' in data[0]) {
    const one = normConversation('generic-1', 'Imported chat', data, 0);
    return one ? [one] : [];
  }
  return [];
}

/** Sniff a parsed-JSON structure and route to the right parser. */
function parseJson(data, hint) {
  const sample = Array.isArray(data) ? data[0] : data;
  let detected = 'generic';
  if (sample && sample.mapping) detected = 'chatgpt';
  else if (sample && (sample.chat_messages || sample.sender)) detected = 'claude';
  else if (sample && (sample.titleUrl || (sample.products && sample.title))) detected = 'gemini';

  let conversations;
  if (detected === 'chatgpt') conversations = parseChatGPT(data);
  else if (detected === 'claude') conversations = parseClaude(data);
  else if (detected === 'gemini') conversations = parseGeminiActivity(data);
  else conversations = parseGeneric(data);

  const warnings = [];
  if (hint && detected !== 'generic' && hint !== detected) {
    warnings.push(`This looks like a ${detected} export, not ${hint}. Importing it as ${detected}.`);
  }
  // A generic detection keeps the user's chosen provider label (e.g. perplexity).
  const provider = detected !== 'generic' ? detected : hint || 'generic';
  return { provider, conversations, warnings };
}

async function readZip(file, hint) {
  const zip = await JSZip.loadAsync(await readArrayBuffer(file));
  const names = Object.keys(zip.files);
  // ChatGPT export bundles conversations.json.
  const chatgpt = names.find((n) => /(^|\/)conversations\.json$/i.test(n));
  if (chatgpt) {
    const text = await zip.files[chatgpt].async('string');
    return parseJson(JSON.parse(text), hint || 'chatgpt');
  }
  // Gemini/Bard via Google Takeout — prefer the JSON activity file.
  const geminiJson = names.find((n) => /(gemini|bard).*my ?activity.*\.json$/i.test(n));
  if (geminiJson) {
    const text = await zip.files[geminiJson].async('string');
    return parseJson(JSON.parse(text), hint || 'gemini');
  }
  const geminiHtml = names.find((n) => /(gemini|bard).*my ?activity.*\.html?$/i.test(n));
  if (geminiHtml) {
    return {
      provider: 'gemini',
      conversations: [],
      warnings: ['Found a Gemini HTML export. In Google Takeout, choose the JSON format for Gemini and re-export.'],
    };
  }
  // Fall back to the first JSON entry in the archive.
  const anyJson = names.find((n) => /\.json$/i.test(n) && !zip.files[n].dir);
  if (anyJson) {
    const text = await zip.files[anyJson].async('string');
    return parseJson(JSON.parse(text), hint);
  }
  return { provider: hint || 'generic', conversations: [], warnings: ['No JSON export found inside the .zip.'] };
}

/**
 * Parse an uploaded export file into normalized conversations.
 * @param {File} file - the uploaded export (.json / .zip / .md / .txt)
 * @param {string} [hint] - the provider the user picked (used for labeling + warnings)
 * @returns {Promise<{ provider, conversations, warnings }>}
 */
export async function parseExportFile(file, hint) {
  const ext = extOf(file.name);
  if (ext === 'zip') return readZip(file, hint);

  const text = await readText(file);
  if (ext === 'json') {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { provider: hint || 'generic', conversations: [], warnings: ['That .json file could not be parsed.'] };
    }
    return parseJson(data, hint);
  }
  // Plain text / markdown transcript -> one generic conversation.
  const one = normConversation('generic-1', file.name.replace(/\.[a-z0-9]+$/i, ''), [{ role: 'user', content: text }], 0);
  return { provider: hint || 'generic', conversations: one ? [one] : [], warnings: [] };
}
