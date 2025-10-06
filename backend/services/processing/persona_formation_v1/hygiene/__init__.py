"""Hygiene utilities for persona formation V1.

This package contains small, single-responsibility helpers for content hygiene
that can be reused from the legacy monolith without behavior changes.
"""

from .speaker_filter import aggregate_stakeholder_text_excluding_non_interviewers

__all__ = [
    "aggregate_stakeholder_text_excluding_non_interviewers",
]

