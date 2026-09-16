"""Keep quality primitives separate from dispatch without breaking existing imports."""

from __future__ import annotations

import ast
import importlib
from pathlib import Path

import pytest


pytestmark = pytest.mark.contract


PACKAGE = "backend.services.workflow_v2.cognitive"
MODULES = (
    "models",
    "policy",
    "scope",
    "markdown",
    "evidence",
    "validation",
    "publication",
    "sources",
)
DIRECTORY = Path(__file__).resolve().parents[2] / "services/workflow_v2/cognitive"


def module_dependencies(name: str) -> set[str]:
    tree = ast.parse((DIRECTORY / f"{name}.py").read_text())
    dependencies: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            module = node.module or ""
            assert (
                "cognitive_executor" not in module
            ), "quality modules must not import the dispatcher"
            assert not module.startswith(
                "backend.api"
            ), "quality modules must not depend on API routes"
            if module.startswith(PACKAGE + "."):
                dependencies.add(module.removeprefix(PACKAGE + "."))
        elif isinstance(node, ast.Import):
            for alias in node.names:
                assert "cognitive_executor" not in alias.name
                assert not alias.name.startswith("backend.api")
    return dependencies


def test_quality_module_graph_is_acyclic_and_dispatcher_independent() -> None:
    graph = {name: module_dependencies(name) for name in MODULES}

    def visit(name: str, stack: tuple[str, ...]) -> None:
        assert name not in stack, f"cognitive import cycle: {stack + (name,)}"
        for dependency in graph[name]:
            assert dependency in graph
            visit(dependency, stack + (name,))

    for name in graph:
        visit(name, ())


@pytest.mark.parametrize("name", MODULES)
def test_existing_declaration_imports_remain_explicit_compatibility_exports(
    name: str,
) -> None:
    module = importlib.import_module(f"{PACKAGE}.{name}")
    dispatcher = importlib.import_module(
        "backend.services.workflow_v2.cognitive_executor"
    )
    for node in ast.parse((DIRECTORY / f"{name}.py").read_text()).body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            assert getattr(dispatcher, node.name) is getattr(module, node.name)
        elif isinstance(node, (ast.Assign, ast.AnnAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            for target in targets:
                if isinstance(target, ast.Name):
                    assert getattr(dispatcher, target.id) is getattr(module, target.id)


@pytest.mark.parametrize("name", MODULES)
def test_quality_modules_do_not_construct_execution_or_provider_clients(
    name: str,
) -> None:
    forbidden = {
        "Agent",
        "create_engine",
        "AsyncClient",
        "Client",
        "get_shared_workflow_model",
        "GeminiCognitiveExecutor",
        "create_operation_service",
    }
    for node in ast.walk(ast.parse((DIRECTORY / f"{name}.py").read_text())):
        if isinstance(node, ast.Call):
            called = (
                node.func.id
                if isinstance(node.func, ast.Name)
                else (node.func.attr if isinstance(node.func, ast.Attribute) else None)
            )
            assert called not in forbidden, f"{name} constructs {called}"


def test_executor_does_not_reabsorb_quality_implementation() -> None:
    # A size guard is not a quality measurement; it prevents accidental re-merging
    # of the old 11k-line module while the remaining handlers are split gradually.
    executor = DIRECTORY.parent / "cognitive_executor.py"
    assert len(executor.read_text().splitlines()) <= 4_000
    for name in MODULES:
        assert len((DIRECTORY / f"{name}.py").read_text().splitlines()) <= 3_000
