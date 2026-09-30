"""Scoped artifact storage with verified file references and explicit safety outcomes."""
from __future__ import annotations

from contextlib import closing
from copy import deepcopy
import hashlib
import hmac
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import stat
import tempfile
from typing import Any, Optional
from uuid import uuid4

DEFAULT_STATE_DIR = Path.home() / ".axwise" / "state"
MAX_ARTIFACT_BYTES = 16 * 1024 * 1024
SAFETY_REMOTE_LIMIT = 16_000
_SAFE_COMPONENT = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,199}\Z")


class StorageError(ValueError):
    """A machine-readable failure that does not include artifact/credential text."""

    def __init__(self, code: str, message: str, *, safety: Optional[dict[str, Any]] = None):
        self.code = code
        self.safety = safety
        super().__init__(f"{code}: {message}")


def _component(value: str, name: str) -> str:
    if not isinstance(value, str) or not _SAFE_COMPONENT.fullmatch(value):
        raise StorageError("INVALID_STORAGE_SCOPE", f"{name} must be a nonempty safe path component")
    return value


def get_state_dir() -> Path:
    return _state_directory(Path(os.environ.get("AXWISE_STATE_DIR") or DEFAULT_STATE_DIR))


def _state_directory(state_dir: Optional[Path] = None) -> Path:
    path = Path(state_dir).expanduser().resolve() if state_dir is not None else get_state_dir()
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    return path


def _session_directory(directory: Path, session_id: str) -> Path:
    path = directory / _component(session_id, "session_id")
    if path.is_symlink() or path.resolve().parent != directory:
        raise StorageError("INVALID_STORAGE_SCOPE", "Session directory must stay inside the configured state root")
    return path


def get_db_connection(state_dir: Optional[Path] = None) -> sqlite3.Connection:
    directory = _state_directory(state_dir)
    conn = sqlite3.connect(str(directory / "axwise.db"), check_same_thread=False)
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


def _unevaluated(reason: str, total: int) -> dict[str, Any]:
    return {"status": "not_evaluated", "evaluated": False, "passed": None,
            "reason": reason, "advisory": True, "checkedCharacters": 0,
            "totalCharacters": total}


# Narrow local checks are useful, but their absence never certifies text as secret-free.
_KNOWN_SECRET_PATTERNS = (
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"),
    re.compile(r"\b(?:sk-(?:proj-)?|gh[pousr]_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]{20,}\b"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"(?i)\bbearer\s+[A-Za-z0-9_+./=-]{24,}"),
)


def check_artifact_safety_with_jev(content: str, timeout_seconds: float = 1.5) -> dict[str, Any]:
    """Check all text locally; remote inspection requires an explicit, separate opt-in.

    AXWISE_REMOTE_ARTIFACT_SAFETY=true allows sending the complete bounded artifact
    to Typesafe. An API key alone is insufficient authorization. Unconfigured,
    unavailable, malformed, and oversized requests remain not_evaluated advisories.
    The local detector is narrow; it does not claim to identify every credential.
    """
    total = len(content)
    local = {"localCheck": "no_known_secret_patterns", "localCheckedCharacters": total}
    if any(pattern.search(content) for pattern in _KNOWN_SECRET_PATTERNS):
        return {"status": "failed", "evaluated": True, "passed": False,
                "contains_secrets": True, "reason": "known_secret_pattern",
                "checkedCharacters": total, "totalCharacters": total,
                "localCheck": "known_secret_pattern", "localCheckedCharacters": total}
    if os.environ.get("AXWISE_REMOTE_ARTIFACT_SAFETY", "").lower() != "true":
        return {**_unevaluated("remote_check_not_enabled", total), **local}
    api_key = os.environ.get("TYPESAFE_API_KEY", "").strip()
    if not api_key:
        return {**_unevaluated("unconfigured", total), **local}
    if not content:
        return {**_unevaluated("empty_content", total), **local}
    if total > SAFETY_REMOTE_LIMIT:
        return {**_unevaluated("content_exceeds_remote_limit", total), **local}
    try:
        import urllib.request
        import ssl
        try:
            import certifi
            ctx = ssl.create_default_context(cafile=certifi.where())
        except ImportError:
            ctx = ssl.create_default_context()
        payload = {
            "model": "jev-latest", "state": {"snippet": content},
            "questions": {"contains_hardcoded_secrets": {
                "type": "noul",
                "instructions": "Does this text or code contain unmasked API keys, private passwords, bearer tokens, or secret credentials?",
            }},
        }
        req = urllib.request.Request(
            "https://api.typesafe.ai/v1/systemone", data=json.dumps(payload).encode("utf-8"),
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=timeout_seconds, context=ctx) as resp:
            data = json.loads(resp.read(64 * 1024 + 1).decode("utf-8"))
        score = data["answers"]["contains_hardcoded_secrets"]["noul"]
        if isinstance(score, bool) or not isinstance(score, (int, float)) or not math.isfinite(score) or not 0 <= score <= 1:
            return {**_unevaluated("invalid_response", total), **local}
        passed = score < 0.8
        return {"status": "passed" if passed else "failed", "evaluated": True,
                "passed": passed, "contains_secrets": not passed, "confidence": score,
                "model": "jev-latest", "checkedCharacters": total, "totalCharacters": total, **local}
    except (KeyError, TypeError, ValueError):
        return {**_unevaluated("invalid_response", total), **local}
    except Exception:
        return {**_unevaluated("service_unavailable", total), **local}


def _publication_safety(content: str) -> dict[str, Any]:
    result = check_artifact_safety_with_jev(content)
    if not isinstance(result, dict):
        return _unevaluated("invalid_response", len(content))
    if result.get("passed") is False or result.get("status") == "failed" or result.get("contains_secrets") is True:
        verdict = {**result, "status": "failed", "evaluated": True, "passed": False}
        raise StorageError("ARTIFACT_SAFETY_FAILED", "Artifact publication refused by the secret check", safety=verdict)
    if result.get("evaluated") is True and result.get("passed") is True:
        return {**result, "status": "passed"}
    return {**result, "status": "not_evaluated", "evaluated": False, "passed": None, "advisory": True}


def _write_immutable(path: Path, content: bytes) -> None:
    """Publish complete bytes atomically without replacing an existing artifact."""
    fd, temporary = tempfile.mkstemp(prefix=".artifact-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def save_operation(tool: str, record: dict[str, Any], session_id: str = "default",
                   state_dir: Optional[Path] = None) -> dict[str, Any]:
    directory = _state_directory(state_dir)
    session_dir = _session_directory(directory, session_id)
    payload = deepcopy(record)
    operation_id = _component(payload.get("operationId") or str(uuid4()), "operation_id")
    if payload.get("sessionId", session_id) != session_id or payload.get("tool", tool) != tool:
        raise StorageError("ARTIFACT_SCOPE_MISMATCH", "Artifact identity does not match the save scope")
    payload.update(operationId=operation_id, sessionId=session_id, tool=tool)
    # The external reference hashes immutable bytes; it cannot be embedded in those bytes.
    for key in ("sha256", "reference", "artifactSafety"):
        payload.pop(key, None)
    payload["artifactSafety"] = _publication_safety(json.dumps(payload, ensure_ascii=False, sort_keys=True))
    json_bytes = json.dumps(payload, indent=2, ensure_ascii=False).encode("utf-8")
    if len(json_bytes) > MAX_ARTIFACT_BYTES:
        raise StorageError("ARTIFACT_TOO_LARGE", "Artifact exceeds the local storage size bound")
    sha256 = hashlib.sha256(json_bytes).hexdigest()
    markdown = payload.get("markdown", "")
    if not isinstance(markdown, str):
        raise StorageError("INVALID_ARTIFACT", "Artifact markdown must be text")
    json_path, md_path = session_dir / f"{operation_id}.json", session_dir / f"{operation_id}.md"
    artifact, result_artifact = payload.get("artifact") or {}, payload.get("resultArtifact") or {}
    title = artifact.get("title") or result_artifact.get("title") or tool
    session_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    published: list[Path] = []
    try:
        with closing(get_db_connection(directory)) as conn, conn:
            conn.execute("BEGIN IMMEDIATE")
            if conn.execute("SELECT 1 FROM operations WHERE operation_id = ?", (operation_id,)).fetchone():
                raise StorageError("ARTIFACT_ALREADY_EXISTS", "Operation IDs are immutable; generate a new operation ID")
            for path, content in ((json_path, json_bytes), (md_path, markdown.encode("utf-8"))):
                _write_immutable(path, content)
                published.append(path)
            conn.execute(
                """INSERT INTO operations (
                    operation_id, session_id, tool, title, created_at, sha256,
                    json_path, md_path, markdown, artifact_json, candidate_json,
                    input_json, provenance_json, quality_review_json, status
                ) VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (operation_id, session_id, tool, title, sha256, str(json_path), str(md_path), markdown,
                 json.dumps(artifact), json.dumps(payload.get("candidate", {})), json.dumps(payload.get("input", {})),
                 json.dumps(payload.get("provenance", {})), json.dumps(payload.get("qualityReview", {})), "completed"),
            )
    except Exception as exc:
        for path in published:
            path.unlink(missing_ok=True)
        if isinstance(exc, StorageError):
            raise
        raise StorageError("ARTIFACT_SAVE_FAILED", "Artifact files and database could not be saved") from exc
    return {"operationId": operation_id, "sha256": sha256, "jsonPath": str(json_path), "mdPath": str(md_path),
            "artifactSafety": payload["artifactSafety"]}


def record_stage(operation_id: str, stage_name: str, data: Any, state_dir: Optional[Path] = None):
    """Persist audit fingerprints only; raw stage content awaits the publication gate.

    Historical raw rows remain untouched; removing them requires a separate migration.
    """
    stage_bytes = (data if isinstance(data, str) else json.dumps(data, sort_keys=True)).encode("utf-8")
    audit = {"persistence": "metadata_only", "payloadSha256": hashlib.sha256(stage_bytes).hexdigest(),
             "payloadBytes": len(stage_bytes)}
    try:
        with closing(get_db_connection(state_dir)) as conn, conn:
            conn.execute(
                "INSERT INTO stages (operation_id, stage_name, stage_data, created_at) VALUES (?, ?, ?, datetime('now'))",
                (operation_id, stage_name, json.dumps(audit)),
            )
    except (OSError, sqlite3.Error) as exc:
        raise StorageError("STAGE_SAVE_FAILED", "Stage audit metadata could not be saved") from exc


def get_cached_model(provider: str, max_age_hours: float = 24.0, state_dir: Optional[Path] = None) -> Optional[str]:
    with closing(get_db_connection(state_dir)) as conn:
        row = conn.execute(
            """SELECT selected_model, updated_at FROM model_cache
               WHERE provider = ? AND updated_at >= datetime('now', ? || ' hours') LIMIT 1""",
            (provider, f"-{max_age_hours}"),
        ).fetchone()
    return row["selected_model"] if row else None


def set_cached_model(provider: str, selected_model: str, available_models: list[str], state_dir: Optional[Path] = None):
    with closing(get_db_connection(state_dir)) as conn, conn:
        conn.execute(
            """INSERT OR REPLACE INTO model_cache (provider, selected_model, available_models_json, updated_at)
               VALUES (?, ?, ?, datetime('now'))""", (provider, selected_model, json.dumps(available_models)),
        )


COMPATIBLE_PARENT_TOOLS = {
    "create_prd": ["analyze_interviews", "prepare_discovery", "research_market"],
    "chat_with_persona": ["generate_personas", "chat_with_persona"],
    "simulate_interviews": ["generate_personas", "prepare_discovery"],
    "generate_personas": ["prepare_discovery"], "research_market": ["prepare_discovery"],
    "create_delivery_brief": ["create_prd"], "analyze_interviews": ["simulate_interviews"],
}


def find_latest_artifact(tool_names: list[str], session_id: str = "default",
                         state_dir: Optional[Path] = None) -> Optional[dict[str, Any]]:
    directory = _state_directory(state_dir)
    _session_directory(directory, session_id)
    if not tool_names:
        return None
    placeholders = ",".join("?" for _ in tool_names)
    with closing(get_db_connection(directory)) as conn:
        row = conn.execute(
            f"SELECT * FROM operations WHERE tool IN ({placeholders}) AND session_id = ? "
            "AND status = 'completed' ORDER BY created_at DESC, rowid DESC LIMIT 1", [*tool_names, session_id],
        ).fetchone()
    return _row_to_artifact(row, directory) if row else None


def find_artifact_by_id(operation_id: str, state_dir: Optional[Path] = None, *,
                        session_id: str = "default") -> Optional[dict[str, Any]]:
    """Resolve exact IDs or unambiguous prefixes only within the configured scope."""
    _component(operation_id, "operation_id")
    directory = _state_directory(state_dir)
    _session_directory(directory, session_id)
    with closing(get_db_connection(directory)) as conn:
        row = conn.execute(
            "SELECT * FROM operations WHERE operation_id = ? AND session_id = ? AND status = 'completed'",
            (operation_id, session_id),
        ).fetchone()
        if row is None:
            matches = conn.execute(
                "SELECT * FROM operations WHERE substr(operation_id, 1, ?) = ? "
                "AND session_id = ? AND status = 'completed' LIMIT 2", (len(operation_id), operation_id, session_id),
            ).fetchall()
            if len(matches) > 1:
                raise StorageError("ARTIFACT_REFERENCE_AMBIGUOUS", "Operation ID prefix matches more than one artifact in this scope")
            row = matches[0] if matches else None
    return _row_to_artifact(row, directory) if row else None


def _read_artifact_bytes(path: Path) -> bytes:
    if path.is_symlink():
        raise StorageError("ARTIFACT_FILE_UNAVAILABLE", "Saved artifact must not be a symlink")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
    with os.fdopen(os.open(path, flags), "rb") as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode):
            raise StorageError("ARTIFACT_FILE_UNAVAILABLE", "Saved artifact must be a regular file")
        if info.st_size > MAX_ARTIFACT_BYTES:
            raise StorageError("ARTIFACT_TOO_LARGE", "Saved artifact exceeds the storage size bound")
        content = stream.read(MAX_ARTIFACT_BYTES + 1)
    if len(content) > MAX_ARTIFACT_BYTES:
        raise StorageError("ARTIFACT_TOO_LARGE", "Saved artifact exceeds the storage size bound")
    return content


def _row_to_artifact(row: sqlite3.Row, directory: Path) -> dict[str, Any]:
    op_id = _component(row["operation_id"], "operation_id")
    session_dir = _session_directory(directory, row["session_id"])
    json_path, md_path = session_dir / f"{op_id}.json", session_dir / f"{op_id}.md"
    if Path(row["json_path"]) != json_path or Path(row["md_path"]) != md_path:
        raise StorageError("ARTIFACT_SCOPE_MISMATCH", "Indexed artifact paths are outside their expected scope")
    try:
        # References promise these exact bytes; never fall back to unchecked SQLite fields.
        content = _read_artifact_bytes(json_path)
        actual_sha = hashlib.sha256(content).hexdigest()
        if not hmac.compare_digest(actual_sha, row["sha256"]):
            raise StorageError("ARTIFACT_HASH_MISMATCH", "Saved bytes differ from their index; recreate or explicitly migrate the artifact")
        data = json.loads(content)
        if not isinstance(data, dict) or data.get("operationId") != op_id or data.get("sessionId") != row["session_id"] or data.get("tool") != row["tool"]:
            raise StorageError("ARTIFACT_SCOPE_MISMATCH", "Saved artifact identity differs from its index")
        if "sha256" in data or "reference" in data:
            raise StorageError("ARTIFACT_LEGACY_FORMAT", "Self-hashed legacy artifacts require explicit migration or recreation")
        md_bytes = _read_artifact_bytes(md_path)
        if md_bytes != data.get("markdown", "").encode("utf-8"):
            raise StorageError("ARTIFACT_HASH_MISMATCH", "Saved Markdown differs from the verified artifact")
    except StorageError:
        raise
    except OSError as exc:
        raise StorageError("ARTIFACT_FILE_UNAVAILABLE", "Saved artifact files are missing or unreadable") from exc
    except (ValueError, TypeError, AttributeError) as exc:
        raise StorageError("INVALID_ARTIFACT", "Saved artifact is not valid artifact JSON") from exc
    data["sha256"] = actual_sha
    data["reference"] = {"operationId": op_id, "sha256": actual_sha}
    return data


def resolve_references_with_fallback(tool_name: str, raw_input: dict[str, Any], session_id: str = "default",
                                     state_dir: Optional[Path] = None) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Fill omitted hashes/latest evidence in-scope, rejecting invalid explicit references."""
    _component(session_id, "session_id")
    input_dict = deepcopy(raw_input)
    references = input_dict.get("references")
    if references is None:
        references = []
    if not isinstance(references, list):
        raise StorageError("INVALID_ARTIFACT_REFERENCE", "references must be a list")
    resolved_artifacts: list[dict[str, Any]] = []

    def add_resolved(artifact: dict[str, Any]):
        if not any(a["operationId"] == artifact["operationId"] for a in resolved_artifacts):
            resolved_artifacts.append(artifact)

    def resolve(reference: Any):
        if not isinstance(reference, dict) or not reference.get("operationId"):
            raise StorageError("INVALID_ARTIFACT_REFERENCE", "Explicit references require an operationId")
        artifact = find_artifact_by_id(reference["operationId"], state_dir, session_id=session_id)
        if artifact is None:
            raise StorageError("ARTIFACT_REFERENCE_NOT_FOUND", "Reference does not exist in the configured scope")
        target = artifact["reference"]
        if "sha256" in reference and reference["sha256"] != target["sha256"]:
            raise StorageError("ARTIFACT_HASH_MISMATCH", "Supplied reference digest differs from the verified saved file")
        reference.update(target)
        add_resolved(artifact)

    for reference in references:
        resolve(reference)
    for key in ("analysisArtifact", "revisionOf", "documentReference"):
        if key in input_dict and input_dict[key] is not None:
            resolve(input_dict[key])
    compatible_tools = COMPATIBLE_PARENT_TOOLS.get(tool_name, [])
    if compatible_tools and not any(a["tool"] in compatible_tools for a in resolved_artifacts):
        latest = find_latest_artifact(compatible_tools, session_id=session_id, state_dir=state_dir)
        if latest:
            add_resolved(latest)
            fallback_ref = dict(latest["reference"])
            input_dict.setdefault("references", [])
            if input_dict["references"] is None:
                input_dict["references"] = []
            if not any(r["operationId"] == latest["operationId"] for r in input_dict["references"]):
                input_dict["references"].append(fallback_ref)
            if tool_name == "create_prd" and not input_dict.get("analysisArtifact") and latest["tool"] == "analyze_interviews":
                input_dict["analysisArtifact"] = dict(fallback_ref)
    return input_dict, resolved_artifacts
