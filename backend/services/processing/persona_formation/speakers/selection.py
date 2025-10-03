"""
Speaker selection strategies for persona generation.

Extracted from PersonaFormationService._select_diverse_speakers to keep the service
orchestration minimal.
"""
from typing import Dict, List, Tuple
import logging

logger = logging.getLogger(__name__)


def select_diverse_speakers(
    sorted_speakers: List[Tuple[str, str]],
    speaker_roles_map: Dict[str, str],
    max_personas: int,
) -> List[Tuple[str, str]]:
    """Select a diverse set of speakers prioritizing roles and content length.

    Mirrors legacy behavior for parity.
    """
    if len(sorted_speakers) <= max_personas:
        return sorted_speakers

    selected_speakers: List[Tuple[str, str]] = []
    role_counts: Dict[str, int] = {}

    # First pass: Select speakers with different roles
    for speaker, text in sorted_speakers:
        role = speaker_roles_map.get(speaker, "Participant")

        # Skip interviewers (already filtered above)
        if role == "Interviewer":
            continue

        # Prioritize role diversity
        if role not in role_counts:
            role_counts[role] = 0

        if role_counts[role] < 2:  # Max 2 personas per role
            selected_speakers.append((speaker, text))
            role_counts[role] += 1

            if len(selected_speakers) >= max_personas:
                break

    # Second pass: Fill remaining slots with speakers with most content
    if len(selected_speakers) < max_personas:
        remaining_speakers = [
            (speaker, text)
            for speaker, text in sorted_speakers
            if (speaker, text) not in selected_speakers
            and speaker_roles_map.get(speaker, "Participant") != "Interviewer"
        ]

        needed = max_personas - len(selected_speakers)
        selected_speakers.extend(remaining_speakers[:needed])

    logger.info(
        f"[PERFORMANCE] Selected {len(selected_speakers)} diverse speakers: "
        f"roles={list(role_counts.keys())}, "
        f"avg_text_length={sum(len(text) for _, text in selected_speakers) // len(selected_speakers) if selected_speakers else 0}"
    )

    return selected_speakers

