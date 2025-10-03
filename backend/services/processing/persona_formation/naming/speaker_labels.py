"""
Speaker-based persona naming helpers.

Extracted from PersonaFormationService._generate_descriptive_name_from_speaker_id
for clean reuse and thin service delegation.
"""
from typing import List
import logging
import random

logger = logging.getLogger(__name__)


_DEF_NAMES = {
    "Tech": ["Alex", "Sarah", "David", "Emma"],
    "Price": ["Patricia", "Michael", "Lisa", "James"],
    "Savvy": ["Jordan", "Taylor", "Morgan", "Casey"],
    "Community": ["Riley", "Avery", "Quinn", "Blake"],
    "Principled": ["Eleanor", "William", "Grace", "Henry"],
}


def generate_descriptive_name_from_speaker_id(speaker_id: str) -> str:
    """Generate a descriptive persona name from a structured speaker_id.

    Mirrors legacy behavior for parity; falls back gracefully on errors.
    """
    try:
        if "_" in speaker_id:
            parts = speaker_id.split("_")
            if len(parts) >= 2:
                category = parts[0].replace("_", " ")
                role = parts[1].replace("_", " ")

                for key, name_list in _DEF_NAMES.items():
                    if key.lower() in category.lower():
                        name = random.choice(name_list)
                        return f"{name}, the {category} {role}"

        # Fallback to cleaned up speaker_id
        cleaned = speaker_id.replace("_", " ").title()
        return f"Representative {cleaned}"

    except Exception as e:
        logger.warning("Error generating descriptive name for %s: %s", speaker_id, e)
        return "Representative User"

