//! GAVEL In-Memory Graph Engine with Bidirectional BFS (Bi-BFS) and PRD Requirement Traceability.
//!
//! Bridges AxWise PRD requirement nodes (`REQ-*`) with source code symbols and resolves
//! shortest topological paths in O(b^(d/2)) using Bidirectional Breadth-First Search.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet, VecDeque};
use std::fs;
use std::path::Path;
use std::time::Instant;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EdgeConfidence {
    #[default]
    Extracted,
    Inferred,
    Ambiguous,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GavelNode {
    pub id: String,
    pub kind: String,
    pub file: String,
    pub name: String,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GavelEdge {
    pub from: String,
    pub to: String,
    pub relation: String,
    #[serde(default)]
    pub confidence: EdgeConfidence,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GavelPathHop {
    pub from: String,
    pub to: String,
    pub relation: String,
    pub confidence: EdgeConfidence,
    pub direction: String,
}

#[derive(Default, Debug, Clone)]
pub struct GavelGraph {
    pub nodes: HashMap<String, GavelNode>,
    pub adjacency: HashMap<String, Vec<GavelEdge>>,
    pub reverse: HashMap<String, Vec<GavelEdge>>,
}

/// Extract PRD requirement identifiers matching `REQ-[A-Za-z0-9_-]+` from text.
pub fn extract_prd_requirements(text: &str) -> Vec<(String, String)> {
    let mut found = Vec::new();
    let mut seen = HashSet::new();

    for line in text.lines() {
        let mut rest = line;
        while let Some(pos) = rest.find("REQ-") {
            let after_prefix = &rest[pos + 4..];
            let token_len = after_prefix
                .chars()
                .take_while(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
                .map(|c| c.len_utf8())
                .sum::<usize>();
            let raw_suffix = after_prefix[..token_len].trim_end_matches(['-', '_']);
            if !raw_suffix.is_empty() && raw_suffix.chars().any(|c| c.is_ascii_alphanumeric()) {
                let req_id = format!("REQ-{raw_suffix}");
                if seen.insert(req_id.clone()) {
                    let snippet: String = line.trim().chars().take(240).collect();
                    found.push((req_id, snippet));
                }
            }
            rest = &after_prefix[token_len..];
        }
    }
    found
}

fn contains_identifier_token(haystack: &str, ident: &str) -> bool {
    if ident.is_empty() || haystack.len() < ident.len() {
        return false;
    }
    let bytes = haystack.as_bytes();
    let mut start = 0;
    while let Some(pos) = haystack[start..].find(ident) {
        let idx = start + pos;
        let end = idx + ident.len();
        let before_ok = idx == 0
            || !(bytes[idx - 1].is_ascii_alphanumeric()
                || bytes[idx - 1] == b'_'
                || bytes[idx - 1] == b'$');
        let after_ok = end == bytes.len()
            || !(bytes[end].is_ascii_alphanumeric()
                || bytes[end] == b'_'
                || bytes[end] == b'$');
        if before_ok && after_ok {
            return true;
        }
        start = idx + 1;
    }
    false
}

impl GavelGraph {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_node(&mut self, node: GavelNode) {
        let id = node.id.clone();
        self.nodes.insert(id.clone(), node);
        self.adjacency.entry(id.clone()).or_default();
        self.reverse.entry(id).or_default();
    }

    pub fn add_edge(&mut self, from: String, to: String, relation: &str) {
        self.add_edge_with_confidence(from, to, relation, EdgeConfidence::Extracted);
    }

    pub fn add_edge_with_confidence(
        &mut self,
        from: String,
        to: String,
        relation: &str,
        confidence: EdgeConfidence,
    ) {
        let edge = GavelEdge {
            from: from.clone(),
            to: to.clone(),
            relation: relation.to_string(),
            confidence,
        };
        self.adjacency.entry(from).or_default().push(edge.clone());
        self.reverse.entry(to).or_default().push(edge);
    }

    pub fn ensure_requirement_node(&mut self, req_id: &str, file: &str, snippet: &str) -> String {
        let node_id = format!("requirement:{req_id}");
        if let Some(existing) = self.nodes.get_mut(&node_id) {
            if existing.file.is_empty() && !file.is_empty() {
                existing.file = file.to_string();
                existing.snippet = snippet.to_string();
            }
        } else {
            self.add_node(GavelNode {
                id: node_id.clone(),
                kind: "requirement".into(),
                file: file.to_string(),
                name: req_id.to_string(),
                snippet: snippet.to_string(),
            });
        }
        node_id
    }

    /// Index a workspace directory for PRD markdown requirements (`REQ-*`) and source symbols.
    pub fn build_from_workspace(root: &Path, max_files: usize) -> Result<Self, String> {
        let mut graph = GavelGraph::new();
        let mut parsed_files = 0usize;
        Self::walk_dir(root, root, &mut graph, &mut parsed_files, max_files)?;
        graph.resolve_call_edges();
        Ok(graph)
    }

    fn walk_dir(
        root: &Path,
        current: &Path,
        graph: &mut GavelGraph,
        parsed_files: &mut usize,
        max_files: usize,
    ) -> Result<(), String> {
        if *parsed_files >= max_files {
            return Ok(());
        }
        let entries = fs::read_dir(current).map_err(|e| e.to_string())?;
        for entry in entries.flatten() {
            if *parsed_files >= max_files {
                break;
            }
            let path = entry.path();
            if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
                if name.starts_with('.') || matches!(name, "node_modules" | "target" | "dist") {
                    continue;
                }
            }
            if path.is_dir() {
                Self::walk_dir(root, &path, graph, parsed_files, max_files)?;
                continue;
            }
            if !path.is_file() {
                continue;
            }
            let Some(ext) = path.extension().and_then(|s| s.to_str()) else {
                continue;
            };
            let Ok(content) = fs::read_to_string(&path) else {
                continue;
            };
            let rel_path = path
                .strip_prefix(root)
                .unwrap_or(&path)
                .to_string_lossy()
                .to_string();

            if matches!(ext, "md" | "markdown") {
                let reqs = extract_prd_requirements(&content);
                if !reqs.is_empty() {
                    let file_node_id = format!("file:{rel_path}");
                    graph.add_node(GavelNode {
                        id: file_node_id.clone(),
                        kind: "file".into(),
                        file: rel_path.clone(),
                        name: rel_path.clone(),
                        snippet: format!("PRD / Spec File: {rel_path}"),
                    });
                    for (req_id, snippet) in reqs {
                        let req_node_id =
                            graph.ensure_requirement_node(&req_id, &rel_path, &snippet);
                        graph.add_edge_with_confidence(
                            file_node_id.clone(),
                            req_node_id,
                            "declares",
                            EdgeConfidence::Extracted,
                        );
                    }
                    *parsed_files += 1;
                }
                continue;
            }

            if !matches!(
                ext,
                "rs" | "ts" | "tsx" | "js" | "mjs" | "py" | "go" | "java"
            ) {
                continue;
            }

            let file_node_id = format!("file:{rel_path}");
            graph.add_node(GavelNode {
                id: file_node_id.clone(),
                kind: "file".into(),
                file: rel_path.clone(),
                name: rel_path.clone(),
                snippet: format!("File: {rel_path}"),
            });

            let mut file_symbols = Vec::new();
            for line in content.lines() {
                let trimmed = line.trim();
                for (kw, kind) in [
                    ("pub fn ", "function"),
                    ("fn ", "function"),
                    ("export function ", "function"),
                    ("export async function ", "function"),
                    ("function ", "function"),
                    ("def ", "function"),
                    ("pub struct ", "class"),
                    ("export class ", "class"),
                    ("export interface ", "class"),
                ] {
                    if let Some(rest) = trimmed.strip_prefix(kw) {
                        let name: String = rest
                            .chars()
                            .take_while(|c| c.is_ascii_alphanumeric() || *c == '_')
                            .collect();
                        if !name.is_empty() {
                            let sym_id = format!("{kind}:{rel_path}:{name}");
                            graph.add_node(GavelNode {
                                id: sym_id.clone(),
                                kind: kind.into(),
                                file: rel_path.clone(),
                                name: name.clone(),
                                snippet: content.chars().take(400).collect(),
                            });
                            graph.add_edge(file_node_id.clone(), sym_id.clone(), "declares");
                            file_symbols.push((sym_id, name));
                            break;
                        }
                    }
                }
            }

            let file_reqs = extract_prd_requirements(&content);
            for (req_id, req_line) in file_reqs {
                let req_node_id = graph.ensure_requirement_node(&req_id, "", &req_line);
                if file_symbols.is_empty() {
                    graph.add_edge_with_confidence(
                        file_node_id.clone(),
                        req_node_id,
                        "implements",
                        EdgeConfidence::Extracted,
                    );
                } else {
                    for (sym_id, _) in &file_symbols {
                        graph.add_edge_with_confidence(
                            sym_id.clone(),
                            req_node_id.clone(),
                            "implements",
                            EdgeConfidence::Extracted,
                        );
                    }
                }
            }

            *parsed_files += 1;
        }
        Ok(())
    }

    pub fn resolve_call_edges(&mut self) {
        let callables: Vec<(String, String)> = self
            .nodes
            .values()
            .filter(|n| matches!(n.kind.as_str(), "function" | "class"))
            .map(|n| (n.id.clone(), n.name.clone()))
            .collect();

        let callers: Vec<(String, String)> = self
            .nodes
            .values()
            .filter(|n| matches!(n.kind.as_str(), "function" | "class"))
            .map(|n| (n.id.clone(), n.snippet.clone()))
            .collect();

        for (caller_id, snippet) in callers {
            for (callee_id, callee_name) in &callables {
                if &caller_id != callee_id
                    && callee_name.len() >= 3
                    && contains_identifier_token(&snippet, callee_name)
                {
                    self.add_edge_with_confidence(
                        caller_id.clone(),
                        callee_id.clone(),
                        "calls",
                        EdgeConfidence::Inferred,
                    );
                }
            }
        }
    }

    fn resolve_symbol_nodes(&self, symbol: &str) -> Vec<String> {
        let mut exact: Vec<String> = self
            .nodes
            .values()
            .filter(|n| n.id == symbol || n.name == symbol)
            .map(|n| n.id.clone())
            .collect();
        if !exact.is_empty() {
            exact.sort();
            return exact;
        }
        let mut partial: Vec<String> = self
            .nodes
            .values()
            .filter(|n| n.name.contains(symbol) || n.id.contains(symbol))
            .map(|n| n.id.clone())
            .collect();
        partial.sort();
        partial
    }

    /// Bidirectional Breadth-First Search (Bi-BFS) shortest path between `source_symbol` and `target_symbol`.
    pub fn find_shortest_path(
        &self,
        source_symbol: &str,
        target_symbol: &str,
        max_depth: usize,
    ) -> Value {
        let t0 = Instant::now();
        let start_nodes = self.resolve_symbol_nodes(source_symbol);
        let end_nodes = self.resolve_symbol_nodes(target_symbol);

        if start_nodes.is_empty() || end_nodes.is_empty() {
            return json!({
                "found": false,
                "mode": "bi_bfs_shortest_path",
                "status": "unknown",
                "code": "SYMBOL_NOT_INDEXED",
                "source": source_symbol,
                "target": target_symbol,
                "hops": [],
                "nodes": [],
            });
        }

        let start_set: HashSet<String> = start_nodes.iter().cloned().collect();
        let end_set: HashSet<String> = end_nodes.iter().cloned().collect();
        for s in &start_nodes {
            if end_set.contains(s) {
                let node = self.nodes.get(s).cloned();
                return json!({
                    "found": true,
                    "mode": "bi_bfs_shortest_path",
                    "source": source_symbol,
                    "target": target_symbol,
                    "hop_count": 0,
                    "explored_edges": 0,
                    "search_us": t0.elapsed().as_micros(),
                    "hops": [],
                    "nodes": node.into_iter().collect::<Vec<_>>(),
                });
            }
        }

        let mut forward_visited: HashMap<String, Option<(String, GavelPathHop)>> = HashMap::new();
        let mut backward_visited: HashMap<String, Option<(String, GavelPathHop)>> = HashMap::new();
        let mut forward_queue: VecDeque<(String, usize)> = VecDeque::new();
        let mut backward_queue: VecDeque<(String, usize)> = VecDeque::new();

        for s in &start_nodes {
            forward_visited.insert(s.clone(), None);
            forward_queue.push_back((s.clone(), 0));
        }
        for e in &end_nodes {
            backward_visited.insert(e.clone(), None);
            backward_queue.push_back((e.clone(), 0));
        }

        let mut meeting_node: Option<String> = None;
        let mut explored_edges: usize = 0;
        let half_depth = max_depth.div_ceil(2).max(1);

        while (!forward_queue.is_empty() || !backward_queue.is_empty()) && meeting_node.is_none() {
            let expand_forward = !forward_queue.is_empty()
                && (backward_queue.is_empty() || forward_queue.len() <= backward_queue.len());

            if expand_forward {
                let level_size = forward_queue.len();
                for _ in 0..level_size {
                    let Some((curr, depth)) = forward_queue.pop_front() else {
                        break;
                    };
                    if backward_visited.contains_key(&curr) {
                        meeting_node = Some(curr);
                        break;
                    }
                    if depth >= half_depth {
                        continue;
                    }
                    for (next_id, hop) in self.neighbors_with_hops(&curr) {
                        if !Self::is_allowed_declares_hop(&hop, &start_set, &end_set) {
                            continue;
                        }
                        explored_edges += 1;
                        if !forward_visited.contains_key(&next_id) {
                            forward_visited.insert(next_id.clone(), Some((curr.clone(), hop)));
                            if backward_visited.contains_key(&next_id) {
                                meeting_node = Some(next_id);
                                break;
                            }
                            forward_queue.push_back((next_id, depth + 1));
                        }
                    }
                    if meeting_node.is_some() {
                        break;
                    }
                }
            } else {
                let level_size = backward_queue.len();
                for _ in 0..level_size {
                    let Some((curr, depth)) = backward_queue.pop_front() else {
                        break;
                    };
                    if forward_visited.contains_key(&curr) {
                        meeting_node = Some(curr);
                        break;
                    }
                    if depth >= max_depth {
                        continue;
                    }
                    for (prev_id, hop_from_prev_to_curr) in self.reverse_neighbors_with_hops(&curr)
                    {
                        if !Self::is_allowed_declares_hop(
                            &hop_from_prev_to_curr,
                            &start_set,
                            &end_set,
                        ) {
                            continue;
                        }
                        explored_edges += 1;
                        if !backward_visited.contains_key(&prev_id) {
                            backward_visited.insert(
                                prev_id.clone(),
                                Some((curr.clone(), hop_from_prev_to_curr)),
                            );
                            if forward_visited.contains_key(&prev_id) {
                                meeting_node = Some(prev_id);
                                break;
                            }
                            backward_queue.push_back((prev_id, depth + 1));
                        }
                    }
                    if meeting_node.is_some() {
                        break;
                    }
                }
            }
        }

        let Some(meet) = meeting_node else {
            return json!({
                "found": false,
                "mode": "bi_bfs_shortest_path",
                "source": source_symbol,
                "target": target_symbol,
                "max_depth": max_depth,
                "explored_edges": explored_edges,
                "search_us": t0.elapsed().as_micros(),
                "hops": [],
                "nodes": [],
            });
        };

        let mut hops = Vec::new();
        let mut cursor = meet.clone();
        while let Some(Some((parent, hop))) = forward_visited.get(&cursor) {
            hops.push(hop.clone());
            cursor = parent.clone();
        }
        hops.reverse();

        cursor = meet;
        while let Some(Some((child, hop))) = backward_visited.get(&cursor) {
            hops.push(hop.clone());
            cursor = child.clone();
        }

        let mut path_node_ids = Vec::new();
        let mut seen_nodes = HashSet::new();
        for hop in &hops {
            if seen_nodes.insert(hop.from.clone()) {
                path_node_ids.push(hop.from.clone());
            }
            if seen_nodes.insert(hop.to.clone()) {
                path_node_ids.push(hop.to.clone());
            }
        }
        let path_nodes: Vec<GavelNode> = path_node_ids
            .into_iter()
            .filter_map(|id| self.nodes.get(&id).cloned())
            .collect();

        json!({
            "found": true,
            "mode": "bi_bfs_shortest_path",
            "source": source_symbol,
            "target": target_symbol,
            "hop_count": hops.len(),
            "explored_edges": explored_edges,
            "search_us": t0.elapsed().as_micros(),
            "hops": hops,
            "nodes": path_nodes,
        })
    }

    /// Standard unidirectional BFS for benchmarking against Bi-BFS.
    pub fn find_shortest_path_unidirectional(
        &self,
        source_symbol: &str,
        target_symbol: &str,
        max_depth: usize,
    ) -> Value {
        let t0 = Instant::now();
        let start_nodes = self.resolve_symbol_nodes(source_symbol);
        let end_set: HashSet<String> = self
            .resolve_symbol_nodes(target_symbol)
            .into_iter()
            .collect();

        let mut visited: HashMap<String, Option<(String, GavelPathHop)>> = HashMap::new();
        let mut queue: VecDeque<(String, usize)> = VecDeque::new();
        for s in start_nodes {
            visited.insert(s.clone(), None);
            queue.push_back((s, 0));
        }

        let mut found_end = None;
        let mut explored_edges = 0usize;

        while let Some((curr, depth)) = queue.pop_front() {
            if end_set.contains(&curr) {
                found_end = Some(curr);
                break;
            }
            if depth >= max_depth {
                continue;
            }
            for (next_id, hop) in self.neighbors_with_hops(&curr) {
                explored_edges += 1;
                if !visited.contains_key(&next_id) {
                    visited.insert(next_id.clone(), Some((curr.clone(), hop)));
                    if end_set.contains(&next_id) {
                        found_end = Some(next_id);
                        break;
                    }
                    queue.push_back((next_id, depth + 1));
                }
            }
            if found_end.is_some() {
                break;
            }
        }

        let mut hops = Vec::new();
        if let Some(mut cursor) = found_end.clone() {
            while let Some(Some((parent, hop))) = visited.get(&cursor) {
                hops.push(hop.clone());
                cursor = parent.clone();
            }
            hops.reverse();
        }

        json!({
            "found": found_end.is_some(),
            "mode": "unidirectional_bfs",
            "hop_count": hops.len(),
            "explored_edges": explored_edges,
            "search_us": t0.elapsed().as_micros(),
            "hops": hops,
        })
    }

    fn is_allowed_declares_hop(
        hop: &GavelPathHop,
        start_set: &HashSet<String>,
        end_set: &HashSet<String>,
    ) -> bool {
        if hop.relation != "declares" {
            return true;
        }
        let file_end = if hop.from.starts_with("file:") {
            &hop.from
        } else {
            &hop.to
        };
        start_set.contains(file_end) || end_set.contains(file_end)
    }

    fn neighbors_with_hops(&self, node_id: &str) -> Vec<(String, GavelPathHop)> {
        let mut out = Vec::new();
        if let Some(edges) = self.adjacency.get(node_id) {
            for e in edges {
                out.push((
                    e.to.clone(),
                    GavelPathHop {
                        from: e.from.clone(),
                        to: e.to.clone(),
                        relation: e.relation.clone(),
                        confidence: e.confidence,
                        direction: "forward".into(),
                    },
                ));
            }
        }
        if let Some(rev_edges) = self.reverse.get(node_id) {
            for e in rev_edges {
                out.push((
                    e.from.clone(),
                    GavelPathHop {
                        from: node_id.to_string(),
                        to: e.from.clone(),
                        relation: e.relation.clone(),
                        confidence: e.confidence,
                        direction: "reverse".into(),
                    },
                ));
            }
        }
        out
    }

    fn reverse_neighbors_with_hops(&self, node_id: &str) -> Vec<(String, GavelPathHop)> {
        let mut out = Vec::new();
        if let Some(rev_edges) = self.reverse.get(node_id) {
            for e in rev_edges {
                out.push((
                    e.from.clone(),
                    GavelPathHop {
                        from: e.from.clone(),
                        to: node_id.to_string(),
                        relation: e.relation.clone(),
                        confidence: e.confidence,
                        direction: "forward".into(),
                    },
                ));
            }
        }
        if let Some(edges) = self.adjacency.get(node_id) {
            for e in edges {
                out.push((
                    e.to.clone(),
                    GavelPathHop {
                        from: e.to.clone(),
                        to: node_id.to_string(),
                        relation: e.relation.clone(),
                        confidence: e.confidence,
                        direction: "reverse".into(),
                    },
                ));
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_prd_requirement_links_and_bi_bfs_trace() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        fs::write(
            root.join("PRD.md"),
            "# Checkout PRD\n- [ ] REQ-AUTH-01: Validate bearer session\n- [ ] REQ-PAY-02: Settle invoice\n",
        )
        .unwrap();

        fs::write(
            root.join("auth.ts"),
            "// Implements REQ-AUTH-01\nexport function verifySession(token: string) { return token.length > 0; }\n",
        )
        .unwrap();

        fs::write(
            root.join("checkout.ts"),
            "export function handleCheckout(token: string) { return verifySession(token); }\n",
        )
        .unwrap();

        let graph = GavelGraph::build_from_workspace(root, 50).unwrap();

        // Check PRD node is linked to PRD.md
        let prd_to_req = graph.find_shortest_path("file:PRD.md", "REQ-AUTH-01", 4);
        assert_eq!(prd_to_req["found"], true);
        assert_eq!(prd_to_req["hop_count"], 1);

        // Check Bi-BFS from handleCheckout -> verifySession -> REQ-AUTH-01 -> file:PRD.md
        let full_trace = graph.find_shortest_path("handleCheckout", "file:PRD.md", 6);
        assert_eq!(full_trace["found"], true);
        assert_eq!(full_trace["hop_count"], 3);
        let hops = full_trace["hops"].as_array().unwrap();
        assert_eq!(hops[0]["relation"], "calls");
        assert_eq!(hops[0]["confidence"], "INFERRED");
        assert_eq!(hops[1]["relation"], "implements");
        assert_eq!(hops[1]["confidence"], "EXTRACTED");
        assert_eq!(hops[2]["relation"], "declares");
        assert_eq!(hops[2]["confidence"], "EXTRACTED");
    }

    #[test]
    fn benchmark_bi_bfs_vs_unidirectional_bfs_on_scale_graph() {
        // Construct a layered graph with branching factor b=8 and depth d=5 (4,681 nodes)
        let mut graph = GavelGraph::new();
        let branching = 8usize;
        let depth = 4usize;

        graph.add_node(GavelNode {
            id: "node:0_0".into(),
            kind: "function".into(),
            file: "src/entry.rs".into(),
            name: "entryPoint".into(),
            snippet: "fn entryPoint()".into(),
        });

        let mut current_layer = vec!["node:0_0".to_string()];
        let mut total_nodes = 1usize;

        for level in 1..=depth {
            let mut next_layer = Vec::new();
            for (idx, parent_id) in current_layer.iter().enumerate() {
                for b in 0..branching {
                    let child_idx = idx * branching + b;
                    let child_id = format!("node:{level}_{child_idx}");
                    let child_name = if level == depth && child_idx == 4095 {
                        "REQ-CORE-99".to_string()
                    } else {
                        format!("sym_{level}_{child_idx}")
                    };
                    graph.add_node(GavelNode {
                        id: child_id.clone(),
                        kind: if level == depth && child_idx == 0 {
                            "requirement".into()
                        } else {
                            "function".into()
                        },
                        file: format!("src/mod_{level}.rs"),
                        name: child_name,
                        snippet: String::new(),
                    });
                    graph.add_edge_with_confidence(
                        parent_id.clone(),
                        child_id.clone(),
                        if level == depth { "implements" } else { "calls" },
                        if level == depth {
                            EdgeConfidence::Extracted
                        } else {
                            EdgeConfidence::Inferred
                        },
                    );
                    next_layer.push(child_id);
                    total_nodes += 1;
                }
            }
            current_layer = next_layer;
        }

        // Add noise / fan-out around target to simulate real repository connectivity
        for extra in 0..6 {
            let fan_id = format!("fan:{extra}");
            graph.add_node(GavelNode {
                id: fan_id.clone(),
                kind: "file".into(),
                file: "docs/PRD.md".into(),
                name: format!("doc_{extra}"),
                snippet: String::new(),
            });
            graph.add_edge("node:4_4095".into(), fan_id, "declares");
        }

        // Run 50 iterations of both Bi-BFS and Unidirectional BFS
        let iterations = 50;
        let t_bi = Instant::now();
        let mut bi_res = Value::Null;
        for _ in 0..iterations {
            bi_res = graph.find_shortest_path("entryPoint", "REQ-CORE-99", 8);
        }
        let bi_avg_us = t_bi.elapsed().as_micros() as f64 / iterations as f64;

        let t_uni = Instant::now();
        let mut uni_res = Value::Null;
        for _ in 0..iterations {
            uni_res = graph.find_shortest_path_unidirectional("entryPoint", "REQ-CORE-99", 8);
        }
        let uni_avg_us = t_uni.elapsed().as_micros() as f64 / iterations as f64;

        assert_eq!(bi_res["found"], true);
        assert_eq!(uni_res["found"], true);
        assert_eq!(bi_res["hop_count"], 4);
        assert_eq!(uni_res["hop_count"], 4);

        let bi_edges = bi_res["explored_edges"].as_u64().unwrap();
        let uni_edges = uni_res["explored_edges"].as_u64().unwrap();

        println!(
            "BENCHMARK_RESULT: nodes={total_nodes} | Bi-BFS: {bi_avg_us:.1} us ({bi_edges} edges) | Uni-BFS: {uni_avg_us:.1} us ({uni_edges} edges)"
        );
        assert!(
            bi_edges < uni_edges,
            "Bi-BFS should explore significantly fewer edges than unidirectional BFS ({bi_edges} vs {uni_edges})"
        );
    }
}
