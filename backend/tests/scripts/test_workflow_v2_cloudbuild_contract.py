"""Fail-closed contract for the isolated workflow-v2 image build."""

import json
import os
import subprocess
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
CLOUD_BUILD_CONFIG = ROOT / "cloudbuild.workflow-v2.yaml"
SEARX_BUILD_CONFIG = ROOT / "deploy" / "searxng" / "cloudbuild.workflow-v2.yaml"
SEARX_DOCKERFILE = ROOT / "deploy" / "searxng" / "Dockerfile"
V2_DOCKERFILE = ROOT / "backend" / "Dockerfile.workflow-v2"
V2_SEARX_DEPLOY = ROOT / "scripts" / "deploy-workflow-v2-searxng-cloud-run.sh"
pytestmark = pytest.mark.contract


def _write_fake_clean_git(fake_bin: Path) -> None:
    fake_git = fake_bin / "git"
    fake_git.write_text(
        "#!/bin/sh\n"
        "case \"$*\" in\n"
        "  *\"rev-parse --show-toplevel\"*) printf '%s\\n' \"$FAKE_REPO_ROOT\" ;;\n"
        "  *\"status --porcelain=v1 --untracked-files=all\"*) exit 0 ;;\n"
        "  *\"rev-parse --verify HEAD\"*) printf '%040d\\n' 1 ;;\n"
        "  *\"archive --format=tar\"*)\n"
        "    exec tar -cf - -C \"$FAKE_REPO_ROOT\" "
        "deploy/searxng/Dockerfile deploy/searxng/settings.yml "
        "deploy/searxng/cloudbuild.workflow-v2.yaml ;;\n"
        "  *) exit 91 ;;\n"
        "esac\n",
        encoding="utf-8",
    )
    fake_git.chmod(0o755)


def test_workflow_v2_build_uses_custom_service_account_compatible_logging() -> None:
    config = CLOUD_BUILD_CONFIG.read_text(encoding="utf-8")

    assert config.count("logging: CLOUD_LOGGING_ONLY") == 1
    assert "logging: GCS_ONLY" not in config
    assert "logsBucket:" not in config
    assert '"backend/Dockerfile.workflow-v2"' in config
    assert config.count('"$_IMAGE_NAME"') >= 3


def test_workflow_v2_image_contains_only_the_small_search_adapter() -> None:
    dockerfile = V2_DOCKERFILE.read_text(encoding="utf-8")

    assert "services/generative/searxng_search_service.py" in dockerfile
    assert "research_source_authority_service.py" not in dockerfile
    assert "services/workflow_v2 /app/backend/services/workflow_v2" in dockerfile


def test_workflow_v2_search_build_keeps_the_pinned_image_and_logging_contract() -> None:
    config = SEARX_BUILD_CONFIG.read_text(encoding="utf-8")
    dockerfile = SEARX_DOCKERFILE.read_text(encoding="utf-8")

    assert "searxng/searxng@sha256:" in dockerfile
    assert "logging: CLOUD_LOGGING_ONLY" in config
    assert config.count('"$_IMAGE_NAME"') >= 3
    assert '"--pull"' in config


def test_preview_search_deploy_is_private_v2_only_and_does_not_move_worker_image(
    tmp_path: Path,
) -> None:
    script = V2_SEARX_DEPLOY.read_text(encoding="utf-8")
    subprocess.run(["bash", "-n", str(V2_SEARX_DEPLOY)], check=True)

    assert 'EXPECTED_PROJECT_ID="axwise-v2-preview-001"' in script
    assert 'EXPECTED_REGION="europe-west4"' in script
    assert 'EXPECTED_SERVICE="axwise-v2-search-preview"' in script
    assert 'EXPECTED_WORKER_SERVICE="axwise-v2-worker-preview"' in script
    assert 'EXPECTED_REPOSITORY="workflow-v2-preview"' in script
    assert 'EXPECTED_BUILD_SOURCE_BUCKET="axwise-v2-preview-001_cloudbuild"' in script
    assert 'EXPECTED_BUILD_ACCOUNT_ID="workflow-v2-preview-build"' in script
    assert 'EXPECTED_SEARCH_ACCOUNT_ID="axwise-v2-search-preview"' in script
    assert 'EXPECTED_SECRET="axwise-v2-search-preview-secret"' in script
    assert "legacy project and service identities are forbidden" in script
    assert script.index('test "${PROJECT_ID}" = "${EXPECTED_PROJECT_ID}"') < script.index(
        "gcloud projects describe"
    )
    for variable, expected in (
        ("REPOSITORY", "EXPECTED_REPOSITORY"),
        ("BUILD_SOURCE_BUCKET", "EXPECTED_BUILD_SOURCE_BUCKET"),
        ("BUILD_ACCOUNT_ID", "EXPECTED_BUILD_ACCOUNT_ID"),
        ("SEARCH_ACCOUNT_ID", "EXPECTED_SEARCH_ACCOUNT_ID"),
        ("SECRET", "EXPECTED_SECRET"),
    ):
        assert f'test "${{{variable}}}" = "${{{expected}}}"' in script

    assert "git -C \"${REPOSITORY_ROOT}\" archive --format=tar" in script
    assert "deploy/searxng/Dockerfile" in script
    assert "deploy/searxng/settings.yml" in script
    assert "deploy/searxng/cloudbuild.workflow-v2.yaml" in script
    assert 'gcloud builds submit "${BUILD_CONTEXT}"' in script
    assert "--ignore-file=/dev/null" not in script

    assert '.dockerConfig.immutableTags == true' in script
    assert 'EXPECTED_EXISTING_SEARXNG_DIGEST="${EXPECTED_EXISTING_SEARXNG_DIGEST:-}"' in script
    assert "Refusing to adopt an existing search image without " in script
    assert "adopted-explicit-existing-digest" in script

    assert 'gcloud run services replace "${SERVICE_SPEC}"' in script
    assert 'gcloud run deploy "${SERVICE}"' not in script
    assert '"run.googleapis.com/invoker-iam-disabled": "false"' in script
    assert 'and (.spec.template.spec.containers | length) == 1' in script
    assert 'and ([.spec.template.spec.containers[0].env[]?] | length == 2)' in script
    assert 'gcloud run services set-iam-policy "${SERVICE}" "${IAM_POLICY_FILE}"' in script
    assert '.bindings == [{role: "roles/run.invoker", members: [$member]}]' in script
    assert 'gcloud run services update "${WORKER_SERVICE}"' not in script
    assert "--update-env-vars" not in script

    iam_index = script.index(
        'gcloud run services set-iam-policy "${SERVICE}" "${IAM_POLICY_FILE}"'
    )
    assert script.rfind("verify_expected_worker", 0, iam_index) > script.index(
        'gcloud run services replace "${SERVICE_SPEC}"'
    )
    assert "roles/run.invoker" in script
    assert 'name: "SEARXNG_SECRET"' in script
    assert 'key: $secret_version' in script
    assert 'name: "SEARXNG_BASE_URL"' in script
    assert 'EXPECTED_AXWISE_WORKER_IMAGE="${EXPECTED_AXWISE_WORKER_IMAGE:-}"' in script
    assert (
        "EXPECTED_AXWISE_WORKER_IMAGE must be the exact Preview AxWise image digest reference"
        in script
    )
    assert ':${SOURCE_COMMIT}"' in script
    assert 'IMAGE_LOOKUP_STATUS' in script
    assert "PROJECT_NUMBER" not in script
    assert "set -x" not in script
    assert 'echo "${SECRET' not in script

    environment = os.environ.copy()
    environment.update({"PROJECT_ID": "axwise-73425"})
    result = subprocess.run(
        ["bash", str(V2_SEARX_DEPLOY)],
        cwd=tmp_path,
        env=environment,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    assert result.returncode == 64
    assert "PROJECT_ID must be axwise-v2-preview-001" in result.stderr

    environment = os.environ.copy()
    environment.pop("EXPECTED_AXWISE_WORKER_IMAGE", None)
    result = subprocess.run(
        ["bash", str(V2_SEARX_DEPLOY)],
        cwd=tmp_path,
        env=environment,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    assert result.returncode == 64
    assert (
        "EXPECTED_AXWISE_WORKER_IMAGE must be the exact Preview AxWise image digest reference"
        in result.stderr
    )


@pytest.mark.parametrize(
    ("name", "value", "message"),
    [
        (
            "SEARXNG_SERVICE_ACCOUNT_ID",
            "axwise-v2-worker-preview",
            "SEARXNG_SERVICE_ACCOUNT_ID must be axwise-v2-search-preview",
        ),
        (
            "SEARXNG_SECRET_NAME",
            "unrelated-preview-secret",
            "SEARXNG_SECRET_NAME must be axwise-v2-search-preview-secret",
        ),
        ("REPOSITORY", "other-repository", "REPOSITORY must be workflow-v2-preview"),
        (
            "BUILD_SOURCE_BUCKET",
            "other-bucket",
            "BUILD_SOURCE_BUCKET must be axwise-v2-preview-001_cloudbuild",
        ),
        (
            "BUILD_ACCOUNT_ID",
            "other-build-account",
            "BUILD_ACCOUNT_ID must be workflow-v2-preview-build",
        ),
    ],
)
def test_preview_search_deploy_rejects_ambient_identity_and_resource_overrides(
    tmp_path: Path, name: str, value: str, message: str
) -> None:
    environment = os.environ.copy()
    environment.update({name: value})

    result = subprocess.run(
        ["bash", str(V2_SEARX_DEPLOY)],
        cwd=tmp_path,
        env=environment,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )

    assert result.returncode == 64
    assert message in result.stderr


def test_preview_search_deploy_rejects_stale_worker_before_gcp_mutation(
    tmp_path: Path,
) -> None:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    gcloud_log = tmp_path / "gcloud.log"
    _write_fake_clean_git(fake_bin)

    fake_gcloud = fake_bin / "gcloud"
    fake_gcloud.write_text(
        "#!/bin/sh\n"
        "printf '%s\\n' \"$*\" >>\"$FAKE_GCLOUD_LOG\"\n"
        "case \"$*\" in\n"
        "  \"projects describe axwise-v2-preview-001\"*) exit 0 ;;\n"
        "  \"artifacts repositories describe workflow-v2-preview\"*)\n"
        "    printf '%s\\n' '{\"format\":\"DOCKER\",\"dockerConfig\":{\"immutableTags\":true}}' ;;\n"
        "  \"iam service-accounts describe workflow-v2-preview-build@\"*) exit 0 ;;\n"
        "  *\"run services describe axwise-v2-worker-preview\"*)\n"
        "    printf '%s\\n' '{\"spec\":{\"template\":{\"spec\":{"
        "\"serviceAccountName\":\"axwise-v2-worker-preview@"
        "axwise-v2-preview-001.iam.gserviceaccount.com\",\"containers\":[{"
        "\"image\":\"europe-west4-docker.pkg.dev/axwise-v2-preview-001/"
        "workflow-v2-preview/axwise-service@sha256:"
        + ("b" * 64)
        + "\"}]}}}}' ;;\n"
        "  *) exit 92 ;;\n"
        "esac\n",
        encoding="utf-8",
    )
    fake_gcloud.chmod(0o755)

    environment = os.environ.copy()
    environment.update(
        {
            "EXPECTED_AXWISE_WORKER_IMAGE": (
                "europe-west4-docker.pkg.dev/axwise-v2-preview-001/"
                "workflow-v2-preview/axwise-service@sha256:"
                + ("a" * 64)
            ),
            "FAKE_GCLOUD_LOG": str(gcloud_log),
            "FAKE_REPO_ROOT": str(ROOT),
            "PATH": f"{fake_bin}:{environment['PATH']}",
        }
    )
    result = subprocess.run(
        ["bash", str(V2_SEARX_DEPLOY)],
        cwd=tmp_path,
        env=environment,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )

    assert result.returncode == 77
    assert "does not match its expected image and service account" in result.stderr
    calls = gcloud_log.read_text(encoding="utf-8")
    assert "service-accounts create" not in calls
    assert "secrets create" not in calls
    assert "secrets versions add" not in calls
    assert "add-iam-policy-binding" not in calls
    assert "builds submit" not in calls
    assert "run services replace" not in calls
    assert "set-iam-policy" not in calls


def test_preview_search_deploy_adopts_only_explicit_existing_digest(
    tmp_path: Path,
) -> None:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    gcloud_log = tmp_path / "gcloud.log"
    _write_fake_clean_git(fake_bin)

    worker_image = (
        "europe-west4-docker.pkg.dev/axwise-v2-preview-001/"
        "workflow-v2-preview/axwise-service@sha256:"
        + ("a" * 64)
    )
    search_digest = "sha256:" + ("c" * 64)
    fake_gcloud = fake_bin / "gcloud"
    fake_gcloud.write_text(
        "#!/bin/sh\n"
        "printf '%s\\n' \"$*\" >>\"$FAKE_GCLOUD_LOG\"\n"
        "case \"$*\" in\n"
        "  \"projects describe axwise-v2-preview-001\"*) exit 0 ;;\n"
        "  \"artifacts repositories describe workflow-v2-preview\"*)\n"
        "    printf '%s\\n' '{\"format\":\"DOCKER\",\"dockerConfig\":{\"immutableTags\":true}}' ;;\n"
        "  \"iam service-accounts describe workflow-v2-preview-build@\"*) exit 0 ;;\n"
        "  *\"run services describe axwise-v2-worker-preview\"*)\n"
        "    printf '{\"spec\":{\"template\":{\"spec\":{"
        "\"serviceAccountName\":\"axwise-v2-worker-preview@"
        "axwise-v2-preview-001.iam.gserviceaccount.com\",\"containers\":[{"
        "\"image\":\"%s\"}]}}}}\\n' \"$FAKE_WORKER_IMAGE\" ;;\n"
        "  *\"run services describe axwise-v2-search-preview\"*\"--format=json\"*)\n"
        "    printf '%s\\n' 'ERROR: Cannot find service [axwise-v2-search-preview]' >&2; exit 1 ;;\n"
        "  \"iam service-accounts describe axwise-v2-search-preview@\"*) exit 0 ;;\n"
        "  \"secrets describe axwise-v2-search-preview-secret\"*) exit 0 ;;\n"
        "  \"secrets versions list axwise-v2-search-preview-secret\"*)\n"
        "    printf '%s\\n' 'projects/test/secrets/search/versions/7' ;;\n"
        "  \"secrets add-iam-policy-binding axwise-v2-search-preview-secret\"*) exit 0 ;;\n"
        "  \"artifacts docker images describe "
        "europe-west4-docker.pkg.dev/axwise-v2-preview-001/workflow-v2-preview/"
        "axwise-v2-search-preview:0000000000000000000000000000000000000001\"*)\n"
        "    printf '%s\\n' \"$FAKE_SEARCH_DIGEST\" ;;\n"
        "  \"run services replace \"*) exit 93 ;;\n"
        "  *) exit 92 ;;\n"
        "esac\n",
        encoding="utf-8",
    )
    fake_gcloud.chmod(0o755)

    environment = os.environ.copy()
    environment.update(
        {
            "EXPECTED_AXWISE_WORKER_IMAGE": worker_image,
            "FAKE_GCLOUD_LOG": str(gcloud_log),
            "FAKE_REPO_ROOT": str(ROOT),
            "FAKE_SEARCH_DIGEST": search_digest,
            "FAKE_WORKER_IMAGE": worker_image,
            "EXPECTED_EXISTING_SEARXNG_DIGEST": search_digest,
            "PATH": f"{fake_bin}:{environment['PATH']}",
        }
    )
    result = subprocess.run(
        ["bash", str(V2_SEARX_DEPLOY)],
        cwd=tmp_path,
        env=environment,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )

    assert result.returncode == 93
    calls = gcloud_log.read_text(encoding="utf-8")
    assert "axwise-v2-search-preview:0000000000000000000000000000000000000001" in calls
    assert "artifacts docker images describe" in calls
    assert "builds submit" not in calls


def test_preview_search_deploy_refuses_unpinned_existing_digest(
    tmp_path: Path,
) -> None:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    gcloud_log = tmp_path / "gcloud.log"
    _write_fake_clean_git(fake_bin)

    worker_image = (
        "europe-west4-docker.pkg.dev/axwise-v2-preview-001/"
        "workflow-v2-preview/axwise-service@sha256:" + ("a" * 64)
    )
    fake_gcloud = fake_bin / "gcloud"
    fake_gcloud.write_text(
        "#!/bin/sh\n"
        "printf '%s\\n' \"$*\" >>\"$FAKE_GCLOUD_LOG\"\n"
        "case \"$*\" in\n"
        "  \"projects describe axwise-v2-preview-001\"*) exit 0 ;;\n"
        "  \"artifacts repositories describe workflow-v2-preview\"*)\n"
        "    printf '%s\\n' '{\"format\":\"DOCKER\",\"dockerConfig\":{\"immutableTags\":true}}' ;;\n"
        "  \"iam service-accounts describe workflow-v2-preview-build@\"*) exit 0 ;;\n"
        "  *\"run services describe axwise-v2-worker-preview\"*)\n"
        "    printf '{\"spec\":{\"template\":{\"spec\":{"
        "\"serviceAccountName\":\"axwise-v2-worker-preview@"
        "axwise-v2-preview-001.iam.gserviceaccount.com\",\"containers\":[{"
        "\"image\":\"%s\"}]}}}}\\n' \"$FAKE_WORKER_IMAGE\" ;;\n"
        "  *\"run services describe axwise-v2-search-preview\"*\"--format=json\"*)\n"
        "    printf '%s\\n' 'NOT_FOUND' >&2; exit 1 ;;\n"
        "  \"iam service-accounts describe axwise-v2-search-preview@\"*) exit 0 ;;\n"
        "  \"secrets describe axwise-v2-search-preview-secret\"*) exit 0 ;;\n"
        "  \"secrets versions list axwise-v2-search-preview-secret\"*)\n"
        "    printf '%s\\n' 'projects/test/secrets/search/versions/7' ;;\n"
        "  \"secrets add-iam-policy-binding axwise-v2-search-preview-secret\"*) exit 0 ;;\n"
        "  \"artifacts docker images describe \"*)\n"
        "    printf '%s\\n' \"$FAKE_SEARCH_DIGEST\" ;;\n"
        "  *) exit 92 ;;\n"
        "esac\n",
        encoding="utf-8",
    )
    fake_gcloud.chmod(0o755)

    environment = os.environ.copy()
    environment.update(
        {
            "EXPECTED_AXWISE_WORKER_IMAGE": worker_image,
            "FAKE_GCLOUD_LOG": str(gcloud_log),
            "FAKE_REPO_ROOT": str(ROOT),
            "FAKE_SEARCH_DIGEST": "sha256:" + ("c" * 64),
            "FAKE_WORKER_IMAGE": worker_image,
            "PATH": f"{fake_bin}:{environment['PATH']}",
        }
    )
    environment.pop("EXPECTED_EXISTING_SEARXNG_DIGEST", None)

    result = subprocess.run(
        ["bash", str(V2_SEARX_DEPLOY)],
        cwd=tmp_path,
        env=environment,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )

    assert result.returncode == 77
    assert "without EXPECTED_EXISTING_SEARXNG_DIGEST" in result.stderr
    calls = gcloud_log.read_text(encoding="utf-8")
    assert "builds submit" not in calls
    assert "run services replace" not in calls
    assert "service-accounts create" not in calls
    assert "secrets create" not in calls
    assert "secrets add-iam-policy-binding" not in calls


def test_preview_search_deploy_replaces_exact_service_and_iam_from_archive(
    tmp_path: Path,
) -> None:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    _write_fake_clean_git(fake_bin)
    gcloud_log = tmp_path / "gcloud.log"
    service_spec = tmp_path / "service.json"
    iam_policy = tmp_path / "iam.json"
    image_marker = tmp_path / "image-built"
    build_files = tmp_path / "build-files.txt"

    worker_image = (
        "europe-west4-docker.pkg.dev/axwise-v2-preview-001/"
        "workflow-v2-preview/axwise-service@sha256:" + ("a" * 64)
    )
    search_digest = "sha256:" + ("c" * 64)
    search_url = "https://axwise-v2-search-preview-example-ew.a.run.app"

    fake_gcloud = fake_bin / "gcloud"
    fake_gcloud.write_text(
        """#!/bin/sh
printf '%s\n' "$*" >>"$FAKE_GCLOUD_LOG"
case "$*" in
  "projects describe axwise-v2-preview-001"*) exit 0 ;;
  "artifacts repositories describe workflow-v2-preview"*)
    printf '%s\n' '{"format":"DOCKER","dockerConfig":{"immutableTags":true}}' ;;
  "iam service-accounts describe workflow-v2-preview-build@"*) exit 0 ;;
  *"run services describe axwise-v2-worker-preview"*)
    printf '{"spec":{"template":{"spec":{"serviceAccountName":"axwise-v2-worker-preview@axwise-v2-preview-001.iam.gserviceaccount.com","containers":[{"image":"%s"}]}}}}\n' "$FAKE_WORKER_IMAGE" ;;
  *"run services describe axwise-v2-search-preview"*"--format=json"*)
    if test ! -f "$FAKE_SERVICE_SPEC"; then
      printf '%s\n' 'NOT_FOUND' >&2
      exit 1
    fi
    jq --arg url "$FAKE_SEARCH_URL" '. + {status: {url: $url}}' "$FAKE_SERVICE_SPEC" ;;
  *"run services describe axwise-v2-search-preview"*"value(status.url)"*)
    printf '%s\n' "$FAKE_SEARCH_URL" ;;
  "artifacts docker images describe "*)
    if test -f "$FAKE_IMAGE_MARKER"; then
      printf '%s\n' "$FAKE_SEARCH_DIGEST"
    else
      printf '%s\n' 'NOT_FOUND' >&2
      exit 1
    fi ;;
  "builds submit "*)
    (cd "$3" && find . -type f -print | sort) >"$FAKE_BUILD_FILES"
    : >"$FAKE_IMAGE_MARKER"
    printf '%s\n' '00000000-0000-0000-0000-000000000000' ;;
  "iam service-accounts describe axwise-v2-search-preview@"*) exit 0 ;;
  "secrets describe axwise-v2-search-preview-secret"*) exit 0 ;;
  "secrets versions list axwise-v2-search-preview-secret"*)
    printf '%s\n' 'projects/test/secrets/search/versions/7' ;;
  "secrets add-iam-policy-binding axwise-v2-search-preview-secret"*) exit 0 ;;
  "run services replace "*) cp "$4" "$FAKE_SERVICE_SPEC" ;;
  "run services get-iam-policy axwise-v2-search-preview"*)
    if test -f "$FAKE_IAM_POLICY"; then
      cat "$FAKE_IAM_POLICY"
    else
      printf '%s\n' '{"version":1,"etag":"safe-etag","bindings":[]}'
    fi ;;
  "run services set-iam-policy axwise-v2-search-preview"*)
    cp "$5" "$FAKE_IAM_POLICY" ;;
  *) exit 92 ;;
esac
""",
        encoding="utf-8",
    )
    fake_gcloud.chmod(0o755)

    environment = os.environ.copy()
    environment.update(
        {
            "EXPECTED_AXWISE_WORKER_IMAGE": worker_image,
            "FAKE_BUILD_FILES": str(build_files),
            "FAKE_GCLOUD_LOG": str(gcloud_log),
            "FAKE_IAM_POLICY": str(iam_policy),
            "FAKE_IMAGE_MARKER": str(image_marker),
            "FAKE_REPO_ROOT": str(ROOT),
            "FAKE_SEARCH_DIGEST": search_digest,
            "FAKE_SEARCH_URL": search_url,
            "FAKE_SERVICE_SPEC": str(service_spec),
            "FAKE_WORKER_IMAGE": worker_image,
            "PATH": f"{fake_bin}:{environment['PATH']}",
        }
    )
    environment.pop("EXPECTED_EXISTING_SEARXNG_DIGEST", None)

    result = subprocess.run(
        ["bash", str(V2_SEARX_DEPLOY)],
        cwd=tmp_path,
        env=environment,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert build_files.read_text(encoding="utf-8").splitlines() == [
        "./Dockerfile",
        "./cloudbuild.workflow-v2.yaml",
        "./settings.yml",
    ]
    spec = json.loads(service_spec.read_text(encoding="utf-8"))
    containers = spec["spec"]["template"]["spec"]["containers"]
    assert len(containers) == 1
    assert containers[0].get("command") is None
    assert containers[0].get("args") is None
    assert containers[0].get("volumeMounts") is None
    assert spec["spec"]["template"]["spec"].get("volumes") is None
    assert containers[0]["image"].endswith(f"@{search_digest}")
    assert containers[0]["env"] == [
        {"name": "SEARXNG_BASE_URL", "value": f"{search_url}/"},
        {
            "name": "SEARXNG_SECRET",
            "valueFrom": {
                "secretKeyRef": {
                    "name": "axwise-v2-search-preview-secret",
                    "key": "7",
                }
            },
        },
    ]
    policy = json.loads(iam_policy.read_text(encoding="utf-8"))
    assert policy["bindings"] == [
        {
            "role": "roles/run.invoker",
            "members": [
                "serviceAccount:axwise-v2-worker-preview@"
                "axwise-v2-preview-001.iam.gserviceaccount.com"
            ],
        }
    ]
    calls = gcloud_log.read_text(encoding="utf-8")
    assert "run services update axwise-v2-worker-preview" not in calls
    assert "SEARCH_WORKER_AUTHORIZED=axwise-v2-worker-preview" in result.stdout
