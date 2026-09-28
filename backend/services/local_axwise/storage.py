"""Embedded SQLite storage and fuzzy/latest artifact resolution for Axwise Local."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import sqlite3
from typing import Any, Optional
from uuid import uuid4

DEFAULT_STATE_DIR = Path.home() / ".axwise" / "state"


def get_state_dir() -> Path:
    env_dir = os.environ.get("AXWISE_STATE_DIR")
    if env_dir:
        path = Path(env_dir).expanduser().resolve()
    else:
        path = DEFAULT_STATE_DIR.expanduser().resolve()
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    return path


def get_db_connection(state_dir: Optional[Path] = None) -> sqlite3.Connection:
    directory = state_dir or get_state_dir()
    db_path = directory / "axwise.db"
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    with conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS operations (
                operation_id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                tool TEXT NOT NULL,
                title TEXT,
                created_at TEXT NOT NULL,
                sha256 TEXT NOT NULL,
                json_path TEXT NOT NULL,
                md_path TEXT NOT NULL,
                markdown TEXT,
                artifact_json TEXT,
                candidate_json TEXT,
                input_json TEXT,
                provenance_json TEXT,
                quality_review_json TEXT,
                status TEXT DEFAULT 'completed'
            );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_ops_session ON operations(session_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_ops_tool ON operations(tool);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_ops_created ON operations(created_at DESC);")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS stages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                operation_id TEXT NOT NULL,
                stage_name TEXT NOT NULL,
                stage_data TEXT,
                created_at TEXT NOT NULL
            );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_stages_op ON stages(operation_id);")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS model_cache (
                provider TEXT PRIMARY KEY,
                selected_model TEXT NOT NULL,
                available_models_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        """)
    return conn


def save_operation(
    tool: str,
    record: dict[str, Any],
    session_id: str = "default",
    state_dir: Optional[Path] = None,
) -> dict[str, Any]:
    directory = state_dir or get_state_dir()
    session_dir = directory / session_id
    session_dir.mkdir(parents=True, exist_ok=True, mode=0o700)

    operation_id = record.get("operationId") or str(uuid4())
    record["operationId"] = operation_id

    # Compute deterministic JSON and sha256
    # Remove transient sha256/reference if present to calculate clean hash
    record.pop("sha256", None)
    record.pop("reference", None)
    initial_bytes = json.dumps(record, indent=2).encode("utf-8")
    sha256 = hashlib.sha256(initial_bytes).hexdigest()

    # Stamp sha256 and reference
    record["sha256"] = sha256
    record["reference"] = {"operationId": operation_id, "sha256": sha256}
    final_bytes = json.dumps(record, indent=2).encode("utf-8")
    final_sha256 = hashlib.sha256(final_bytes).hexdigest()
    record["sha256"] = final_sha256
    record["reference"]["sha256"] = final_sha256

    json_bytes = json.dumps(record, indent=2).encode("utf-8")
    json_path = session_dir / f"{operation_id}.json"
    json_path.write_bytes(json_bytes)
    os.chmod(json_path, 0o600)

    markdown = record.get("markdown", "")
    md_path = session_dir / f"{operation_id}.md"
    md_path.write_text(markdown, encoding="utf-8")
    os.chmod(md_path, 0o600)

    # Save to SQLite
    title = (
        record.get("artifact", {}).get("title")
        or record.get("resultArtifact", {}).get("title")
        or tool
    )
    conn = get_db_connection(directory)
    with conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO operations (
                operation_id, session_id, tool, title, created_at, sha256,
                json_path, md_path, markdown, artifact_json, candidate_json,
                input_json, provenance_json, quality_review_json, status
            ) VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                operation_id,
                session_id,
                tool,
                title,
                sha256,
                str(json_path),
                str(md_path),
                markdown,
                json.dumps(record.get("artifact", {})),
                json.dumps(record.get("candidate", {})),
                json.dumps(record.get("input", {})),
                json.dumps(record.get("provenance", {})),
                json.dumps(record.get("qualityReview", {})),
                "completed",
            ),
        )

    return {
        "operationId": operation_id,
        "sha256": sha256,
        "jsonPath": str(json_path),
        "mdPath": str(md_path),
    }


def record_stage(operation_id: str, stage_name: str, data: Any, state_dir: Optional[Path] = None):
    conn = get_db_connection(state_dir)
    with conn:
        conn.execute(
            "INSERT INTO stages (operation_id, stage_name, stage_data, created_at) VALUES (?, ?, ?, datetime('now'))",
            (operation_id, stage_name, json.dumps(data) if not isinstance(data, str) else data),
        )


def get_cached_model(provider: str, max_age_hours: float = 24.0, state_dir: Optional[Path] = None) -> Optional[str]:
    conn = get_db_connection(state_dir)
    row = conn.execute(
        """
        SELECT selected_model, updated_at
        FROM model_cache
        WHERE provider = ? AND updated_at >= datetime('now', ? || ' hours')
        LIMIT 1
        """,
        (provider, f"-{max_age_hours}"),
    ).fetchone()
    if row:
        return row["selected_model"]
    return None


def set_cached_model(provider: str, selected_model: str, available_models: list[str], state_dir: Optional[Path] = None):
    conn = get_db_connection(state_dir)
    with conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO model_cache (provider, selected_model, available_models_json, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            """,
            (provider, selected_model, json.dumps(available_models)),
        )


COMPATIBLE_PARENT_TOOLS = {
    "create_prd": ["analyze_interviews", "prepare_discovery", "research_market"],
    "chat_with_persona": ["generate_personas", "chat_with_persona"],
    "simulate_interviews": ["generate_personas", "prepare_discovery"],
    "generate_personas": ["prepare_discovery"],
    "research_market": ["prepare_discovery"],
    "create_delivery_brief": ["create_prd"],
    "analyze_interviews": ["simulate_interviews"],
}


def find_latest_artifact(
    tool_names: list[str],
    session_id: Optional[str] = None,
    state_dir: Optional[Path] = None,
) -> Optional[dict[str, Any]]:
    conn = get_db_connection(state_dir)
    placeholders = ",".join("?" for _ in tool_names)
    query = f"SELECT * FROM operations WHERE tool IN ({placeholders})"
    params: list[Any] = list(tool_names)

    if session_id:
        query += " AND session_id = ?"
        params.append(session_id)

    query += " ORDER BY created_at DESC LIMIT 1"

    row = conn.execute(query, params).fetchone()
    if not row and session_id:
        # Fallback to any session
        fallback_query = f"SELECT * FROM operations WHERE tool IN ({placeholders}) ORDER BY created_at DESC LIMIT 1"
        row = conn.execute(fallback_query, tool_names).fetchone()

    if not row:
        return None

    return _row_to_artifact(row)


def find_artifact_by_id(
    operation_id: str,
    state_dir: Optional[Path] = None,
) -> Optional[dict[str, Any]]:
    conn = get_db_connection(state_dir)
    # Check exact match or prefix
    row = conn.execute(
        "SELECT * FROM operations WHERE operation_id = ? OR operation_id LIKE ? LIMIT 1",
        (operation_id, f"{operation_id}%"),
    ).fetchone()
    if not row:
        # Check files directly
        directory = state_dir or get_state_dir()
        matches = list(directory.glob(f"**/{operation_id}*.json"))
        if matches:
            try:
                data = json.loads(matches[0].read_text(encoding="utf-8"))
                return data
            except Exception:
                pass
        return None
    return _row_to_artifact(row)


def _row_to_artifact(row: sqlite3.Row) -> dict[str, Any]:
    op_id = row["operation_id"]
    sha = row["sha256"]
    json_path = Path(row["json_path"])
    ref_dict = {"operationId": op_id, "sha256": sha}

    if json_path.exists():
        try:
            data = json.loads(json_path.read_text(encoding="utf-8"))
            if "reference" not in data:
                data["reference"] = ref_dict
            return data
        except Exception:
            pass

    return {
        "operationId": op_id,
        "tool": row["tool"],
        "sha256": sha,
        "reference": ref_dict,
        "markdown": row["markdown"],
        "artifact": json.loads(row["artifact_json"] or "{}"),
        "candidate": json.loads(row["candidate_json"] or "{}"),
        "input": json.loads(row["input_json"] or "{}"),
        "provenance": json.loads(row["provenance_json"] or "{}"),
        "qualityReview": json.loads(row["quality_review_json"] or "{}"),
    }


def resolve_references_with_fallback(
    tool_name: str,
    raw_input: dict[str, Any],
    session_id: str = "default",
    state_dir: Optional[Path] = None,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """
    Fuzzy/Latest Reference Fallback resolver.
    If the caller omits sha256 or operationId, resolves to the most recent compatible artifact
    rather than crashing the conversation turn.
    """
    input_dict = dict(raw_input)
    references = input_dict.get("references") or []
    resolved_artifacts: list[dict[str, Any]] = []

    def _add_resolved(art):
        if not any(a.get("operationId") == art.get("operationId") for a in resolved_artifacts):
            resolved_artifacts.append(art)

    # 1. Process explicit references
    for ref in references:
        if isinstance(ref, dict):
            op_id = ref.get("operationId")
            if op_id:
                artifact = find_artifact_by_id(op_id, state_dir)
                if artifact:
                    _add_resolved(artifact)
                    target_sha = artifact.get("reference", {}).get("sha256") or artifact.get("sha256")
                    if target_sha:
                        ref["sha256"] = target_sha

    # 2. Check legacy analysisArtifact for create_prd
    analysis_ref = input_dict.get("analysisArtifact")
    if isinstance(analysis_ref, dict) and analysis_ref.get("operationId"):
        art = find_artifact_by_id(analysis_ref["operationId"], state_dir)
        if art:
            _add_resolved(art)
            target_sha = art.get("reference", {}).get("sha256") or art.get("sha256")
            if target_sha:
                analysis_ref["sha256"] = target_sha

    # 3. Check revisionOf
    revision_of = input_dict.get("revisionOf")
    if isinstance(revision_of, dict) and revision_of.get("operationId"):
        rev_art = find_artifact_by_id(revision_of["operationId"], state_dir)
        if rev_art:
            _add_resolved(rev_art)
            target_sha = rev_art.get("reference", {}).get("sha256") or rev_art.get("sha256")
            if target_sha:
                revision_of["sha256"] = target_sha

    # 3b. Check documentReference for chat_with_persona
    doc_ref = input_dict.get("documentReference")
    if isinstance(doc_ref, dict) and doc_ref.get("operationId"):
        doc_art = find_artifact_by_id(doc_ref["operationId"], state_dir)
        if doc_art:
            _add_resolved(doc_art)
            target_sha = doc_art.get("reference", {}).get("sha256") or doc_art.get("sha256")
            if target_sha:
                doc_ref["sha256"] = target_sha

    # 4. Fallback: if no compatible reference was found and this tool benefits from one
    compatible_tools = COMPATIBLE_PARENT_TOOLS.get(tool_name, [])
    has_compatible = any(a.get("tool") in compatible_tools for a in resolved_artifacts)

    if not has_compatible and compatible_tools:
        latest = find_latest_artifact(compatible_tools, session_id=session_id, state_dir=state_dir)
        if latest:
            _add_resolved(latest)
            sha = latest.get("sha256") or latest.get("reference", {}).get("sha256") or hashlib.sha256(json.dumps(latest).encode()).hexdigest()
            # Ensure latest['reference'] has this exact sha256
            if "reference" not in latest:
                latest["reference"] = {"operationId": latest["operationId"], "sha256": sha}
            else:
                latest["reference"]["sha256"] = sha

            fallback_ref = {
                "operationId": latest["operationId"],
                "sha256": sha,
            }
            if "references" not in input_dict or not isinstance(input_dict["references"], list):
                input_dict["references"] = []
            if not any(r.get("operationId") == latest["operationId"] for r in input_dict["references"]):
                input_dict["references"].append(fallback_ref)
            if tool_name == "create_prd" and not input_dict.get("analysisArtifact") and latest.get("tool") == "analyze_interviews":
                input_dict["analysisArtifact"] = fallback_ref

    return input_dict, resolved_artifacts
