#!/usr/bin/env python3
"""Apply only SQL006 to the exact marked AxWise Preview 001 database.

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
import time
from pathlib import Path

import psycopg2

PROJECT = "axwise-v2-preview-001"
DATABASE = "axwise_v2_preview_001"
INSTANCE = f"{PROJECT}:europe-west4:orqaly-v2-preview-001-pg"
PORT = 19506
ROOT = Path(__file__).resolve().parents[2]
MIGRATION_PATH = "backend/database/workflow_v2/006_prepare_solution.sql"
MIGRATION_HASH = "e2573b95a5d00d0104a705c4531cf40945d66ebc23b2f8287cf0dc131d6687df"
BASE_TYPES = {
    "AssistantTurnV1",
    "CompileScopeV2",
    "CompileScopeV3",
    "ReviseScopeV2",
    "ExecuteResearchV2",
    "SynthesizeArtifactV1",
}
BASE_MARKERS = {
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
}


def capture(*args: str) -> str:
    return subprocess.run(
        args, cwd=ROOT, check=True, capture_output=True, text=True, timeout=60
    ).stdout.strip()


def require(condition: bool) -> None:
    if not condition:
        raise RuntimeError("Preview migration precondition failed")


def assert_marker(marker: dict) -> None:
    for key, (filename, checksum) in BASE_MARKERS.items():
        path_key = "migration_path" if key == "migration" else f"{key}_migration_path"
        hash_key = "sha256" if key == "migration" else f"{key}_sha256"
        require(marker.get(path_key) == "backend/database/workflow_v2/" + filename)
        require(marker.get(hash_key) == checksum)
    require(
        marker.get("bindings_path") == "deploy/workflow-v2/preview-role-bindings.sql"
    )
    require(
        marker.get("bindings_sha256")
        == "2b885c6089b0b3c45030fc2e88e950cb582ecd617d2af293066041f277f0f48b"
    )


def inspect(cursor) -> bool:
    cursor.execute("SELECT current_database()")
    require(cursor.fetchone()[0] == DATABASE)
    cursor.execute(
        "SELECT to_jsonb(marker) FROM workflow_v2_release.applied_baseline marker WHERE component='axwise' AND migration_number=1"
    )
    rows = cursor.fetchall()
    require(len(rows) == 1)
    marker = rows[0][0]
    assert_marker(marker)
    cursor.execute(
        "SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='axwise.cognitive_operations'::regclass"
    )
    require(cursor.fetchone() == (True, True))
    cursor.execute(
        "SELECT convalidated,pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='axwise.cognitive_operations'::regclass AND conname='cognitive_operations_operation_type_check' AND contype='c'"
    )
    rows = cursor.fetchall()
    require(len(rows) == 1 and rows[0][0] is True)
    allowed = set(re.findall(r"'([^']+)'::text", rows[0][1]))
    require(allowed in (BASE_TYPES, BASE_TYPES | {"PrepareSolutionV1"}))
    applied = "PrepareSolutionV1" in allowed
    if applied:
        require(marker.get("prepare_solution_migration_path") == MIGRATION_PATH)
        require(marker.get("prepare_solution_sha256") == MIGRATION_HASH)
    else:
        require(marker.get("prepare_solution_migration_path") is None)
        require(marker.get("prepare_solution_sha256") is None)
    return applied


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
    stage = "source_validation"
    try:
        sql = (ROOT / MIGRATION_PATH).read_text()
        require(hashlib.sha256(sql.encode()).hexdigest() == MIGRATION_HASH)
        commit = capture("git", "rev-parse", "HEAD")
        require(re.fullmatch(r"[a-f0-9]{40}", commit) is not None)
        if args.apply:
            require(
                capture("git", "status", "--porcelain=v1", "--untracked-files=all")
                == ""
            )
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
        proxy = subprocess.Popen(
            [
                "cloud-sql-proxy",
                INSTANCE,
                "--gcloud-auth",
                "--address=127.0.0.1",
                f"--port={PORT}",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        for _ in range(40):
            require(proxy.poll() is None)
            try:
                connection = psycopg2.connect(
                    host="127.0.0.1",
                    port=PORT,
                    dbname=DATABASE,
                    user="postgres",
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
            if args.apply:
                cursor.execute(
                    "SELECT pg_advisory_xact_lock(hashtext('axwise.prepare_solution_v1'))"
                )
            already_applied = inspect(cursor)
            if args.apply and not already_applied:
                stage = "apply_exact_sql006"
                # Keep constraint and marker atomic; SQL006's standalone BEGIN/
                # COMMIT are replaced by this owned, bounded transaction.
                lines = sql.splitlines()
                require(lines[0] == "BEGIN;" and lines[-1] == "COMMIT;")
                cursor.execute("\n".join(lines[1:-1]))
                cursor.execute(
                    "ALTER TABLE workflow_v2_release.applied_baseline ADD COLUMN prepare_solution_migration_path text, ADD COLUMN prepare_solution_sha256 text"
                )
                cursor.execute(
                    "UPDATE workflow_v2_release.applied_baseline SET prepare_solution_migration_path=%s,prepare_solution_sha256=%s,source_commit=%s WHERE component='axwise' AND migration_number=1",
                    (MIGRATION_PATH, MIGRATION_HASH, commit),
                )
                require(cursor.rowcount == 1)
                stage = "verify_exact_sql006"
                require(inspect(cursor) is True)
        print(
            json.dumps(
                {
                    "status": (
                        "already_applied"
                        if already_applied
                        else "applied" if args.apply else "ready_to_apply"
                    ),
                    "database": DATABASE,
                    "migrationHash": MIGRATION_HASH,
                    "sourceCommit": commit,
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


if __name__ == "__main__":
    raise SystemExit(main())
