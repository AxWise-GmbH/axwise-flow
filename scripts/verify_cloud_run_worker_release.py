#!/usr/bin/env python3
"""Fail closed unless Cloud Run routes only to the current worker revision.

The durable Orqaly worker runs a pull loop with instance-based CPU.  A tagged
old revision with revision-level minimum instances can therefore keep polling
even when the service's ordinary traffic is assigned 100% to a newer revision.
This verifier consumes the authoritative Cloud Run service/revision state and
accepts only one untagged, ready, 100%-serving latest revision and requires
every previous revision to be retired with zero desired replicas. Historical
revision minima are safe only after Cloud Run has completed that retirement.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import time
from collections.abc import Mapping, Sequence
from typing import Any


class WorkerReleaseStateError(ValueError):
    """Cloud Run worker state does not prove single-revision polling."""


def _mapping(value: Any, *, field: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise WorkerReleaseStateError(f"{field} must be an object")
    return value


def _revision_name(revision: Mapping[str, Any]) -> str:
    metadata = _mapping(revision.get("metadata"), field="revision.metadata")
    name = str(metadata.get("name") or "").strip()
    if not name:
        raise WorkerReleaseStateError("revision metadata.name is required")
    return name


def _nonnegative_integer(value: Any, *, field: str) -> int:
    if isinstance(value, bool):
        raise WorkerReleaseStateError(f"{field} must be a non-negative integer")
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise WorkerReleaseStateError(
            f"{field} must be a non-negative integer"
        ) from exc
    if parsed < 0 or str(value).strip() not in {str(parsed), f"{parsed}.0"}:
        raise WorkerReleaseStateError(f"{field} must be a non-negative integer")
    return parsed


def _service_minimum(service: Mapping[str, Any]) -> int:
    annotations = _mapping(
        _mapping(service.get("metadata"), field="service.metadata").get(
            "annotations", {}
        ),
        field="service.metadata.annotations",
    )
    value = annotations.get("run.googleapis.com/minScale")
    if value is None:
        scaling = service.get("scaling")
        if isinstance(scaling, Mapping):
            value = scaling.get("minInstanceCount")
    return _nonnegative_integer(
        0 if value is None else value,
        field="service minimum instances",
    )


def _revision_minimum(revision: Mapping[str, Any]) -> int:
    metadata = _mapping(revision.get("metadata"), field="revision.metadata")
    annotations = _mapping(
        metadata.get("annotations", {}),
        field="revision.metadata.annotations",
    )
    value = annotations.get("autoscaling.knative.dev/minScale")
    if value is None:
        scaling = revision.get("scaling")
        if isinstance(scaling, Mapping):
            value = scaling.get("minInstanceCount")
    return _nonnegative_integer(
        0 if value is None else value,
        field=f"revision {_revision_name(revision)} minimum instances",
    )


def _revision_status(revision: Mapping[str, Any]) -> Mapping[str, Any]:
    return _mapping(
        revision.get("status"),
        field=f"revision {_revision_name(revision)}.status",
    )


def _revision_condition(
    revision: Mapping[str, Any], condition_type: str
) -> Mapping[str, Any]:
    name = _revision_name(revision)
    conditions = _revision_status(revision).get("conditions")
    if not isinstance(conditions, list):
        raise WorkerReleaseStateError(
            f"revision {name}.status.conditions must be a list"
        )
    matches = [
        condition
        for condition in conditions
        if isinstance(condition, Mapping)
        and condition.get("type") == condition_type
    ]
    if len(matches) != 1:
        raise WorkerReleaseStateError(
            f"revision {name} must have exactly one {condition_type} condition"
        )
    return matches[0]


def _revision_desired_replicas(revision: Mapping[str, Any]) -> int:
    status = _revision_status(revision)
    return _nonnegative_integer(
        status.get("desiredReplicas", 0),
        field=f"revision {_revision_name(revision)} desired replicas",
    )


def _revision_env(revision: Mapping[str, Any]) -> dict[str, str]:
    name = _revision_name(revision)
    spec = _mapping(revision.get("spec"), field=f"revision {name}.spec")
    containers = spec.get("containers")
    if not isinstance(containers, list) or len(containers) != 1:
        raise WorkerReleaseStateError(
            f"revision {name} must have exactly one container"
        )
    container = _mapping(
        containers[0], field=f"revision {name}.spec.containers[0]"
    )
    rows = container.get("env")
    if not isinstance(rows, list):
        raise WorkerReleaseStateError(
            f"revision {name} container env must be a list"
        )
    values: dict[str, str] = {}
    for row in rows:
        if not isinstance(row, Mapping):
            raise WorkerReleaseStateError(
                f"revision {name} container env entries must be objects"
            )
        key = str(row.get("name") or "").strip()
        if not key:
            raise WorkerReleaseStateError(
                f"revision {name} container env name is required"
            )
        if key in values:
            raise WorkerReleaseStateError(
                f"revision {name} contains duplicate env {key}"
            )
        if "value" in row:
            values[key] = str(row.get("value") or "")
    return values


def _traffic(
    service: Mapping[str, Any],
    *,
    section: str,
) -> list[Mapping[str, Any]]:
    parent = _mapping(service.get(section), field=f"service.{section}")
    value = parent.get("traffic", [])
    if not isinstance(value, list):
        raise WorkerReleaseStateError(
            f"service.{section}.traffic must be a list"
        )
    if any(not isinstance(row, Mapping) for row in value):
        raise WorkerReleaseStateError(
            f"every service.{section}.traffic entry must be an object"
        )
    return value


def _assert_reconciled(service: Mapping[str, Any]) -> None:
    metadata = _mapping(service.get("metadata"), field="service.metadata")
    status = _mapping(service.get("status"), field="service.status")
    generation = _nonnegative_integer(
        metadata.get("generation"),
        field="service.metadata.generation",
    )
    observed_generation = _nonnegative_integer(
        status.get("observedGeneration"),
        field="service.status.observedGeneration",
    )
    if observed_generation != generation:
        raise WorkerReleaseStateError(
            "worker service update is not reconciled: "
            f"generation={generation} observedGeneration={observed_generation}"
        )
    conditions = status.get("conditions")
    if not isinstance(conditions, list):
        raise WorkerReleaseStateError("service.status.conditions must be a list")
    ready = [
        condition
        for condition in conditions
        if isinstance(condition, Mapping) and condition.get("type") == "Ready"
    ]
    if len(ready) != 1 or ready[0].get("status") != "True":
        raise WorkerReleaseStateError(
            "worker service must have exactly one Ready=True condition"
        )


def assert_no_traffic_tags(service: Mapping[str, Any]) -> None:
    _assert_reconciled(service)
    tags = sorted(
        f"{section}:{tag}"
        for section in ("spec", "status")
        for row in _traffic(service, section=section)
        if (tag := str(row.get("tag") or "").strip())
    )
    if tags:
        raise WorkerReleaseStateError(
            "worker traffic tags remain after cleanup: " + ", ".join(tags)
        )


def validate_worker_release_state(
    service: Mapping[str, Any],
    revisions: Sequence[Mapping[str, Any]],
    *,
    expected_revision: str,
    expected_mode: str,
    expected_build_revision: str,
    expected_lane: str | None = None,
) -> dict[str, Any]:
    """Validate that only the expected worker revision can remain polling."""

    expected = str(expected_revision or "").strip()
    if not expected:
        raise WorkerReleaseStateError("expected revision is required")
    mode = str(expected_mode or "").strip()
    if mode not in {"health_only", "poll"}:
        raise WorkerReleaseStateError(
            "expected worker mode must be health_only or poll"
        )
    build_revision = str(expected_build_revision or "").strip()
    if not build_revision:
        raise WorkerReleaseStateError("expected build revision is required")
    lane = str(expected_lane or "").strip()
    if lane and lane not in {"scope", "research"}:
        raise WorkerReleaseStateError(
            "expected worker lane must be scope or research"
        )
    status = _mapping(service.get("status"), field="service.status")
    latest_created = str(status.get("latestCreatedRevisionName") or "").strip()
    latest_ready = str(status.get("latestReadyRevisionName") or "").strip()
    if latest_created != expected or latest_ready != expected:
        raise WorkerReleaseStateError(
            "worker revision mismatch: "
            f"expected={expected} latestCreated={latest_created or 'unset'} "
            f"latestReady={latest_ready or 'unset'}"
        )

    assert_no_traffic_tags(service)
    traffic_percent = 100
    for section in ("spec", "status"):
        traffic = _traffic(service, section=section)
        if len(traffic) != 1:
            raise WorkerReleaseStateError(
                "worker must have exactly one untagged traffic assignment "
                f"in service.{section}"
            )
        if traffic[0].get("latestRevision") not in (None, False):
            raise WorkerReleaseStateError(
                f"worker service.{section} traffic must not float to latest"
            )
        traffic_revision = str(traffic[0].get("revisionName") or "").strip()
        traffic_percent = _nonnegative_integer(
            traffic[0].get("percent"),
            field=f"worker {section} traffic percent",
        )
        if traffic_revision != expected or traffic_percent != 100:
            raise WorkerReleaseStateError(
                f"worker {section} traffic mismatch: "
                f"expected={expected}@100 "
                f"actual={traffic_revision or 'unset'}@{traffic_percent}"
            )

    if _service_minimum(service) != 1:
        raise WorkerReleaseStateError(
            "worker must use service-level minimum instances set to 1"
        )
    if not isinstance(revisions, Sequence) or isinstance(
        revisions, (str, bytes, bytearray)
    ):
        raise WorkerReleaseStateError("revisions must be a list")
    revisions_by_name: dict[str, Mapping[str, Any]] = {}
    for revision in revisions:
        if not isinstance(revision, Mapping):
            raise WorkerReleaseStateError("every revision must be an object")
        name = _revision_name(revision)
        if name in revisions_by_name:
            raise WorkerReleaseStateError(f"duplicate revision state for {name}")
        revisions_by_name[name] = revision
    latest_revision = revisions_by_name.get(expected)
    if latest_revision is None:
        raise WorkerReleaseStateError(
            f"latest worker revision {expected} is absent from revision inventory"
        )
    if _revision_minimum(latest_revision) != 0:
        raise WorkerReleaseStateError(
            "latest worker revision must not retain revision-level minimum instances"
        )

    latest_env = _revision_env(latest_revision)
    if latest_env.get("WORKER_MODE") != mode:
        raise WorkerReleaseStateError(
            "latest worker revision mode mismatch: "
            f"expected={mode} actual={latest_env.get('WORKER_MODE') or 'unset'}"
        )
    if lane and latest_env.get("WORKER_LANE") != lane:
        raise WorkerReleaseStateError(
            "latest worker lane mismatch: "
            f"expected={lane} actual={latest_env.get('WORKER_LANE') or 'unset'}"
        )
    if latest_env.get("AXWISE_BUILD_REVISION") != build_revision:
        raise WorkerReleaseStateError(
            "latest worker build mismatch: "
            f"expected={build_revision} "
            f"actual={latest_env.get('AXWISE_BUILD_REVISION') or 'unset'}"
        )
    if _revision_desired_replicas(latest_revision) != 1:
        raise WorkerReleaseStateError(
            "latest worker revision must have exactly one desired replica"
        )
    latest_active = _revision_condition(latest_revision, "Active")
    if latest_active.get("status") != "True":
        raise WorkerReleaseStateError(
            "latest worker revision must have Active=True"
        )

    nonlatest = [
        revision
        for name, revision in revisions_by_name.items()
        if name != expected
    ]
    for revision in nonlatest:
        name = _revision_name(revision)
        desired = _revision_desired_replicas(revision)
        active = _revision_condition(revision, "Active")
        if desired != 0:
            raise WorkerReleaseStateError(
                f"nonlatest worker revision {name} still desires {desired} replicas"
            )
        if active.get("status") != "False" or active.get("reason") != "Retired":
            raise WorkerReleaseStateError(
                f"nonlatest worker revision {name} is not retired: "
                f"Active={active.get('status') or 'unset'} "
                f"reason={active.get('reason') or 'unset'}"
            )

    # Older revisions may retain immutable historical minScale annotations;
    # explicit retired/zero-replica assertions above prove they are dormant.
    dormant_revision_minima = sorted(
        name
        for name, revision in revisions_by_name.items()
        if name != expected and _revision_minimum(revision) > 0
    )
    return {
        "latest_revision": expected,
        "traffic_percent": traffic_percent,
        "traffic_tag_count": 0,
        "service_minimum_instances": 1,
        "latest_revision_minimum_instances": 0,
        "worker_mode": mode,
        "worker_lane": lane or None,
        "build_revision": build_revision,
        "active_revision_count": 1,
        "retired_nonlatest_revision_count": len(nonlatest),
        "dormant_nonlatest_revision_minima": dormant_revision_minima,
    }


def _gcloud_json(args: list[str]) -> Any:
    try:
        completed = subprocess.run(
            ["gcloud", *args, "--format=json"],
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise WorkerReleaseStateError(
            f"could not read Cloud Run worker state: {type(exc).__name__}"
        ) from exc
    try:
        return json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise WorkerReleaseStateError(
            "gcloud returned invalid JSON for Cloud Run worker state"
        ) from exc


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--service", required=True)
    parser.add_argument("--project", required=True)
    parser.add_argument("--region", required=True)
    parser.add_argument("--expected-revision")
    parser.add_argument("--expected-mode", choices=("health_only", "poll"))
    parser.add_argument("--expected-lane", choices=("scope", "research"))
    parser.add_argument("--expected-build-revision")
    parser.add_argument("--tags-only", action="store_true")
    parser.add_argument("--wait-seconds", type=int, default=120)
    args = parser.parse_args()
    if not 0 <= args.wait_seconds <= 300:
        parser.error("--wait-seconds must be between 0 and 300")
    if not args.tags_only and not all(
        (
            args.expected_revision,
            args.expected_mode,
            args.expected_lane,
            args.expected_build_revision,
        )
    ):
        parser.error(
            "--expected-revision, --expected-mode, --expected-lane, and "
            "--expected-build-revision are required unless --tags-only is used"
        )
    deadline = time.monotonic() + args.wait_seconds
    last_error: WorkerReleaseStateError | None = None
    summary: dict[str, Any] | None = None
    while True:
        try:
            service = _mapping(
                _gcloud_json(
                    [
                        "run",
                        "services",
                        "describe",
                        args.service,
                        "--project",
                        args.project,
                        "--region",
                        args.region,
                    ]
                ),
                field="service",
            )
            if args.tags_only:
                assert_no_traffic_tags(service)
                print("Worker traffic tags cleared in desired and observed state")
                return 0
            revisions = _gcloud_json(
                [
                    "run",
                    "revisions",
                    "list",
                    "--service",
                    args.service,
                    "--project",
                    args.project,
                    "--region",
                    args.region,
                ]
            )
            summary = validate_worker_release_state(
                service,
                revisions,
                expected_revision=args.expected_revision,
                expected_mode=args.expected_mode,
                expected_build_revision=args.expected_build_revision,
                expected_lane=args.expected_lane,
            )
            break
        except WorkerReleaseStateError as exc:
            last_error = exc
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                parser.exit(
                    1,
                    "Worker release state rejected after bounded reconciliation "
                    f"wait: {last_error}\n",
                )
            time.sleep(min(2.0, remaining))
    assert summary is not None
    print(json.dumps(summary, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
