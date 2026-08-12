"""Capability vocabulary compatibility tests for Orqaly role labels."""

import pytest

from backend.services.orchestration.capability_registry import CapabilityRegistry


pytestmark = [pytest.mark.contract, pytest.mark.unit]


def test_orqaly_commercial_role_aliases_share_canonical_capabilities():
    registry = CapabilityRegistry()

    assert registry.normalize("Business Development Manager") == "sales_strategy"
    assert registry.normalize("Sales Manager") == "sales_strategy"
    assert registry.normalize("CFO") == "financial_analysis"
    assert registry.normalize("Marketing Strategist") == "campaign_strategy"
    assert registry.normalize("Managing Director") == "executive_strategy"
