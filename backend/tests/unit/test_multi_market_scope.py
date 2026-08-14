import pytest

from backend.domain.market_scope import (
    MarketScopeV2,
    research_cells,
    resolve_market_expression,
)


pytestmark = pytest.mark.contract


def _codes(scope):
    return [item.country_code for item in scope.resolved_scope.countries]


def test_named_business_regions_expand_to_versioned_country_snapshots():
    assert _codes(resolve_market_expression("BENELUX")) == ["BE", "NL", "LU"]
    assert _codes(resolve_market_expression("DACH")) == ["DE", "AT", "CH"]
    assert _codes(resolve_market_expression("DACH+")) == ["DE", "AT", "CH", "LI"]
    assert _codes(resolve_market_expression("Baltic countries")) == ["EE", "LV", "LT"]
    assert _codes(resolve_market_expression("Nordics")) == ["DK", "FI", "IS", "NO", "SE"]


@pytest.mark.parametrize(
    ("expression", "country_code"),
    [
        ("South Georgia and the South Sandwich Islands", "GS"),
        ("Trinidad and Tobago", "TT"),
        ("Bosnia and Herzegovina", "BA"),
        ("Saint Vincent and the Grenadines", "VC"),
        ("Brunei", "BN"),
        ("U.S. Virgin Islands", "VI"),
        ("Virgin Islands, U.S.", "VI"),
        ("UAE", "AE"),
    ],
)
def test_exact_country_names_with_conjunctions_and_common_aliases_are_atomic(
    expression,
    country_code,
):
    assert _codes(resolve_market_expression(expression)) == [country_code]


@pytest.mark.parametrize(
    ("expression", "expected_count", "expected_codes", "requires_confirmation"),
    [
        ("Southeast Asia", 11, {"ID", "SG", "TH", "VN", "TL"}, False),
        ("ASEAN", 11, {"ID", "SG", "TH", "VN", "TL"}, False),
        ("Southern Europe", 16, {"ES", "PT", "IT", "GR", "RS"}, True),
        ("European Union", 27, {"EE", "DE", "NL", "FR", "IT"}, False),
        ("EEA", 30, {"EE", "DE", "NO", "IS", "LI"}, False),
    ],
)
def test_versioned_large_regions_resolve_without_generic_market_substitution(
    expression, expected_count, expected_codes, requires_confirmation
):
    scope = resolve_market_expression(expression)

    assert len(_codes(scope)) == expected_count
    assert expected_codes.issubset(set(_codes(scope)))
    assert scope.confirmation.required is requires_confirmation


def test_unions_priorities_and_exclusions_are_set_operations():
    scope = resolve_market_expression(
        "DACH + BENELUX prioritising Switzerland and Netherlands excluding Luxembourg"
    )

    assert _codes(scope) == ["DE", "AT", "CH", "BE", "NL"]
    assert scope.resolved_scope.excluded_country_codes == ["LU"]
    priorities = {
        item.country_code: (item.priority, item.research_depth)
        for item in scope.resolved_scope.countries
    }
    assert priorities["CH"] == ("primary", "deep")
    assert priorities["NL"] == ("primary", "deep")
    assert priorities["DE"] == ("standard", "standard")
    assert scope.resolution_hash == (
        "d1c98a610cc7c25c15640a95213586c2cd62950dca66a948643fd12c499d76a4"
    )


@pytest.mark.parametrize(
    "expression",
    [
        "DACH excluding Switzerland prioritising Germany",
        "DACH prioritising Germany excluding Switzerland",
    ],
)
def test_modifier_order_does_not_change_market_semantics(expression):
    scope = resolve_market_expression(expression)

    assert _codes(scope) == ["DE", "AT"]
    assert scope.resolved_scope.excluded_country_codes == ["CH"]
    assert scope.resolved_scope.countries[0].priority == "primary"


def test_explicit_country_union_does_not_collapse_to_last_country():
    scope = resolve_market_expression("USA + Canada")

    assert _codes(scope) == ["US", "CA"]
    assert scope.confirmation.required is False


def test_explicit_union_preserves_atomic_conjunction_country_name():
    scope = resolve_market_expression("Estonia + Trinidad and Tobago")

    assert _codes(scope) == ["EE", "TT"]
    assert scope.confirmation.required is False


@pytest.mark.parametrize(
    "expression",
    ["DACH+ + EE", "DACH+;EE", "EE + DACH+", "DACH+ and Estonia", "EE+DACH+"],
)
def test_composed_union_preserves_registered_plus_suffixed_alias(expression):
    assert set(_codes(resolve_market_expression(expression))) == {
        "AT",
        "CH",
        "DE",
        "EE",
        "LI",
    }


@pytest.mark.parametrize(
    ("expression", "expected_codes"),
    [
        ("XK", ["XK"]),
        ("Kosovo", ["XK"]),
        ("EE + XK", ["EE", "XK"]),
    ],
)
def test_operational_kosovo_code_is_shared_with_market_scope(expression, expected_codes):
    assert _codes(resolve_market_expression(expression)) == expected_codes


def test_ambiguous_region_requires_exact_membership_confirmation():
    scope = resolve_market_expression("SEA")

    assert _codes(scope) == []
    assert scope.confirmation.required is True
    assert scope.ambiguities == [
        {
            "raw_expression": "SEA",
            "candidate_group_ids": [
                "geographic_region:southeast_asia",
                "economic_bloc:asean",
            ],
            "reason": "named market expression has multiple recognized definitions",
        }
    ]


def test_sensitive_proposed_group_preserves_exact_snapshot_for_confirmation():
    scope = resolve_market_expression("Balkans")

    assert "RS" in _codes(scope)
    assert "XK" in _codes(scope)
    assert scope.confirmation.required is True
    assert scope.confirmation.confirmed is False


def test_resolution_hash_detects_post_confirmation_membership_drift():
    scope = resolve_market_expression("Baltics")
    payload = scope.model_dump(mode="json")
    payload["resolved_scope"]["countries"].pop()

    with pytest.raises(ValueError, match="resolution_hash"):
        MarketScopeV2.model_validate(payload)


def test_research_cells_keep_country_work_separate_from_comparison():
    scope = resolve_market_expression("BENELUX")
    cells = research_cells(scope)

    assert [row["cell_id"] for row in cells] == [
        "country:BE",
        "country:NL",
        "country:LU",
        "comparison:BE+NL+LU",
    ]
    assert cells[-1]["may_not_replace_country_cells"] is True


def test_explicit_localities_are_preserved_inside_country_unions():
    scope = resolve_market_expression("Tallinn, Estonia + Riga, Latvia")

    assert _codes(scope) == ["EE", "LV"]
    assert scope.resolved_scope.countries[0].localities == ["Tallinn"]
    assert scope.resolved_scope.countries[1].localities == ["Riga"]


def test_city_without_country_fails_closed_instead_of_guessing_a_market():
    scope = resolve_market_expression("Tallinn")

    assert _codes(scope) == []
    assert scope.confirmation.required is True
    assert scope.ambiguities[0]["raw_expression"] == "Tallinn"
