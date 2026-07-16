"""Configuration-driven capability aliases and domain packs."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Iterable, Tuple

from backend.domain.orchestration.models import TaskEnvelopeV1


DEFAULT_CONFIG_PATH = (
    Path(__file__).resolve().parents[2]
    / "config"
    / "orchestration"
    / "capabilities.json"
)


class CapabilityRegistry:
    def __init__(self, config_path: Path = DEFAULT_CONFIG_PATH):
        with config_path.open("r", encoding="utf-8") as handle:
            config = json.load(handle)
        self.aliases = {
            self._slug(source): self._slug(target)
            for source, target in config.get("aliases", {}).items()
        }
        self.domain_packs = config.get("domain_packs", {})
        self.domain_aliases = {}
        for pack_name, pack in self.domain_packs.items():
            canonical = self._slug(pack_name)
            self.domain_aliases[canonical] = canonical
            for alias in pack.get("aliases", []):
                self.domain_aliases[self._slug(alias)] = canonical

    @staticmethod
    def _slug(value: str) -> str:
        return re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", value.casefold())).strip("_")

    def normalize(self, value: str) -> str:
        slug = self._slug(value)
        return self.aliases.get(slug, slug)

    def normalize_many(self, values: Iterable[str]) -> list[str]:
        return list(dict.fromkeys(self.normalize(value) for value in values if value.strip()))

    def resolve_domain_pack(self, task: TaskEnvelopeV1) -> tuple[str, dict]:
        requested = task.capability_profile or task.domain
        pack_name = self.domain_aliases.get(self._slug(requested), self._slug(requested))
        return pack_name, self.domain_packs.get(pack_name, {})

    def requirements_for(self, task: TaskEnvelopeV1) -> Tuple[list[str], list[str]]:
        _, pack = self.resolve_domain_pack(task)
        required_source = task.required_capabilities or pack.get(
            "default_required_capabilities", []
        )
        preferred_source = [
            *task.preferred_capabilities,
            *pack.get("preferred_capabilities", []),
        ]
        return self.normalize_many(required_source), self.normalize_many(preferred_source)

    def task_class_for(self, task: TaskEnvelopeV1) -> str:
        if task.task_class:
            return self._slug(task.task_class)
        pack_name, _ = self.resolve_domain_pack(task)
        return pack_name
