"""Shared bounds for server-owned research discovery summaries.

The complete requirement has its own independent budget. A topic anchor is only
a discovery hint and must fit the consumer's topic section without introducing
false incompleteness for an otherwise fully preserved requirement.
"""

FALLBACK_DISCOVERY_TOPIC_CHARACTERS = 200


__all__ = ["FALLBACK_DISCOVERY_TOPIC_CHARACTERS"]
