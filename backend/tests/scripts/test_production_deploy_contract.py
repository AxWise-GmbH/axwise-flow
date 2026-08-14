"""Deployment contract for grounded Orqaly research in Cloud Run."""

import os
from pathlib import Path
import subprocess

import pytest

from scripts.verify_cloud_run_worker_release import (
    WorkerReleaseStateError,
    assert_no_traffic_tags,
    validate_worker_release_state,
)


ROOT = Path(__file__).resolve().parents[3]
DEPLOY_SCRIPT = ROOT / "scripts" / "deploy-production-backend.sh"
SEARXNG_DEPLOY_SCRIPT = ROOT / "scripts" / "deploy-searxng-cloud-run.sh"
pytestmark = pytest.mark.contract
TEST_BUILD_REVISION = "abcdef123456"


def test_production_backend_deploy_script_is_valid_bash() -> None:
    subprocess.run(["bash", "-n", str(DEPLOY_SCRIPT)], check=True)
    subprocess.run(["bash", "-n", str(SEARXNG_DEPLOY_SCRIPT)], check=True)


def test_grounded_worker_uses_secret_manager_and_pinned_gemini_configuration() -> None:
    script = DEPLOY_SCRIPT.read_text(encoding="utf-8")

    assert 'GEMINI_MODEL="${GEMINI_MODEL:-models/gemini-3.7-flash}"' in script
    assert "GEMINI_SEARCH_MODEL=${GEMINI_MODEL}" in script
    assert "GEMINI_TEXT_MODEL=${GEMINI_MODEL}" in script
    assert "STAKEHOLDER_GEMINI_MODEL=${GEMINI_MODEL}" in script
    assert 'OPENREGISTER_SECRET="${OPENREGISTER_SECRET:-OPENREGISTER_API_KEY}"' in script
    assert "OPENREGISTER_API_KEY=${OPENREGISTER_SECRET}:latest" in script
    assert '--set-secrets "${WORKER_SECRET_BINDINGS}"' in script
    assert "GEMINI_API_KEY=GEMINI_API_KEY:latest" in script
    assert "GEMINI_MODEL=${GEMINI_MODEL}" in script
    assert 'AXWISE_MARKET_CELL_CONCURRENCY="${AXWISE_MARKET_CELL_CONCURRENCY:-6}"' in script
    assert 'AXWISE_PERSONA_CONCURRENCY="${AXWISE_PERSONA_CONCURRENCY:-5}"' in script
    assert "AXWISE_MARKET_CELL_CONCURRENCY=${AXWISE_MARKET_CELL_CONCURRENCY}" in script
    assert "AXWISE_PERSONA_CONCURRENCY=${AXWISE_PERSONA_CONCURRENCY}" in script
    assert "Research concurrency values must be integers from 1 to 8" in script


def test_physical_projection_rollout_flag_is_closed_and_revision_consistent() -> None:
    script = DEPLOY_SCRIPT.read_text(encoding="utf-8")
    example = (ROOT / ".env.example").read_text(encoding="utf-8")
    variable = "AXWISE_BUSINESS_EVIDENCE_PROJECTION_MODELS"

    assert f'{variable}="${{{variable}:-}}"' in script
    assert (
        f'[[ -n "${{{variable}}}" && "${{{variable}}}" '
        '!= "physical_product" ]]' in script
    )
    assert f"{variable}=\n" in example
    assert script.count(f"{variable}=${{{variable}}}") == 3

    quiescence = script.split(
        'echo "Stopping durable Orqaly queue consumption', 1
    )[1].split("QUIESCENCE_REVISION=", 1)[0]
    api = script.split('gcloud run deploy "${API_SERVICE}"', 1)[1].split(
        "# Cloud Run preserves", 1
    )[0]
    poll = script.split(
        'echo "Deploying durable Orqaly A+B worker', 1
    )[1].split("# As with the API", 1)[0]
    for deploy_block in (quiescence, api):
        assert variable in deploy_block
    assert "WORKER_ENV_VARS" in poll
    assert f"@{variable}=${{{variable}}}" in script.split(
        'WORKER_ENV_VARS="', 1
    )[1].split('"', 1)[0]


def test_production_deploy_requires_and_verifies_clerk_and_postgres(
    tmp_path: Path,
) -> None:
    script = DEPLOY_SCRIPT.read_text(encoding="utf-8")
    variable = "ENABLE_CLERK_VALIDATION"

    assert f'{variable}="${{{variable}:-true}}"' in script
    assert f'[[ "${{{variable}}}" != "true" ]]' in script
    assert "Production deployment requires ENABLE_CLERK_VALIDATION=true" in script
    assert script.index(f'[[ "${{{variable}}}" != "true" ]]') < script.index(
        "required_secrets=("
    )

    api_deploy = script.split('gcloud run deploy "${API_SERVICE}"', 1)[1].split(
        "# Cloud Run preserves", 1
    )[0]
    assert f"@{variable}=${{{variable}}}@" in api_deploy
    assert 'f"{base_url}/api/health"' in script
    assert 'environment.get("DATABASE_URL_TYPE") != "postgresql"' in script
    assert 'environment.get("ENABLE_CLERK_VALIDATION")' in script
    assert "backend detailed health did not confirm PostgreSQL" in script
    assert "backend detailed health did not confirm Clerk validation" in script

    environment = os.environ.copy()
    environment.update(
        {
            "ENABLE_CLERK_VALIDATION": "false",
            "REVISION": TEST_BUILD_REVISION,
        }
    )
    result = subprocess.run(
        ["bash", str(DEPLOY_SCRIPT)],
        cwd=tmp_path,
        env=environment,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    assert result.returncode != 0
    assert "Production deployment requires ENABLE_CLERK_VALIDATION=true" in result.stderr


def test_worker_deploy_routes_and_verifies_the_new_revision() -> None:
    script = DEPLOY_SCRIPT.read_text(encoding="utf-8")

    worker_revision = (
        'WORKER_REVISION="$(gcloud run services describe "${WORKER_SERVICE}"'
    )
    worker_traffic_switch = (
        'gcloud run services update-traffic "${WORKER_SERVICE}"'
    )
    worker_traffic_revision = "WORKER_TRAFFIC_REVISION="
    worker_traffic_percent = "WORKER_TRAFFIC_PERCENT="
    worker_cpu_throttling = "WORKER_CPU_THROTTLING="

    assert worker_revision in script
    assert '--to-revisions "${WORKER_REVISION}=100"' in script
    assert worker_traffic_switch in script
    assert "status.latestReadyRevisionName" in script
    assert "${WORKER_READY_REVISION}" in script
    assert "${WORKER_REVISION}" in script
    assert worker_traffic_revision in script
    assert worker_traffic_percent in script
    assert worker_cpu_throttling in script
    assert "status.traffic[0].revisionName" in script
    assert "status.traffic[0].percent" in script
    assert '"${WORKER_TRAFFIC_PERCENT}" != "100"' in script
    assert "run.googleapis.com/cpu-throttling" in script
    assert '"${WORKER_CPU_THROTTLING}" != "false"' in script
    assert script.count("--clear-tags") == 3
    assert script.count("verify_cloud_run_worker_release.py") == 3
    assert '--expected-revision "${WORKER_REVISION}"' in script
    assert '--expected-revision "${QUIESCENCE_REVISION}"' in script
    assert "--expected-mode health_only" in script
    assert "--expected-mode poll" in script
    assert script.count('--expected-build-revision "${REVISION}"') == 2
    assert '--tags-only' in script
    assert '"${WORKER_STABLE_URL_AFTER}" != "${WORKER_STABLE_URL}"' in script

    deploy = 'gcloud run deploy "${WORKER_SERVICE}"'
    assert script.count(deploy) == 2
    quiescence_deploy = script.index(
        deploy, script.index('echo "Stopping durable Orqaly queue consumption')
    )
    poll_deploy = script.index(
        deploy, script.index('echo "Deploying durable Orqaly A+B worker')
    )
    quiescence_deploy_block = script[quiescence_deploy:script.index(
        "QUIESCENCE_REVISION=", quiescence_deploy
    )]
    poll_deploy_block = script[poll_deploy:script.index(
        "# As with the API", poll_deploy
    )]
    for worker_deploy_block in (quiescence_deploy_block, poll_deploy_block):
        assert "--no-cpu-throttling" in worker_deploy_block
        assert "--scaling auto" in worker_deploy_block
        assert "--min 1" in worker_deploy_block
        assert "--min-instances default" in worker_deploy_block
        assert "--min-instances 1" not in worker_deploy_block
    assert '--revision-suffix "${QUIESCENCE_SUFFIX}"' in quiescence_deploy_block
    assert (
        '--set-env-vars "^@^WORKER_MODE=health_only@'
        'AXWISE_BUSINESS_EVIDENCE_PROJECTION_MODELS='
        '${AXWISE_BUSINESS_EVIDENCE_PROJECTION_MODELS}@'
        'AXWISE_BUILD_REVISION=${REVISION}"' in quiescence_deploy_block
    )
    assert "WORKER_ENV_VARS" not in quiescence_deploy_block
    assert "DATABASE_URL" not in quiescence_deploy_block
    assert "GEMINI" not in quiescence_deploy_block
    assert "--set-secrets" not in quiescence_deploy_block
    assert "--clear-secrets" in quiescence_deploy_block
    assert '--revision-suffix "${REVISION}"' in poll_deploy_block
    assert (
        '--set-env-vars "${WORKER_ENV_VARS}@WORKER_MODE=poll"'
        in poll_deploy_block
    )
    assert '--set-secrets "${WORKER_SECRET_BINDINGS}"' in poll_deploy_block
    api_deploy_block = script.split('gcloud run deploy "${API_SERVICE}"', 1)[1].split(
        "# Cloud Run preserves", 1
    )[0]
    assert "--no-cpu-throttling" not in api_deploy_block
    switch_marker = script.index('echo "Switching worker traffic')
    switch = script.index(worker_traffic_switch, switch_marker)
    predeploy_tag_clear = script.index("Clearing stale worker revision tags")
    tags_only_guard = script.index("--tags-only")
    quiescence_guard = script.index(
        '--expected-revision "${QUIESCENCE_REVISION}"'
    )
    final_state_guard = script.index('--expected-revision "${WORKER_REVISION}"')
    build = script.index('echo "Building ${IMAGE}"')
    migration_deploy = script.index('echo "Deploying migration job"')
    migration_execute = script.index('echo "Running migration job"')
    api_deploy = script.index('gcloud run deploy "${API_SERVICE}"')
    assert predeploy_tag_clear < tags_only_guard < quiescence_deploy
    assert tags_only_guard < build < quiescence_deploy < quiescence_guard
    assert quiescence_guard < migration_deploy < migration_execute < api_deploy
    assert api_deploy < poll_deploy
    assert poll_deploy < script.index(worker_revision) < switch
    expected_worker_revision = (
        'EXPECTED_WORKER_REVISION="${WORKER_SERVICE}-${REVISION}"'
    )
    assert expected_worker_revision in script
    assert script.index(expected_worker_revision) < poll_deploy
    assert '"${WORKER_REVISION}" != "${EXPECTED_WORKER_REVISION}"' in script
    assert switch < script.index(worker_traffic_revision)
    assert script.index(worker_traffic_revision) < script.index(worker_cpu_throttling)
    assert script.index(worker_cpu_throttling) < final_state_guard


def _worker_service_state(
    *,
    latest_created: str = "axwise-orqaly-worker-00030-new",
    latest_ready: str = "axwise-orqaly-worker-00030-new",
    traffic: list[dict] | None = None,
    spec_traffic: list[dict] | None = None,
    status_traffic: list[dict] | None = None,
    service_minimum: str | None = "1",
    generation: int = 30,
    observed_generation: int = 30,
    ready_status: str | None = "True",
) -> dict:
    common_traffic = (
        traffic
        if traffic is not None
        else [{"revisionName": latest_created, "percent": 100}]
    )
    annotations = {}
    if service_minimum is not None:
        annotations["run.googleapis.com/minScale"] = service_minimum
    conditions = []
    if ready_status is not None:
        conditions.append({"type": "Ready", "status": ready_status})
    return {
        "metadata": {
            "annotations": annotations,
            "generation": generation,
        },
        "spec": {
            "traffic": spec_traffic if spec_traffic is not None else common_traffic
        },
        "status": {
            "latestCreatedRevisionName": latest_created,
            "latestReadyRevisionName": latest_ready,
            "observedGeneration": observed_generation,
            "conditions": conditions,
            "traffic": (
                status_traffic if status_traffic is not None else common_traffic
            ),
            "url": "https://axwise-orqaly-worker-stable.example.run.app",
        },
    }


def _worker_revision_state(
    name: str,
    *,
    revision_minimum: str | None = None,
    retired: bool = False,
    desired_replicas: int | None = None,
    mode: str = "poll",
    build_revision: str = TEST_BUILD_REVISION,
) -> dict:
    annotations = {}
    if revision_minimum is not None:
        annotations["autoscaling.knative.dev/minScale"] = revision_minimum
    desired = (0 if retired else 1) if desired_replicas is None else desired_replicas
    return {
        "metadata": {"name": name, "annotations": annotations},
        "spec": {
            "containers": [
                {
                    "env": [
                        {"name": "WORKER_MODE", "value": mode},
                        {
                            "name": "AXWISE_BUILD_REVISION",
                            "value": build_revision,
                        },
                    ]
                }
            ]
        },
        "status": {
            "desiredReplicas": desired,
            "conditions": [
                {
                    "type": "Active",
                    "status": "False" if retired else "True",
                    **({"reason": "Retired"} if retired else {}),
                }
            ],
        },
    }


def test_worker_release_state_accepts_only_latest_untagged_100_percent_route() -> None:
    latest = "axwise-orqaly-worker-00030-new"
    summary = validate_worker_release_state(
        _worker_service_state(),
        [
            _worker_revision_state(latest),
            # Historical revision minima are immutable but cannot start when
            # no traffic split or tag references the old revision.
            _worker_revision_state(
                "axwise-orqaly-worker-00029-old",
                revision_minimum="1",
                retired=True,
            ),
        ],
        expected_revision=latest,
        expected_mode="poll",
        expected_build_revision=TEST_BUILD_REVISION,
    )

    assert summary["latest_revision"] == latest
    assert summary["traffic_percent"] == 100
    assert summary["traffic_tag_count"] == 0
    assert summary["service_minimum_instances"] == 1
    assert summary["latest_revision_minimum_instances"] == 0
    assert summary["dormant_nonlatest_revision_minima"] == [
        "axwise-orqaly-worker-00029-old"
    ]


def test_worker_release_state_rejects_tagged_zero_traffic_minimum_revision() -> None:
    latest = "axwise-orqaly-worker-00030-new"
    service = _worker_service_state(
        traffic=[
            {"revisionName": latest, "percent": 100},
            {
                "revisionName": "axwise-orqaly-worker-00029-del",
                "percent": 0,
                "tag": "searx-fix",
            },
        ]
    )
    revisions = [
        _worker_revision_state(latest),
        _worker_revision_state(
            "axwise-orqaly-worker-00029-del",
            revision_minimum="1",
            retired=True,
        ),
    ]

    with pytest.raises(WorkerReleaseStateError, match="searx-fix"):
        validate_worker_release_state(
            service,
            revisions,
            expected_revision=latest,
            expected_mode="poll",
            expected_build_revision=TEST_BUILD_REVISION,
        )
    with pytest.raises(WorkerReleaseStateError, match="searx-fix"):
        assert_no_traffic_tags(service)


@pytest.mark.parametrize("tag_section", ["spec", "status"])
def test_worker_release_state_rejects_a_tag_in_either_traffic_view(
    tag_section: str,
) -> None:
    latest = "axwise-orqaly-worker-00030-new"
    clean = [{"revisionName": latest, "percent": 100}]
    tagged = [
        {"revisionName": latest, "percent": 100},
        {
            "revisionName": "axwise-orqaly-worker-00029-del",
            "percent": 0,
            "tag": "searx-fix",
        },
    ]
    service = _worker_service_state(
        spec_traffic=tagged if tag_section == "spec" else clean,
        status_traffic=tagged if tag_section == "status" else clean,
    )

    with pytest.raises(WorkerReleaseStateError, match=f"{tag_section}:searx-fix"):
        validate_worker_release_state(
            service,
            [
                _worker_revision_state(latest),
                _worker_revision_state(
                    "axwise-orqaly-worker-00029-del", retired=True
                ),
            ],
            expected_revision=latest,
            expected_mode="poll",
            expected_build_revision=TEST_BUILD_REVISION,
        )


@pytest.mark.parametrize(
    ("service", "revisions", "reason"),
    [
        (
            _worker_service_state(
                latest_ready="axwise-orqaly-worker-00029-old"
            ),
            [_worker_revision_state("axwise-orqaly-worker-00030-new")],
            "latestReady",
        ),
        (
            _worker_service_state(
                traffic=[
                    {
                        "revisionName": "axwise-orqaly-worker-00030-new",
                        "percent": 99,
                    },
                    {
                        "revisionName": "axwise-orqaly-worker-00029-old",
                        "percent": 1,
                    },
                ]
            ),
            [
                _worker_revision_state("axwise-orqaly-worker-00030-new"),
                _worker_revision_state(
                    "axwise-orqaly-worker-00029-old", retired=True
                ),
            ],
            "exactly one",
        ),
        (
            _worker_service_state(service_minimum="0"),
            [_worker_revision_state("axwise-orqaly-worker-00030-new")],
            "service-level minimum",
        ),
        (
            _worker_service_state(service_minimum=None),
            [_worker_revision_state("axwise-orqaly-worker-00030-new")],
            "service-level minimum",
        ),
        (
            _worker_service_state(),
            [
                _worker_revision_state(
                    "axwise-orqaly-worker-00030-new",
                    revision_minimum="1",
                )
            ],
            "must not retain revision-level minimum",
        ),
        (
            _worker_service_state(observed_generation=29),
            [_worker_revision_state("axwise-orqaly-worker-00030-new")],
            "not reconciled",
        ),
        (
            _worker_service_state(ready_status="False"),
            [_worker_revision_state("axwise-orqaly-worker-00030-new")],
            "Ready=True",
        ),
        (
            _worker_service_state(
                spec_traffic=[
                    {
                        "latestRevision": True,
                        "revisionName": "axwise-orqaly-worker-00030-new",
                        "percent": 100,
                    }
                ]
            ),
            [_worker_revision_state("axwise-orqaly-worker-00030-new")],
            "must not float to latest",
        ),
        (
            _worker_service_state(),
            [],
            "absent from revision inventory",
        ),
    ],
)
def test_worker_release_state_fails_closed_on_ambiguous_polling_state(
    service: dict,
    revisions: list[dict],
    reason: str,
) -> None:
    with pytest.raises(WorkerReleaseStateError, match=reason):
        validate_worker_release_state(
            service,
            revisions,
            expected_revision="axwise-orqaly-worker-00030-new",
            expected_mode="poll",
            expected_build_revision=TEST_BUILD_REVISION,
        )


def test_worker_release_state_accepts_quiescence_only_after_old_poller_retires() -> None:
    quiescence = "axwise-orqaly-worker-00030-quiesce"
    summary = validate_worker_release_state(
        _worker_service_state(
            latest_created=quiescence,
            latest_ready=quiescence,
        ),
        [
            _worker_revision_state(quiescence, mode="health_only"),
            _worker_revision_state(
                "axwise-orqaly-worker-00029-old",
                revision_minimum="1",
                retired=True,
            ),
        ],
        expected_revision=quiescence,
        expected_mode="health_only",
        expected_build_revision=TEST_BUILD_REVISION,
    )

    assert summary["worker_mode"] == "health_only"
    assert summary["active_revision_count"] == 1
    assert summary["retired_nonlatest_revision_count"] == 1


@pytest.mark.parametrize(
    ("old_revision", "reason"),
    [
        (
            _worker_revision_state(
                "axwise-orqaly-worker-00029-old",
                desired_replicas=1,
            ),
            "still desires 1 replicas",
        ),
        (
            _worker_revision_state(
                "axwise-orqaly-worker-00029-old",
                desired_replicas=0,
            ),
            "is not retired",
        ),
    ],
)
def test_worker_release_state_rejects_nonlatest_runtime_that_can_still_poll(
    old_revision: dict,
    reason: str,
) -> None:
    latest = "axwise-orqaly-worker-00030-new"
    with pytest.raises(WorkerReleaseStateError, match=reason):
        validate_worker_release_state(
            _worker_service_state(),
            [_worker_revision_state(latest), old_revision],
            expected_revision=latest,
            expected_mode="poll",
            expected_build_revision=TEST_BUILD_REVISION,
        )


@pytest.mark.parametrize(
    ("revision", "reason"),
    [
        (
            _worker_revision_state(
                "axwise-orqaly-worker-00030-new", mode="health_only"
            ),
            "mode mismatch",
        ),
        (
            _worker_revision_state(
                "axwise-orqaly-worker-00030-new",
                build_revision="wrongbuild1",
            ),
            "build mismatch",
        ),
    ],
)
def test_worker_release_state_rejects_wrong_mode_or_build(
    revision: dict,
    reason: str,
) -> None:
    with pytest.raises(WorkerReleaseStateError, match=reason):
        validate_worker_release_state(
            _worker_service_state(),
            [revision],
            expected_revision="axwise-orqaly-worker-00030-new",
            expected_mode="poll",
            expected_build_revision=TEST_BUILD_REVISION,
        )


def test_authority_proof_secret_is_validated_without_printing_before_build() -> None:
    script = DEPLOY_SCRIPT.read_text(encoding="utf-8")

    access = "gcloud secrets versions access latest"
    build = 'echo "Building ${IMAGE}"'
    binding = (
        "AXWISE_AUTHORITY_PROOF_SECRET="
        "AXWISE_AUTHORITY_PROOF_SECRET:latest"
    )

    assert "AXWISE_AUTHORITY_PROOF_SECRET" in script.split("required_secrets=(", 1)[1]
    assert access in script
    assert "--secret AXWISE_AUTHORITY_PROOF_SECRET" in script
    assert "value = sys.stdin.buffer.read()" in script
    assert 'value.decode("utf-8")' in script
    assert "len(value) >= 32" in script
    assert script.index(access) < script.index(build)
    assert script.count(binding) == 2

    # The value must flow only from Secret Manager to the validating process;
    # neither command tracing nor a diagnostic may expose the secret bytes.
    assert "set -x" not in script
    assert "print(value)" not in script
    assert "echo ${AXWISE_AUTHORITY_PROOF_SECRET}" not in script


def test_registry_grounding_can_be_made_a_fail_fast_release_requirement() -> None:
    script = DEPLOY_SCRIPT.read_text(encoding="utf-8")

    assert 'REQUIRE_OPENREGISTER="${REQUIRE_OPENREGISTER:-false}"' in script
    assert 'elif [[ "${REQUIRE_OPENREGISTER}" == "true" ]]' in script
    assert "Required Secret Manager secret" in script


def test_searxng_route_is_discovered_and_authenticated_before_build() -> None:
    script = DEPLOY_SCRIPT.read_text(encoding="utf-8")

    discovery = 'DISCOVERED_SEARXNG_URL="$(gcloud run services describe "${SEARXNG_SERVICE}"'
    preflight = 'f"{base_url}/search?{query}"'
    build = 'echo "Building ${IMAGE}"'

    assert 'SEARXNG_SERVICE="${SEARXNG_SERVICE:-axwise-searxng}"' in script
    assert 'SEARXNG_URL="${SEARXNG_URL:-}"' in script
    assert discovery in script
    assert "value(status.url)" in script
    assert 'SEARXNG_URL="${DISCOVERED_SEARXNG_URL}"' in script
    assert '[[ "${SEARXNG_URL}" == *"@"* ]]' in script
    assert '[[ ! "${SEARXNG_URL}" =~ ^https:// ]]' in script
    assert '[[ "${SEARXNG_URL}" != "${DISCOVERED_SEARXNG_URL}" ]]' in script
    assert '[[ "${SEARXNG_URL}" == */search ]]' in script
    assert 'WORKER_SERVICE_ACCOUNT="$(gcloud run services describe "${WORKER_SERVICE}"' in script
    assert 'gcloud run services get-iam-policy "${SEARXNG_SERVICE}"' in script
    assert "bindings.role=roles/run.invoker" in script
    assert 'bindings.members=serviceAccount:${WORKER_SERVICE_ACCOUNT}' in script
    assert 'grep -Fxq "serviceAccount:${WORKER_SERVICE_ACCOUNT}"' in script
    assert "Worker service account lacks roles/run.invoker" in script
    assert "gcloud" in script
    assert "auth" in script
    assert "print-identity-token" in script
    assert "--impersonate-service-account" not in script
    assert preflight in script
    assert '"Authorization": f"Bearer {token}"' in script
    assert 'content_type != "application/json"' in script
    assert 'isinstance(payload.get("results"), list)' in script
    assert "invalid search schema" in script
    assert script.index(discovery) < script.index(preflight) < script.index(build)
    assert (
        'WORKER_ENV_VARS="${WORKER_ENV_VARS}@SEARXNG_URL=${SEARXNG_URL}'
        '@SEARXNG_AUTH_MODE=google_identity"' in script
    )
    assert (
        '--set-env-vars "^@^WORKER_MODE=health_only@'
        'AXWISE_BUSINESS_EVIDENCE_PROJECTION_MODELS='
        '${AXWISE_BUSINESS_EVIDENCE_PROJECTION_MODELS}@'
        'AXWISE_BUILD_REVISION=${REVISION}"' in script
    )
    assert '--set-env-vars "${WORKER_ENV_VARS}@WORKER_MODE=poll"' in script
    assert '--service-account "${WORKER_SERVICE_ACCOUNT}"' in script

    # Identity tokens and response bodies must not be written to the deploy log.
    assert "print(token)" not in script
    assert "print(body)" not in script


def test_private_searxng_deployment_uses_identity_and_pinned_image() -> None:
    script = SEARXNG_DEPLOY_SCRIPT.read_text(encoding="utf-8")
    dockerfile = (ROOT / "deploy" / "searxng" / "Dockerfile").read_text(
        encoding="utf-8"
    )
    settings = (ROOT / "deploy" / "searxng" / "settings.yml").read_text(
        encoding="utf-8"
    )

    assert "searxng/searxng@sha256:" in dockerfile
    assert "--no-allow-unauthenticated" in script
    assert '--service-account "${SERVICE_ACCOUNT}"' in script
    assert "gcloud iam service-accounts describe" in script
    assert 'serviceAccount:${WORKER_SERVICE_ACCOUNT}' in script
    assert "roles/run.invoker" in script
    assert "SEARXNG_AUTH_MODE=google_identity" in script
    assert "SEARXNG_SECRET=" in script
    assert "- json" in settings
    for engine in ("bing", "brave", "duckduckgo", "google"):
        assert f"- name: {engine}\n    disabled: false" in settings
