/**
 * Client-side Hugging Face model normalizer.
 *
 * Mirrors the server normalizer in lib/api-handlers/huggingface-models.js so the
 * Download tab can call the HF API directly from the browser as a fallback when
 * our backend endpoint is unavailable (e.g. dev proxying /api to production).
 * Frontend must not import server code (project rule 3), hence the small copy.
 */
function slug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toNumber(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
}

export function formatParams(n) {
  if (!n || n <= 0) return null;
  if (n >= 1e9) {
    const b = n / 1e9;
    return `${b >= 10 ? Math.round(b) : b.toFixed(1).replace(/\.0$/, '')}B`;
  }
  if (n >= 1e6) return `${Math.round(n / 1e6)}M`;
  return String(n);
}

function paramSizeClass(params) {
  if (!params) return 'md';
  const b = params / 1e9;
  if (b < 13) return 'sm';
  if (b < 34) return 'md';
  if (b < 72) return 'lg';
  return 'xl';
}

function parseParamsFromId(id) {
  const match = String(id || '').match(/(\d+(?:\.\d+)?)\s*b\b/i);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1e9) : null;
}

function extractLicense(m) {
  if (m.cardData && typeof m.cardData.license === 'string') return m.cardData.license;
  const tags = Array.isArray(m.tags) ? m.tags : [];
  const lic = tags.find((t) => typeof t === 'string' && t.startsWith('license:'));
  return lic ? lic.slice('license:'.length) : null;
}

function extractParams(m) {
  const total = m.safetensors?.total ?? m.safetensors?.parameters?.total;
  const n = toNumber(total);
  if (n && n > 0) return n;
  return parseParamsFromId(m.id || m.modelId);
}

export function normalizeHfModel(m) {
  const id = m.id || m.modelId;
  if (!id) return null;
  const author = m.author || String(id).split('/')[0] || 'unknown';
  const shortName = String(id).split('/').pop() || id;
  const params = extractParams(m);
  const paramsLabel = formatParams(params);
  const license = extractLicense(m);
  const pipelineTag = m.pipeline_tag || 'text-generation';
  const gated = !!m.gated && m.gated !== false;
  const files = Array.isArray(m.siblings) ? m.siblings.length : 0;
  const description = [
    pipelineTag.replace(/-/g, ' '),
    license ? `${license} license` : null,
    paramsLabel ? `~${paramsLabel} params` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    id: `hf-${slug(id)}`,
    name: shortName,
    repoId: id,
    exactModel: id,
    author,
    provider: `@${author}`,
    downloads: toNumber(m.downloads) || 0,
    likes: toNumber(m.likes) || 0,
    license,
    gated,
    private: !!m.private,
    params,
    paramsLabel,
    files,
    lastModified: m.lastModified || m.createdAt || null,
    pipelineTag,
    sizeClass: paramSizeClass(params),
    url: `https://huggingface.co/${id}`,
    description,
    source: 'huggingface',
    hardware: 'Self-hosted',
    ram: 'n/a',
    contextLength: 0,
    pricePerHour: 0,
    tokensPerSecond: null,
    status: 'online',
    rating: 0,
    reviewsCount: 0,
  };
}
