"""
Speaker-based persona naming helpers.

Extracted from PersonaFormationService._generate_descriptive_name_from_speaker_id
for clean reuse and thin service delegation.
"""

from typing import List
import logging
import random
import hashlib


logger = logging.getLogger(__name__)


_DEF_NAMES = {
    "Tech": ["Alex", "Sarah", "David", "Emma"],
    "Price": ["Patricia", "Michael", "Lisa", "James"],
    "Savvy": ["Jordan", "Taylor", "Morgan", "Casey"],
    "Community": ["Riley", "Avery", "Quinn", "Blake"],
    "Principled": ["Eleanor", "William", "Grace", "Henry"],
}

# Flattened global pool for deterministic fallback
_ALL_NAMES: List[str] = [name for lst in _DEF_NAMES.values() for name in lst]


def generate_descriptive_name_from_speaker_id(speaker_id: str) -> str:
    """Generate a deterministic first-name-only persona name from speaker_id.

    Enforces first-name-only (no titles/roles) and determinism to avoid collisions.
    """
    try:
        base_key = speaker_id or "unknown"
        if "_" in speaker_id:
            parts = speaker_id.split("_")
            if len(parts) >= 2:
                category = parts[0].replace("_", " ")
                role = parts[1].replace("_", " ")
                for key, name_list in _DEF_NAMES.items():
                    if key.lower() in category.lower():
                        h = hashlib.sha256(
                            f"{base_key}|{category}|{role}".encode()
                        ).hexdigest()
                        idx = int(h, 16) % len(name_list)
                        return name_list[idx]
        # Fallback to global pool (deterministic)
        h2 = hashlib.sha256(base_key.encode()).hexdigest()
        idx2 = int(h2, 16) % len(_ALL_NAMES)
        return _ALL_NAMES[idx2]
    except Exception as e:
        logger.warning("Error generating descriptive name for %s: %s", speaker_id, e)
        # deterministic but safe fallback
        return "Alex"
