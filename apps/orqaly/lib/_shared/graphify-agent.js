/**
 * graphify-agent — Knowledge graph engine for agent memory.
 *
 * Query engine: JS port of graphify's serve.py (_score_nodes, _bfs, _subgraph_to_text).
 * Build engine: Calls graphify Python CLI as subprocess (requires `pip install graphifyy`).
 *
 * Graph stored as JSON in knowledge_documents with tag ['_graph'].
 * Query returns compact subgraph text (~200-400 tokens) for prompt injection.
 */
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { createLogger } from '../../api/_lib/logger.js';
import { execFile } from 'child_process';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const log = createLogger('graphify-agent');
const GRAPH_TAG = '_graph';

// ── Query Engine (ported from graphify/serve.py) ──────────────────

/**
 * Strip diacritics for search matching.
 * Port of serve.py _strip_diacritics().
 */
function stripDiacritics(text) {
  return text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Score nodes by keyword match on label + source_file.
 * Port of serve.py _score_nodes().
 */
function scoreNodes(graph, terms) {
  const normTerms = terms.map((t) => stripDiacritics(t).toLowerCase());
  const scored = [];
  for (const node of graph.nodes || []) {
    const normLabel = (node.norm_label || stripDiacritics(node.label || '')).toLowerCase();
    const source = (node.source_file || '').toLowerCase();
    let score = 0;
    for (const t of normTerms) {
      if (normLabel.includes(t)) score += 1;
      if (source.includes(t)) score += 0.5;
    }
    if (score > 0) scored.push({ score, id: node.id });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * BFS traversal from start nodes.
 * Port of serve.py _bfs().
 */
function bfs(graph, startNodes, depth) {
  // Build adjacency list from edges
  const adj = new Map();
  for (const edge of graph.edges || graph.links || []) {
    const src = edge.source;
    const tgt = edge.target;
    if (!adj.has(src)) adj.set(src, []);
    if (!adj.has(tgt)) adj.set(tgt, []);
    adj.get(src).push(tgt);
    adj.get(tgt).push(src); // undirected traversal
  }

  const visited = new Set(startNodes);
  let frontier = new Set(startNodes);
  const edgesSeen = [];

  for (let d = 0; d < depth; d++) {
    const nextFrontier = new Set();
    for (const n of frontier) {
      for (const neighbor of adj.get(n) || []) {
        if (!visited.has(neighbor)) {
          nextFrontier.add(neighbor);
          edgesSeen.push([n, neighbor]);
        }
      }
    }
    for (const n of nextFrontier) visited.add(n);
    frontier = nextFrontier;
  }

  return { visited, edgesSeen };
}

/**
 * Render subgraph as text with token budget.
 * Port of serve.py _subgraph_to_text().
 */
function subgraphToText(graph, visitedSet, edgesSeen, tokenBudget = 400) {
  const charBudget = tokenBudget * 3; // ~3 chars per token

  // Build node lookup
  const nodeMap = new Map();
  for (const node of graph.nodes || []) {
    nodeMap.set(node.id, node);
  }

  // Build edge lookup
  const edgeMap = new Map();
  for (const edge of graph.edges || graph.links || []) {
    edgeMap.set(`${edge.source}→${edge.target}`, edge);
    edgeMap.set(`${edge.target}→${edge.source}`, edge); // undirected fallback
  }

  // Sort nodes by degree (most connected first)
  const degreeCount = new Map();
  for (const edge of graph.edges || graph.links || []) {
    degreeCount.set(edge.source, (degreeCount.get(edge.source) || 0) + 1);
    degreeCount.set(edge.target, (degreeCount.get(edge.target) || 0) + 1);
  }
  const sortedNodes = [...visitedSet].sort(
    (a, b) => (degreeCount.get(b) || 0) - (degreeCount.get(a) || 0)
  );

  const lines = [];

  // Node lines
  for (const nid of sortedNodes) {
    const d = nodeMap.get(nid) || {};
    const label = (d.label || nid).replace(/[^\x20-\x7E]/g, ''); // sanitize
    lines.push(
      `NODE ${label} [src=${d.source_file || ''} loc=${d.source_location || ''} community=${d.community ?? ''}]`
    );
  }

  // Edge lines
  for (const [u, v] of edgesSeen) {
    if (visitedSet.has(u) && visitedSet.has(v)) {
      const edgeData = edgeMap.get(`${u}→${v}`) || {};
      const uLabel = (nodeMap.get(u)?.label || u).replace(/[^\x20-\x7E]/g, '');
      const vLabel = (nodeMap.get(v)?.label || v).replace(/[^\x20-\x7E]/g, '');
      lines.push(
        `EDGE ${uLabel} --${edgeData.relation || ''} [${edgeData.confidence || ''}]--> ${vLabel}`
      );
    }
  }

  let output = lines.join('\n');
  if (output.length > charBudget) {
    output = output.slice(0, charBudget) + `\n... (truncated to ~${tokenBudget} token budget)`;
  }

  return output;
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Query an agent's knowledge graph for relevant context.
 * Returns compact subgraph text (~200-400 tokens).
 *
 * @param {string} ownerId - Agent/member ID
 * @param {string} query - User's message
 * @param {object} admin - Supabase admin client
 * @param {object} [opts] - { userId, depth: 3, tokenBudget: 400, mode: 'bfs' }
 * @returns {Promise<string>} Formatted graph context
 */
export async function queryAgentGraph(ownerId, query, admin, opts = {}) {
  const userId = typeof opts.userId === 'string' ? opts.userId.trim() : '';
  if (!ownerId || !query || !admin || !userId) return '';

  try {
    // Load graph from knowledge_documents
    const { data } = await admin
      .from('knowledge_documents')
      .select('content')
      .eq('user_id', userId)
      .eq('owner_id', ownerId)
      .eq('owner_type', 'agent')
      .contains('tags', [GRAPH_TAG])
      .maybeSingle();

    if (!data?.content) return '';

    const graph = JSON.parse(data.content);
    if (!graph?.nodes?.length) return '';

    const depth = Math.min(opts.depth || 3, 6);
    const tokenBudget = opts.tokenBudget || 400;

    // Score nodes by query terms
    const terms = query.split(/\s+/).filter((t) => t.length > 2);
    const scored = scoreNodes(graph, terms);
    const startNodes = scored.slice(0, 3).map((s) => s.id);

    if (startNodes.length === 0) {
      // No keyword match — return top god nodes as fallback
      const degreeCount = new Map();
      for (const edge of graph.edges || graph.links || []) {
        degreeCount.set(edge.source, (degreeCount.get(edge.source) || 0) + 1);
        degreeCount.set(edge.target, (degreeCount.get(edge.target) || 0) + 1);
      }
      const topNodes = [...degreeCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      const nodeMap = new Map((graph.nodes || []).map((n) => [n.id, n]));
      return topNodes
        .map(([id, deg]) => `• ${nodeMap.get(id)?.label || id} (${deg} connections)`)
        .join('\n');
    }

    // BFS traversal
    const { visited, edgesSeen } = bfs(graph, startNodes, depth);

    // Render header + subgraph
    const startLabels = startNodes.map((id) => {
      const node = (graph.nodes || []).find((n) => n.id === id);
      return node?.label || id;
    });
    const header = `Traversal: BFS depth=${depth} | Start: ${startLabels.join(', ')} | ${visited.size} nodes\n`;

    return header + subgraphToText(graph, visited, edgesSeen, tokenBudget);
  } catch (e) {
    log.warn(null, 'graph.query.failed', { ownerId, error: e.message });
    return '';
  }
}

/**
 * Build an agent's knowledge graph from their memory documents.
 * Uses graphify Python CLI if available, falls back to simple JS extraction.
 *
 * @param {string} ownerId - Agent/member ID
 * @param {string} userId - User ID for RLS
 * @param {Array} documents - Array of { title, content } memory documents
 * @returns {Promise<object>} The graph object { nodes, edges }
 */
export async function buildAgentGraph(ownerId, userId, documents) {
  if (!ownerId || !userId || !documents?.length) return { nodes: [], edges: [] };

  const admin = buildSupabaseAdminClient();
  if (!admin) return { nodes: [], edges: [] };

  // For text-based agent memories (notes, conversations, links), use JS extraction.
  // Graphify Python is AST-only (tree-sitter for code files) — it returns 0 nodes for text docs.
  // The Python path is reserved for when agents have code-related memories.
  const hasCodeDocs = documents.some((d) =>
    /\.(js|ts|py|go|rs|java|c|cpp|rb)$/i.test(d.title || '')
  );
  let graph;

  if (hasCodeDocs) {
    try {
      graph = await buildWithGraphify(documents);
      if (!graph?.nodes?.length) graph = buildSimple(documents);
    } catch {
      graph = buildSimple(documents);
    }
  } else {
    graph = buildSimple(documents);
  }

  // Store graph in knowledge_documents
  try {
    await admin
      .from('knowledge_documents')
      .delete()
      .eq('user_id', userId)
      .eq('owner_id', ownerId)
      .eq('owner_type', 'agent')
      .contains('tags', [GRAPH_TAG]);

    await admin.from('knowledge_documents').insert({
      user_id: userId,
      title: `_agent_graph_${ownerId}`,
      content: JSON.stringify(graph),
      source: 'graphify',
      category: 'agent-graph',
      owner_type: 'agent',
      owner_id: ownerId,
      content_type: 'note',
      tags: [GRAPH_TAG],
      metadata: { node_count: (graph.nodes || []).length, edge_count: (graph.edges || []).length },
    });
  } catch (e) {
    log.warn(null, 'graph.store.failed', { ownerId, error: e.message });
  }

  return graph;
}

/**
 * Build graph using real graphify Python library.
 * Writes documents as .md files to temp dir, runs graphify extract + build.
 */
function buildWithGraphify(documents) {
  return new Promise((resolve, reject) => {
    // Create temp directory with documents as markdown files
    const tmpDir = join(tmpdir(), `graphify-agent-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const filename = `doc_${i}_${(doc.title || 'untitled').replace(/[^a-z0-9]/gi, '_').slice(0, 40)}.md`;
      writeFileSync(join(tmpDir, filename), `# ${doc.title || 'Untitled'}\n\n${doc.content || ''}`);
    }

    // Run graphify: extract → build → export JSON
    const script = `
import json, sys
from pathlib import Path
from graphify.extract import extract, collect_files
from graphify.build import build
from graphify.cluster import cluster
from networkx.readwrite import json_graph

paths = collect_files(Path('${tmpDir.replace(/'/g, "\\'")}'))
if not paths:
    print(json.dumps({"nodes": [], "edges": []}))
    sys.exit(0)

extraction = extract(paths)
G = build([extraction], directed=True)
communities = cluster(G)

# Add community info to nodes
for cid, members in communities.items():
    for nid in members:
        if nid in G.nodes:
            G.nodes[nid]['community'] = cid

# Serialize
data = json_graph.node_link_data(G)
# Normalize: ensure 'edges' key exists
if 'links' in data and 'edges' not in data:
    data['edges'] = data['links']
    del data['links']
print(json.dumps(data))
`;

    execFile(
      'python3',
      ['-c', script],
      { timeout: 30000, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        // Clean up temp dir
        try {
          rmSync(tmpDir, { recursive: true, force: true });
        } catch {
          /* ignore */
        }

        if (error) {
          reject(
            new Error(
              `graphify build failed: ${error.message}${stderr ? ` — ${stderr.slice(0, 200)}` : ''}`
            )
          );
          return;
        }

        try {
          const graph = JSON.parse(stdout);
          resolve(graph);
        } catch (e) {
          reject(new Error(`Failed to parse graphify output: ${e.message}`));
        }
      }
    );
  });
}

/**
 * JS extraction for text-based agent memories.
 * Extracts named entities (capitalized words/phrases) + key terms (frequent words).
 * Builds co-occurrence edges within each document.
 */
function buildSimple(documents) {
  const nodes = new Map();
  const edges = [];
  const edgeSet = new Set(); // dedup

  const stopwords = new Set([
    'The',
    'This',
    'That',
    'They',
    'Their',
    'There',
    'When',
    'Where',
    'What',
    'Which',
    'From',
    'With',
    'Into',
    'About',
    'After',
    'Before',
    'These',
    'Those',
    'Some',
    'Each',
    'Every',
    'Most',
    'Many',
    'Such',
    'Also',
    'Been',
    'Have',
    'Has',
    'Will',
    'Would',
    'Could',
    'Should',
    'Does',
    'Did',
    'Are',
    'Was',
    'Were',
    'Not',
    'But',
    'And',
    'For',
    'All',
    'Can',
    'Had',
    'Her',
    'His',
    'Him',
    'How',
    'Its',
    'May',
    'New',
    'Now',
    'Old',
    'See',
    'Way',
    'Who',
    'Did',
    'Get',
    'Let',
    'Say',
    'She',
    'Too',
    'Use',
  ]);

  for (const doc of documents) {
    const text = doc.content || '';
    if (text.length < 10) continue;

    const docEntities = new Set();

    // 1. Extract capitalized names/phrases (e.g. "Director", "Evaluation Board", "SMM Manager")
    const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
    let match;
    while ((match = namePattern.exec(text)) !== null) {
      const name = match[1].trim();
      if (name.length < 3 || stopwords.has(name)) continue;
      const id = name
        .toLowerCase()
        .replaceAll(/\s+/g, '_')
        .replaceAll(/[^a-z0-9_]/g, '');
      docEntities.add(id);
      if (!nodes.has(id)) {
        nodes.set(id, {
          id,
          label: name,
          file_type: 'document',
          source_file: doc.title || '',
          source_location: '',
          community: 0,
        });
      }
    }

    // 2. Extract quoted terms (e.g. "hallucination patterns")
    const quotedPattern = /["']([^"']{3,40})["']/g;
    while ((match = quotedPattern.exec(text)) !== null) {
      const term = match[1].trim();
      const id = term
        .toLowerCase()
        .replaceAll(/\s+/g, '_')
        .replaceAll(/[^a-z0-9_]/g, '');
      if (id.length < 3) continue;
      docEntities.add(id);
      if (!nodes.has(id)) {
        nodes.set(id, {
          id,
          label: term,
          file_type: 'concept',
          source_file: doc.title || '',
          source_location: '',
          community: 0,
        });
      }
    }

    // 3. Extract percentage/dollar figures with context (e.g. "40% cost reduction", "USD 0.008")
    const metricPattern = /(\d+(?:\.\d+)?)\s*(%|USD|usd|\$)/g;
    while ((match = metricPattern.exec(text)) !== null) {
      const surrounding = text
        .slice(Math.max(0, match.index - 30), match.index + match[0].length + 30)
        .trim();
      const words = surrounding
        .split(/\s+/)
        .filter((w) => w.length > 3 && !stopwords.has(w))
        .slice(0, 3);
      if (words.length > 0) {
        const label = `${match[0]} (${words.join(' ')})`;
        const id = 'metric_' + match[0].replaceAll(/[^a-z0-9]/gi, '_').toLowerCase();
        docEntities.add(id);
        if (!nodes.has(id)) {
          nodes.set(id, {
            id,
            label,
            file_type: 'metric',
            source_file: doc.title || '',
            source_location: '',
            community: 0,
          });
        }
      }
    }

    // Co-occurrence edges (deduplicated)
    const entityList = [...docEntities];
    for (let i = 0; i < entityList.length; i++) {
      for (let j = i + 1; j < entityList.length; j++) {
        const key = [entityList[i], entityList[j]].sort().join('↔');
        if (edgeSet.has(key)) continue;
        edgeSet.add(key);
        edges.push({
          source: entityList[i],
          target: entityList[j],
          relation: 'co_occurs',
          confidence: 'INFERRED',
          source_file: doc.title || '',
        });
      }
    }
  }

  // Assign simple communities by connected components
  const adj = new Map();
  for (const edge of edges) {
    if (!adj.has(edge.source)) adj.set(edge.source, new Set());
    if (!adj.has(edge.target)) adj.set(edge.target, new Set());
    adj.get(edge.source).add(edge.target);
    adj.get(edge.target).add(edge.source);
  }
  const visited = new Set();
  let communityId = 0;
  for (const [nodeId] of nodes) {
    if (visited.has(nodeId)) continue;
    const queue = [nodeId];
    while (queue.length > 0) {
      const n = queue.pop();
      if (visited.has(n)) continue;
      visited.add(n);
      if (nodes.has(n)) nodes.get(n).community = communityId;
      for (const neighbor of adj.get(n) || []) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }
    communityId++;
  }

  return {
    directed: false,
    nodes: [...nodes.values()],
    edges,
  };
}
