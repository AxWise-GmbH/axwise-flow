"""Public distribution boundary. Never replace these lists with directory walks."""

VERSION = "0.4.0"
PYTHON_NAME = "axwise-extension"
NPM_NAME = "@axwise/extension"
DEPENDENCIES = (
    "annotated-types==0.8.0",
    "httpx==0.28.1",
    "mcp==1.25.0",
    "pydantic==2.13.4",
    "pydantic_core==2.46.4",
    "python-dotenv==1.2.1",
    "typing-inspection==0.4.4",
    "typing_extensions==4.16.0",
)
JS_FILES = tuple(f"packages/axwise-local/src/{name}.mjs" for name in (
    "runtime", "state", "schema", "mcp", "conversation-policy",
    "standalone", "standalone-config", "byok-provider",
))
KERNEL_FILES = tuple(f"backend/services/local_axwise/{name}.py" for name in (
    "__init__", "kernel", "worker", "quality", "pipeline_common", "discovery",
    "personas", "delivery", "prd_revisions", "analysis_views",
    "fastmcp_server", "engine", "provider", "storage", "schema_cleaner", "configuration",
))
DEPENDENCY_FILES = (
    "backend/domain/workflow_v2/wire.py",
    "backend/domain/workflow_v2/transcript_corpus.py",
    "backend/domain/workflow_v2/qualitative_analysis.py",
    "backend/domain/workflow_v2/simulation.py",
    "backend/services/workflow_v2/analysis_candidates.py",
    "backend/services/workflow_v2/capability_generation_payloads.py",
    "backend/services/workflow_v2/cognitive/policy.py",
    "backend/services/workflow_v2/cognitive/typesafe_triage.py",
)
INIT_FILES = (
    "backend/__init__.py", "backend/services/__init__.py",
    "backend/domain/workflow_v2/__init__.py",
    "backend/services/workflow_v2/__init__.py",
    "backend/services/workflow_v2/cognitive/__init__.py",
)
JS_TESTS = tuple(f"packages/axwise-local/test/{name}.test.mjs" for name in (
    "conversation-policy", "state", "schema", "runtime", "pipeline-runtime",
    "kernel-integration", "stages", "standalone",
))
PYTHON_TESTS = tuple(f"backend/tests/local_axwise/{name}.py" for name in (
    "__init__", "fixtures", "test_quality", "test_analysis_context", "test_kernel",
    "test_discovery", "test_analysis_views", "test_prd_revisions", "test_personas",
    "test_delivery", "test_pipeline_integration", "test_public_config",
))
DISTRIBUTION_FILES = tuple(f"packages/axwise-distribution/{name}" for name in (
    "manifest.py", "build.py", "build_backend.py", "launcher.py", "npm-cli.mjs",
    "pyproject.toml", "README.md", "PUBLIC_README.md", "test_distribution.py",
    "smoke.py", "example.config.json",
))
SOURCE_FILES = (JS_FILES + KERNEL_FILES + DEPENDENCY_FILES + INIT_FILES + JS_TESTS
                + PYTHON_TESTS + DISTRIBUTION_FILES
                + ("backend/services/local_axwise/requirements.txt", "LICENSE"))
