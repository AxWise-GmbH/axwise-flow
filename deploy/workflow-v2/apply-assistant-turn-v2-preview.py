#!/usr/bin/env python3
"""Inspect or apply only SQL010 to the exact AxWise Preview 001 database.

The existing admin credential remains in process memory. No grants, login/role
changes, customer-row reads, GCP resource creation or runtime invocations occur.
Errors are deliberately reported as controlled stages, never raw DB/CLI output.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import tempfile
import time
from pathlib import Path
from typing import NamedTuple

import psycopg2

PROJECT = "axwise-v2-preview-001"
DATABASE = "axwise_v2_preview_001"
POSTGRES_ROLE = "postgres"
POSTGRES_MAJOR = 16
INSTANCE = f"{PROJECT}:europe-west4:orqaly-v2-preview-001-pg"
ROOT = Path(__file__).resolve().parents[2]
OPERATOR_PATH = "deploy/workflow-v2/apply-assistant-turn-v2-preview.py"
MIGRATION_PATH = "backend/database/workflow_v2/010_assistant_turn_v2.sql"
MIGRATION_HASH = "1e8372a997ce4e7aea0006b3d13d2c9bc7337c2ecab24b41e75c8cc9defe2742"
MARKER_PATH_KEY = "assistant_turn_v2_migration_path"
MARKER_HASH_KEY = "assistant_turn_v2_sha256"

MIGRATION_MARKERS = {
    "migration": (
        "001_cognitive_operations.sql",
        "ae8881b1e734e2fcd059895611d94b2127772131083c55299cf9c6be7657c7c8",
    ),
    "assistant": (
        "002_assistant_turn.sql",
        "4329c8188d9c62f745bdaaac9dcd0f9428f72a0217b6144a53900487188aa333",
    ),
    "runtime": (
        "003_assistant_runtime.sql",
        "803923e49e15bb8c24fdb3dc133e9a641a1c233caa1375058b2fa0f109f18307",
    ),
    "events": (
        "004_operation_events.sql",
        "1839f4f9b5b75ee7463284d8c776332ed01261e2a28df091a16ca6cb2570ac4d",
    ),
    "compile_scope_v3": (
        "005_compile_scope_v3.sql",
        "7415c5d6af607ef18c1addfac51b057d9d29f6501e255fd0a1cc8f11f77f9ae4",
    ),
    "prepare_solution": (
        "006_prepare_solution.sql",
        "e2573b95a5d00d0104a705c4531cf40945d66ebc23b2f8287cf0dc131d6687df",
    ),
    "native_solution": (
        "007_prepare_solution_v2.sql",
        "0f403f6bda956852f6c18a20d28782a974c294a0179b9099bbfd567f55dba7c9",
    ),
    "capability_analysis": (
        "008_capability_analysis.sql",
        "9e9c29216aaaab7553f3744ab1b448c6cba057994948089d676ebab875b8e7f1",
    ),
    "capability_simulation": (
        "009_capability_simulation.sql",
        "916e8ba2b85b9ec6b17962bf651ca903c862272031d84a1db50d0c98f82538b8",
    ),
}

BASE_TYPES = (
    "AssistantTurnV1",
    "CompileScopeV2",
    "CompileScopeV3",
    "ReviseScopeV2",
    "ExecuteResearchV2",
    "SynthesizeArtifactV1",
    "PrepareSolutionV1",
    "PrepareSolutionV2",
    "AdmitTranscriptCorpusV1",
    "AnalyzeEvidenceV1",
    "SimulateV1",
)
TARGET_TYPES = (BASE_TYPES[0], "AssistantTurnV2", *BASE_TYPES[1:])

BASE_MARKER_COLUMNS = (
    ("component", "text", "NO"),
    ("migration_number", "integer", "NO"),
    ("migration_path", "text", "NO"),
    ("sha256", "text", "NO"),
    ("bindings_path", "text", "NO"),
    ("bindings_sha256", "text", "NO"),
    ("source_commit", "text", "NO"),
    ("applied_at", "timestamp with time zone", "NO"),
    ("assistant_migration_path", "text", "NO"),
    ("assistant_sha256", "text", "NO"),
    ("runtime_migration_path", "text", "NO"),
    ("runtime_sha256", "text", "NO"),
    ("events_migration_path", "text", "NO"),
    ("events_sha256", "text", "NO"),
    ("compile_scope_v3_migration_path", "text", "NO"),
    ("compile_scope_v3_sha256", "text", "NO"),
    ("prepare_solution_migration_path", "text", "YES"),
    ("prepare_solution_sha256", "text", "YES"),
    ("native_solution_migration_path", "text", "YES"),
    ("native_solution_sha256", "text", "YES"),
    ("capability_analysis_migration_path", "text", "YES"),
    ("capability_analysis_sha256", "text", "YES"),
    ("capability_simulation_migration_path", "text", "YES"),
    ("capability_simulation_sha256", "text", "YES"),
)
TARGET_MARKER_COLUMNS = BASE_MARKER_COLUMNS + (
    (MARKER_PATH_KEY, "text", "YES"),
    (MARKER_HASH_KEY, "text", "YES"),
)
BASE_MARKER_FIELDS = frozenset(column[0] for column in BASE_MARKER_COLUMNS)
TARGET_MARKER_FIELDS = frozenset(column[0] for column in TARGET_MARKER_COLUMNS)


class Inspection(NamedTuple):
    applied: bool
    recorded_source_commit: str


def capture(*args: str) -> str:
    return subprocess.run(
        args, cwd=ROOT, check=True, capture_output=True, text=True, timeout=60
    ).stdout.strip()


def capture_bytes(*args: str) -> bytes:
    return subprocess.run(
        args, cwd=ROOT, check=True, capture_output=True, timeout=60
    ).stdout


def require(condition: bool) -> None:
    if not condition:
        raise RuntimeError("Preview migration precondition failed")


def _marker_key(prefix: str, kind: str) -> str:
    if prefix == "migration":
        return "migration_path" if kind == "path" else "sha256"
    return f"{prefix}_migration_path" if kind == "path" else f"{prefix}_sha256"


def assert_marker(marker: dict) -> bool:
    keys = frozenset(marker)
    require(keys in (BASE_MARKER_FIELDS, TARGET_MARKER_FIELDS))
    require(marker.get("component") == "axwise")
    require(marker.get("migration_number") == 1)
    require(bool(marker.get("applied_at")))
    require(
        re.fullmatch(r"[a-f0-9]{40}", str(marker.get("source_commit", "")))
        is not None
    )
    require(
        marker.get("bindings_path") == "deploy/workflow-v2/preview-role-bindings.sql"
    )
    require(
        marker.get("bindings_sha256")
        == "2b885c6089b0b3c45030fc2e88e950cb582ecd617d2af293066041f277f0f48b"
    )
    for prefix, (filename, checksum) in MIGRATION_MARKERS.items():
        require(
            marker.get(_marker_key(prefix, "path"))
            == "backend/database/workflow_v2/" + filename
        )
        require(marker.get(_marker_key(prefix, "hash")) == checksum)

    applied = keys == TARGET_MARKER_FIELDS
    if applied:
        require(marker.get(MARKER_PATH_KEY) == MIGRATION_PATH)
        require(marker.get(MARKER_HASH_KEY) == MIGRATION_HASH)
    return applied


def _constraint_definition(types: tuple[str, ...]) -> str:
    values = ",".join(f"'{value}'::text" for value in types)
    return f"CHECK((operation_type=ANY(ARRAY[{values}])))"


def inspect(cursor) -> Inspection:
    cursor.execute(
        "SELECT current_database(),current_user,session_user,current_setting('server_version_num')::integer"
    )
    identity = cursor.fetchone()
    require(identity[:3] == (DATABASE, POSTGRES_ROLE, POSTGRES_ROLE))
    require(identity[3] // 10000 == POSTGRES_MAJOR)

    cursor.execute(
        "SELECT column_name,data_type,is_nullable FROM information_schema.columns "
        "WHERE table_schema='workflow_v2_release' AND table_name='applied_baseline' "
        "ORDER BY ordinal_position"
    )
    marker_columns = tuple(cursor.fetchall())
    require(marker_columns in (BASE_MARKER_COLUMNS, TARGET_MARKER_COLUMNS))

    cursor.execute(
        "SELECT to_jsonb(marker) FROM workflow_v2_release.applied_baseline marker "
        "WHERE component='axwise' AND migration_number=1"
    )
    rows = cursor.fetchall()
    require(len(rows) == 1)
    marker = rows[0][0]
    marker_applied = assert_marker(marker)
    require(marker_applied == (marker_columns == TARGET_MARKER_COLUMNS))

    cursor.execute(
        "SELECT relrowsecurity,relforcerowsecurity FROM pg_class "
        "WHERE oid='axwise.cognitive_operations'::regclass"
    )
    require(cursor.fetchone() == (True, True))
    cursor.execute(
        "SELECT convalidated,connoinherit,pg_get_constraintdef(oid) FROM pg_constraint "
        "WHERE conrelid='axwise.cognitive_operations'::regclass "
        "AND conname='cognitive_operations_operation_type_check' AND contype='c' "
        "AND conkey=ARRAY[(SELECT attnum FROM pg_attribute "
        "WHERE attrelid='axwise.cognitive_operations'::regclass "
        "AND attname='operation_type' AND NOT attisdropped)]::smallint[]"
    )
    rows = cursor.fetchall()
    require(len(rows) == 1 and rows[0][:2] == (True, False))
    definition = re.sub(r"\s+", "", rows[0][2])
    expected = _constraint_definition(TARGET_TYPES if marker_applied else BASE_TYPES)
    require(definition == expected)
    return Inspection(marker_applied, marker["source_commit"])


def validate_source(*, require_clean: bool) -> tuple[str, str]:
    migration_bytes = (ROOT / MIGRATION_PATH).read_bytes()
    require(hashlib.sha256(migration_bytes).hexdigest() == MIGRATION_HASH)
    lines = migration_bytes.decode("utf-8").splitlines()
    require(lines[0] == "BEGIN;" and lines[-1] == "COMMIT;")

    commit = capture("git", "rev-parse", "--verify", "HEAD^{commit}")
    require(re.fullmatch(r"[a-f0-9]{40}", commit) is not None)
    require(capture_bytes("git", "show", f"{commit}:{MIGRATION_PATH}") == migration_bytes)
    if require_clean:
        require(
            capture("git", "status", "--porcelain=v1", "--untracked-files=all") == ""
        )
        require(
            capture_bytes("git", "show", f"{commit}:{OPERATOR_PATH}")
            == (ROOT / OPERATOR_PATH).read_bytes()
        )
    return commit, "\n".join(lines[1:-1])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--admin-secret-version", required=True)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply the exact additive migration; otherwise read-only inspection",
    )
    args = parser.parse_args()
    if not re.fullmatch(r"[1-9][0-9]*", args.admin_secret_version):
        parser.error("A pinned positive numeric secret version is required")

    connection = None
    proxy = None
    proxy_socket_root = None
    stage = "source_validation"
    try:
        commit, sql_body = validate_source(require_clean=args.apply)
        require(capture("gcloud", "config", "get-value", "project") == PROJECT)

        stage = "existing_admin_credential"
        password = capture(
            "gcloud",
            "secrets",
            "versions",
            "access",
            args.admin_secret_version,
            "--secret=orqaly-v2-preview-001-db-admin-password",
            f"--project={PROJECT}",
        )
        require(bool(password))
        stage = "owned_proxy_connect"
        proxy_socket_root = tempfile.TemporaryDirectory(prefix="axw-", dir="/tmp")
        proxy_host = Path(proxy_socket_root.name) / INSTANCE
        proxy_socket = proxy_host / ".s.PGSQL.5432"
        proxy = subprocess.Popen(
            [
                "cloud-sql-proxy",
                "--gcloud-auth",
                "--unix-socket",
                proxy_socket_root.name,
                "--max-connections=1",
                INSTANCE,
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        for _ in range(40):
            require(proxy.poll() is None)
            if not proxy_socket.exists():
                time.sleep(0.5)
                continue
            try:
                connection = psycopg2.connect(
                    host=str(proxy_host),
                    port=5432,
                    dbname=DATABASE,
                    user=POSTGRES_ROLE,
                    password=password,
                    connect_timeout=1,
                )
                break
            except psycopg2.OperationalError:
                time.sleep(0.5)
        password = None
        require(connection is not None)

        stage = "exact_marked_schema_check"
        connection.set_session(readonly=not args.apply)
        with connection, connection.cursor() as cursor:
            cursor.execute("SET LOCAL lock_timeout='5s'")
            cursor.execute("SET LOCAL statement_timeout='30s'")
            cursor.execute("SET LOCAL idle_in_transaction_session_timeout='30s'")
            if args.apply:
                cursor.execute(
                    "SELECT pg_advisory_xact_lock(hashtext('axwise.assistant_turn_v2'))"
                )
            before = inspect(cursor)
            after = before
            if args.apply and not before.applied:
                stage = "apply_exact_sql010"
                cursor.execute(sql_body)
                cursor.execute(
                    "ALTER TABLE workflow_v2_release.applied_baseline "
                    f"ADD COLUMN {MARKER_PATH_KEY} text, "
                    f"ADD COLUMN {MARKER_HASH_KEY} text"
                )
                cursor.execute(
                    "UPDATE workflow_v2_release.applied_baseline "
                    f"SET {MARKER_PATH_KEY}=%s,{MARKER_HASH_KEY}=%s,source_commit=%s "
                    "WHERE component='axwise' AND migration_number=1",
                    (MIGRATION_PATH, MIGRATION_HASH, commit),
                )
                require(cursor.rowcount == 1)
                stage = "verify_exact_sql010"
                after = inspect(cursor)
                require(after.applied and after.recorded_source_commit == commit)

        print(
            json.dumps(
                {
                    "status": (
                        "already_applied"
                        if before.applied
                        else "applied" if args.apply else "ready_to_apply"
                    ),
                    "project": PROJECT,
                    "database": DATABASE,
                    "postgresRole": POSTGRES_ROLE,
                    "migrationHash": MIGRATION_HASH,
                    "sourceCommit": commit,
                    "recordedSourceCommit": after.recorded_source_commit,
                    "rlsPreserved": True,
                    "roleGrants": 0,
                }
            )
        )
        return 0
    except Exception:
        print(
            json.dumps(
                {
                    "status": "failed",
                    "stage": stage,
                    "message": "No credentials or raw database/CLI output logged.",
                }
            )
        )
        return 1
    finally:
        if connection is not None:
            connection.close()
        if proxy is not None:
            proxy.terminate()
            try:
                proxy.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proxy.kill()
                proxy.wait(timeout=5)
        if proxy_socket_root is not None:
            proxy_socket_root.cleanup()


if __name__ == "__main__":
    raise SystemExit(main())
