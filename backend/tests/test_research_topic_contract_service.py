from __future__ import annotations

import unicodedata

import pytest
from pydantic import ValidationError

from backend.services.research_topic_contract_service import (
    MAX_ALIASES,
    MAX_ALIASES_PER_COUNTRY,
    MAX_TOPIC_PHRASE_CHARS,
    TOPIC_CONTRACT_SCHEMA_VERSION,
    TRUSTED_TOPIC_ALIAS_REGISTRY_SHA256,
    ConfirmedMarketScope,
    ImmutableGoalTopicFields,
    TopicAliasExpansionPayload,
    TopicMatchRelation,
    TopicSeedContract,
    ValidatedTopicAliasExpansion,
    build_expected_trusted_topic_alias_expansion,
    build_topic_seed,
    build_trusted_topic_alias_registry,
    canonical_topic_sha256,
    match_visible_statistical_topic,
    normalize_topic_phrase,
    product_topic_phrases,
    retrieval_phrases_for_country,
    trusted_topic_alias_registry,
    validate_expected_trusted_topic_alias_expansion,
    validate_alias_expansion,
)


pytestmark = pytest.mark.contract


def _scope(*country_codes: str) -> ConfirmedMarketScope:
    return ConfirmedMarketScope(
        scope_label="Baltic countries" if len(country_codes) > 1 else "Estonia",
        country_codes=country_codes,
        confirmed=True,
    )


def _goal(*anchors: str) -> ImmutableGoalTopicFields:
    return ImmutableGoalTopicFields(
        goal_id="cat-food-estonia",
        title="Cat Food Sales Launch in Estonia",
        problem_scope="Assess Estonia's cat-food market and official demand data.",
        desired_outcome="A grounded commercial launch decision.",
        mission="Validate demand, pricing, channels, and risks.",
        industry="Pet food",
        exact_topic_anchors=anchors,
    )


def _seed_and_scope(*country_codes: str):
    scope = _scope(*(country_codes or ("EE", "LV")))
    return build_topic_seed(_goal("cat food"), scope), scope


def test_product_topic_projection_excludes_pr40_benchmark_and_process_anchors():
    goal = ImmutableGoalTopicFields(
        goal_id="pr40",
        title="PR40 Production E2E — Estonia Cat Food Evidence & Commercial Launch",
        problem_scope=(
            "Produce a launch plan for selling cat food in Estonia, outperforming "
            "the prior Opus baseline quality score of 72. This requires verified "
            "local demand, statutory requirements, and defensible unit economics."
        ),
        desired_outcome="Comprehensive PRD with quality score >= 80.",
        industry="other",
        target_user=(
            "Estonian commercial launch steering committee, pet food distributors, "
            "retail partners, and the execution team."
        ),
    )
    seed = build_topic_seed(goal, _scope("EE"))

    phrases = product_topic_phrases(seed)

    assert phrases == ("cat food",)
    assert not any(
        marker in phrase
        for phrase in phrases
        for marker in ("baseline", "quality", "score", "unit economics", "statutory")
    )


def test_product_topic_projection_excludes_verification_qualifier_from_title():
    seed = build_topic_seed(
        ImmutableGoalTopicFields(
            goal_id="pr42",
            title="PR42 Production E2E — Estonia Cat Food Verified Launch",
            problem_scope=(
                "Verify current Estonia-specific cat food demand, official "
                "statistics, and a first-party offer."
            ),
            desired_outcome="A verified commercial cat food launch decision.",
            industry="other",
            target_user="Estonian cat-food category buyers.",
        ),
        _scope("EE"),
    )

    assert product_topic_phrases(seed) == ("cat food",)


def test_product_topic_projection_excludes_closed_commercially_adverb():
    seed = build_topic_seed(
        ImmutableGoalTopicFields(
            goal_id="commercially-workflow",
            title="Cat Food Commercially Verified",
            problem_scope="Validate current offers.",
        ),
        _scope("EE"),
    )

    assert product_topic_phrases(seed) == ("cat food",)


def test_explicit_commercially_brand_anchor_remains_exact():
    seed = build_topic_seed(
        ImmutableGoalTopicFields(
            goal_id="commercially-brand",
            title="Commercially Yours cat food launch",
            problem_scope="Validate current offers.",
            exact_topic_anchors=("Commercially Yours",),
        ),
        _scope("EE"),
    )

    assert product_topic_phrases(seed) == ("commercially yours",)


def test_product_topic_projection_excludes_closed_trailing_research_workflow():
    seed = build_topic_seed(
        ImmutableGoalTopicFields(
            goal_id="pr44",
            title=(
                "PR44 Production E2E: launch cat food sales in Estonia using "
                "Advanced Grounded Deep research."
            ),
            problem_scope="Validate current cat food offers.",
            industry="other",
            target_user="Estonian cat owners.",
        ),
        _scope("EE"),
    )

    assert product_topic_phrases(seed) == ("cat food",)
    assert "using advanced" not in seed.exact_goal_anchors


def test_closed_research_workflow_is_not_reintroduced_by_copied_mission():
    production_title = (
        "PR44 Production E2E: launch cat food sales in Estonia using Advanced "
        "Grounded Deep research."
    )
    seed = build_topic_seed(
        ImmutableGoalTopicFields(
            goal_id="pr44-copied-mission",
            title=production_title,
            mission=production_title,
            problem_scope="Validate current cat food offers.",
            industry="other",
        ),
        _scope("EE"),
    )

    assert product_topic_phrases(seed) == ("cat food",)
    assert "using advanced" not in seed.exact_goal_anchors


def test_real_product_phrase_named_using_advanced_is_not_pruned():
    seed = build_topic_seed(
        ImmutableGoalTopicFields(
            goal_id="advanced-materials",
            title="Using Advanced Materials for aerospace launch",
            problem_scope="Validate current offers for advanced materials.",
            industry="other",
        ),
        _scope("EE"),
    )

    assert product_topic_phrases(seed) == ("using advanced materials",)


def test_explicit_anchor_inside_workflow_wording_remains_exact():
    seed = build_topic_seed(
        ImmutableGoalTopicFields(
            goal_id="explicit-advanced",
            title="Cat food using Advanced Grounded Deep research",
            problem_scope="Validate cat food using advanced methods.",
            exact_topic_anchors=("using advanced",),
        ),
        _scope("EE"),
    )

    assert product_topic_phrases(seed) == ("using advanced",)


def test_inferred_brand_prefix_named_verified_is_not_pruned():
    seed = build_topic_seed(
        ImmutableGoalTopicFields(
            goal_id="verified-brand",
            title="Verified Choice cat food launch",
            problem_scope="Validate pricing for Verified Choice cat food.",
            industry="other",
            target_user="Category buyers.",
        ),
        _scope("EE"),
    )

    assert product_topic_phrases(seed) == ("verified choice cat food",)


@pytest.mark.parametrize(
    ("title", "expected"),
    [
        ("Cat-food verified launch", "cat-food"),
        ("Children's furniture verified launch", "children's furniture"),
    ],
)
def test_title_qualifier_pruning_preserves_exact_punctuation(title, expected):
    seed = build_topic_seed(
        ImmutableGoalTopicFields(
            goal_id="punctuation-topic",
            title=title,
            problem_scope="Validate current retail offers.",
            industry="other",
            target_user="Category buyers.",
        ),
        _scope("EE"),
    )

    assert product_topic_phrases(seed) == (expected,)


def test_product_topic_projection_does_not_broaden_title_category():
    seed = build_topic_seed(
        ImmutableGoalTopicFields(
            goal_id="cat-not-dog",
            title="Cat food launch",
            problem_scope="Assess cat food demand.",
            industry="Pet food",
            target_user="Pet food buyers",
        ),
        _scope("EE"),
    )

    assert product_topic_phrases(seed) == ("cat food",)


@pytest.mark.parametrize(
    ("product_name", "country_code", "scope_label"),
    [
        ("Quality Street chocolate", "GB", "United Kingdom"),
        ("Unit 13 furniture", "US", "United States"),
        ("kassitoit", "EE", "Estonia"),
        ("Verified Choice cat food", "EE", "Estonia"),
    ],
)
def test_explicit_product_anchor_is_never_mutated_by_language_stop_words(
    product_name, country_code, scope_label
):
    seed = build_topic_seed(
        ImmutableGoalTopicFields(
            goal_id=f"exact-product-{country_code.casefold()}",
            title=f"{product_name} commercial launch",
            problem_scope="Validate pricing and demand.",
            exact_topic_anchors=(product_name,),
        ),
        ConfirmedMarketScope(
            scope_label=scope_label,
            country_codes=(country_code,),
            confirmed=True,
        ),
    )

    assert product_topic_phrases(seed) == (normalize_topic_phrase(product_name),)


def test_localized_process_prose_cannot_become_evidence_product_topic():
    seed = build_topic_seed(
        ImmutableGoalTopicFields(
            goal_id="localized-process-only",
            title="Estonia commercial evidence launch",
            problem_scope=(
                "Võrdle varasemat kvaliteediskoori ja ühikute ökonoomikat."
            ),
            desired_outcome="Koosta kontrollitud tegevuskava.",
            industry="other",
            target_user="Juhtkomitee ja täitmismeeskond",
        ),
        _scope("EE"),
    )

    assert product_topic_phrases(seed) == ()


def test_generic_title_falls_back_to_typed_industry_topic():
    seed = build_topic_seed(
        ImmutableGoalTopicFields(
            goal_id="industry-fallback",
            title="Commercial market launch",
            problem_scope="Validate pricing and demand.",
            industry="Furniture",
        ),
        ConfirmedMarketScope(
            scope_label="United States", country_codes=("US",), confirmed=True
        ),
    )

    assert product_topic_phrases(seed) == ("furniture",)


def _alias(
    phrase: str,
    *,
    country_code: str = "EE",
    language_code: str = "et",
    source_anchor: str = "cat food",
    relation: str = "direct_translation",
    usage: str = "evidence_and_retrieval",
    back_translation: str | None = None,
    acceptance_basis: str = "trusted_lexicon",
) -> dict[str, str]:
    return {
        "phrase": phrase,
        "country_code": country_code,
        "language_code": language_code,
        "source_anchor": source_anchor,
        "relation": relation,
        "usage": usage,
        "acceptance_basis": acceptance_basis,
        "back_translation": back_translation or source_anchor,
    }


def _expansion(seed, scope, aliases):
    payload = TopicAliasExpansionPayload(
        schema_version=TOPIC_CONTRACT_SCHEMA_VERSION,
        seed_sha256=seed.seed_sha256,
        aliases=aliases,
    )
    trusted_entries = [
        alias
        for alias in aliases
        if alias.get("acceptance_basis") in {"trusted_lexicon", "human_confirmed"}
    ]
    registry = None
    if trusted_entries:
        registry = build_trusted_topic_alias_registry(
            registry_id="test-topic-lexicon",
            registry_version="1",
            entries=[
                {
                    key: value
                    for key, value in alias.items()
                    if key not in {"usage"}
                }
                for alias in trusted_entries
            ],
        )
    return validate_alias_expansion(
        seed,
        payload,
        market_scope=scope,
        trusted_registry=registry,
    )


def test_nfkc_casefold_normalization_and_seed_hash_are_canonical():
    assert normalize_topic_phrase("  ＣＡＴ\u00a0Food  ") == "cat food"
    assert normalize_topic_phrase("STRASSE") == normalize_topic_phrase("Straße")
    assert unicodedata.is_normalized("NFKC", normalize_topic_phrase("ＣＡＴ"))

    scope_a = ConfirmedMarketScope(
        scope_label="Baltic   countries",
        country_codes=("LV", "EE", "EE"),
    )
    scope_b = ConfirmedMarketScope(
        scope_label="Baltic countries",
        country_codes=("EE", "LV"),
    )
    goal_a = _goal("ＣＡＴ  FOOD")
    goal_b = _goal("cat food")

    assert build_topic_seed(goal_a, scope_a) == build_topic_seed(goal_b, scope_b)


def test_seed_hash_is_bound_to_immutable_goal_and_confirmed_scope():
    estonia_seed = build_topic_seed(_goal(), _scope("EE"))
    latvia_seed = build_topic_seed(_goal(), ConfirmedMarketScope(
        scope_label="Latvia", country_codes=("LV",)
    ))
    changed_goal = _goal("cat food").model_copy(
        update={"mission": "Validate feline nutrition demand and risks."}
    )

    assert estonia_seed.seed_sha256 != latvia_seed.seed_sha256
    assert estonia_seed.seed_sha256 != build_topic_seed(
        changed_goal, _scope("EE")
    ).seed_sha256

    dumped = estonia_seed.model_dump(mode="json")
    dumped["goal_id"] = "tampered"
    with pytest.raises(ValidationError, match="seed_sha256"):
        TopicSeedContract.model_validate(dumped)


def test_dynamic_cat_food_anchors_come_from_exact_immutable_spans():
    goal = ImmutableGoalTopicFields(
        goal_id="dynamic-cat-food",
        title="Commercial Cat Food Sales Launch in Estonia",
        problem_scope="Assess cat food demand and retail pricing.",
        industry="Pet food",
        target_user="Retail buyer",
    )

    seed = build_topic_seed(goal, _scope("EE"))

    assert seed.exact_goal_anchors == ("cat food", "pet food")
    assert {binding.source_field for binding in seed.anchor_bindings} == {
        "title",
        "industry",
    }
    assert all(
        binding.derivation == "deterministic_contiguous_run"
        for binding in seed.anchor_bindings
    )


def test_hyphenated_dynamic_anchor_preserves_exact_immutable_span():
    goal = ImmutableGoalTopicFields(
        goal_id="hyphenated-pet-food",
        title="Commercial launch",
        problem_scope="Assess current demand.",
        industry="general",
        target_user="Pet-food category buyer",
    )

    seed = build_topic_seed(goal, _scope("EE"))

    binding = next(
        row
        for row in seed.anchor_bindings
        if row.phrase == "pet-food category buyer"
    )
    normalized_source = normalize_topic_phrase(goal.target_user)
    assert binding.phrase == "pet-food category buyer"
    assert binding.phrase == normalized_source[
        binding.normalized_start : binding.normalized_end
    ]
    assert "pet food category buyer" not in seed.exact_goal_anchors


def test_every_anchor_binding_phrase_equals_its_normalized_source_span():
    goal = ImmutableGoalTopicFields(
        goal_id="all-binding-spans",
        title="Cat-food and feline nutrition launch",
        problem_scope="Assess cat-food demand, channel fit, and buyer needs.",
        desired_outcome="A feline-nutrition decision framework.",
        mission="Ground cat-food distribution evidence.",
        industry="Pet food",
        target_user="Pet-food category buyer",
    )

    seed = build_topic_seed(goal, _scope("EE"))

    assert seed.anchor_bindings
    for binding in seed.anchor_bindings:
        normalized_source = normalize_topic_phrase(
            str(getattr(goal, binding.source_field))
        )
        assert binding.phrase == normalized_source[
            binding.normalized_start : binding.normalized_end
        ]


def test_dynamic_bremen_ai_consulting_excludes_market_and_function_words():
    goal = ImmutableGoalTopicFields(
        goal_id="bremen-ai-consulting",
        title="Bremen Commercial AI Consulting GTM",
        problem_scope=(
            "Bremen SMBs require tailored GDPR-compliant AI consulting services."
        ),
        desired_outcome="Complete AI consulting launch.",
        mission="Sell AI consulting services.",
        industry="AI consulting",
        target_user="SMB decision makers",
    )
    scope = ConfirmedMarketScope(
        scope_label="Bremen, Germany",
        country_codes=("DE",),
        geography_terms=("Bremen",),
    )

    seed = build_topic_seed(goal, scope)

    assert seed.exact_goal_anchors == ("ai consulting",)
    assert seed.anchor_bindings[0].source_field == "title"


def test_dynamic_generic_only_input_fails_closed():
    goal = ImmutableGoalTopicFields(
        goal_id="generic-only",
        title="Official Retail Market Research in Estonia",
        problem_scope="Assess latest sales, price, demand, growth, and turnover.",
        desired_outcome="Actionable commercial plan.",
        mission="Validate the market.",
        industry="general",
        target_user="consumer",
    )

    with pytest.raises(ValueError, match="fail closed"):
        build_topic_seed(goal, _scope("EE"))


def test_explicit_anchor_must_be_an_exact_immutable_source_span():
    with pytest.raises(ValueError, match="must occur"):
        build_topic_seed(_goal("motor vehicles"), _scope("EE"))


@pytest.mark.parametrize(
    "anchor",
    ["Estonia", "EE", "Baltic countries", "market research", "sales launch"],
)
def test_geography_and_generic_only_goal_anchors_fail_closed(anchor):
    with pytest.raises(ValueError, match="geography-only or generic-only"):
        build_topic_seed(_goal(anchor), _scope("EE", "LV"))


def test_cat_food_contract_rejects_motor_vehicle_table():
    seed, _ = _seed_and_scope("EE")

    result = match_visible_statistical_topic(
        seed,
        {
            "title": "Retail trade in Estonia",
            "caption": "Monthly official statistics",
            "series": ["Sale of motor vehicles"],
            "dimensions": ["Current prices", "EUR"],
        },
        country_code="EE",
    )

    assert result.matched is False
    assert result.diagnostic_code == "no_visible_exact_topic_match"
    assert result.matched_phrase is None
    assert result.source_anchor is None


def test_english_pet_food_is_positive_only_on_exact_visible_boundary():
    seed, _ = _seed_and_scope("EE")

    positive = match_visible_statistical_topic(
        seed,
        {"title": "Retail sales of Pet Food by month"},
        country_code="EE",
    )
    substring_only = match_visible_statistical_topic(
        seed,
        {"title": "Retail sales from pet foodstuff stores"},
        country_code="EE",
    )

    assert positive.matched is True
    assert positive.diagnostic_code == "matched_visible_exact_topic"
    assert positive.matched_phrase == "pet food"
    assert positive.relation == TopicMatchRelation.EXACT_GOAL_ANCHOR
    assert substring_only.matched is False


def test_punctuation_requires_an_explicit_surface_form_but_wraps_are_boundaries():
    seed, _ = _seed_and_scope("EE")

    assert match_visible_statistical_topic(
        seed,
        {"caption": "Turnover (pet food), current prices"},
        country_code="EE",
    ).matched
    assert not match_visible_statistical_topic(
        seed,
        {"caption": "Turnover of pet-food"},
        country_code="EE",
    ).matched


def test_estonian_direct_translations_match_visible_series_and_dimension():
    seed, scope = _seed_and_scope("EE")
    expansion = _expansion(
        seed,
        scope,
        [
            _alias(
                "lemmikloomatoidu",
                source_anchor="pet food",
                back_translation="Pet Food",
            ),
            _alias("kassitoit"),
        ],
    )

    pet_food = match_visible_statistical_topic(
        seed,
        {"series": ["Lemmikloomatoidu jaemüük"]},
        country_code="EE",
        expansion=expansion,
    )
    cat_food = match_visible_statistical_topic(
        seed,
        {"dimension": {"Kaubagrupp": "Kassitoit"}},
        country_code="EE",
        expansion=expansion,
    )

    assert pet_food.matched is True
    assert pet_food.matched_phrase == "lemmikloomatoidu"
    assert pet_food.source_anchor == "pet food"
    assert pet_food.relation == TopicMatchRelation.DIRECT_TRANSLATION
    assert cat_food.matched is True
    assert cat_food.visible_field == "dimension"
    assert cat_food.matched_phrase == "kassitoit"


def test_country_scoped_estonian_alias_does_not_apply_to_latvia():
    seed, scope = _seed_and_scope("EE", "LV")
    expansion = _expansion(seed, scope, [_alias("kassitoit")])

    assert match_visible_statistical_topic(
        seed,
        {"series": "Kassitoit"},
        country_code="EE",
        expansion=expansion,
    ).matched
    assert not match_visible_statistical_topic(
        seed,
        {"series": "Kassitoit"},
        country_code="LV",
        expansion=expansion,
    ).matched


def test_hidden_metadata_footer_and_surrounding_text_are_never_matched():
    seed, _ = _seed_and_scope("EE")

    result = match_visible_statistical_topic(
        seed,
        {
            "title": "Sale of motor vehicles",
            "series": ["Passenger cars"],
            "footer": "Pet food and cat food",
            "hidden": {"topic": "pet food"},
            "metadata": "cat food",
            "source_description": "Official cat food statistics",
        },
        country_code="EE",
    )

    assert result.matched is False


def test_broader_synonym_is_retrieval_only_and_cannot_prove_relevance():
    seed, scope = _seed_and_scope("EE")
    expansion = _expansion(
        seed,
        scope,
        [
            _alias(
                "animal supplies",
                source_anchor="pet food",
                relation="broader_synonym",
                usage="retrieval_only",
                acceptance_basis="model_proposed",
                back_translation="pet food",
            )
        ],
    )

    assert "animal supplies" in retrieval_phrases_for_country(
        seed, country_code="EE", expansion=expansion
    )
    assert not match_visible_statistical_topic(
        seed,
        {"caption": "Animal supplies retail turnover"},
        country_code="EE",
        expansion=expansion,
    ).matched


def test_surface_form_is_explicit_and_evidence_eligible():
    seed, scope = _seed_and_scope("EE")
    expansion = _expansion(
        seed,
        scope,
        [
            _alias(
                "pet-food",
                language_code="en",
                source_anchor="pet food",
                relation="surface_form",
                back_translation="pet food",
            )
        ],
    )

    result = match_visible_statistical_topic(
        seed,
        {"caption": "Pet-food retail turnover"},
        country_code="EE",
        expansion=expansion,
    )

    assert result.matched
    assert result.relation == TopicMatchRelation.SURFACE_FORM


def test_expansion_hash_is_canonical_and_tampering_is_rejected():
    seed, scope = _seed_and_scope("EE")
    forward = _expansion(
        seed,
        scope,
        [_alias("kassitoit"), _alias("lemmikloomatoidu", source_anchor="pet food")],
    )
    reverse = _expansion(
        seed,
        scope,
        [_alias("lemmikloomatoidu", source_anchor="pet food"), _alias("kassitoit")],
    )
    assert forward == reverse

    dumped = forward.model_dump(mode="json")
    dumped["aliases"][1]["phrase"] = "mootorsõidukid"
    with pytest.raises(ValidationError, match="expansion_sha256"):
        ValidatedTopicAliasExpansion.model_validate(dumped)


def test_expected_registry_expansion_is_country_seed_and_hash_bound():
    seed, scope = _seed_and_scope("EE")

    expansion = build_expected_trusted_topic_alias_expansion(seed, scope)

    assert expansion is not None
    assert [(row.phrase, row.source_anchor) for row in expansion.aliases] == [
        ("kassitoit", "cat food")
    ]
    assert "kassitoit" in retrieval_phrases_for_country(
        seed,
        country_code="EE",
        expansion=expansion,
        product_only=True,
    )
    assert validate_expected_trusted_topic_alias_expansion(
        seed, scope, expansion.model_dump(mode="json")
    ) == expansion


def test_production_registry_version_has_an_explicit_pinned_hash():
    assert (
        trusted_topic_alias_registry().registry_sha256
        == TRUSTED_TOPIC_ALIAS_REGISTRY_SHA256
    )


def test_global_ee_lv_expansion_filters_aliases_per_country():
    seed, scope = _seed_and_scope("EE", "LV")
    expansion = build_expected_trusted_topic_alias_expansion(seed, scope)

    assert expansion is not None
    assert [(row.country_code, row.phrase) for row in expansion.aliases] == [
        ("EE", "kassitoit")
    ]
    assert "kassitoit" in retrieval_phrases_for_country(
        seed,
        country_code="EE",
        expansion=expansion,
        product_only=True,
    )
    assert "kassitoit" not in retrieval_phrases_for_country(
        seed,
        country_code="LV",
        expansion=expansion,
        product_only=True,
    )
    assert match_visible_statistical_topic(
        seed,
        {"series": "Kassitoit"},
        country_code="EE",
        expansion=expansion,
        source_anchors=("cat food",),
    ).matched
    assert not match_visible_statistical_topic(
        seed,
        {"series": "Kassitoit"},
        country_code="LV",
        expansion=expansion,
        source_anchors=("cat food",),
    ).matched


def test_expected_registry_expansion_is_absent_for_wrong_country():
    seed, scope = _seed_and_scope("LV")

    assert build_expected_trusted_topic_alias_expansion(seed, scope) is None


def test_recomputed_model_alias_cannot_replace_expected_trusted_expansion():
    seed, scope = _seed_and_scope("EE")
    model_expansion = _expansion(
        seed,
        scope,
        [
            _alias(
                "kassitoit",
                usage="retrieval_only",
                acceptance_basis="model_proposed",
            )
        ],
    )

    with pytest.raises(ValueError, match="independently derived"):
        validate_expected_trusted_topic_alias_expansion(
            seed, scope, model_expansion
        )


def test_applicable_expected_registry_expansion_cannot_be_omitted():
    seed, scope = _seed_and_scope("EE")

    with pytest.raises(ValueError, match="is missing"):
        validate_expected_trusted_topic_alias_expansion(seed, scope, None)


def test_self_rehashed_alias_tamper_does_not_become_expected_registry_truth():
    seed, scope = _seed_and_scope("EE")
    expected = build_expected_trusted_topic_alias_expansion(seed, scope)
    assert expected is not None
    tampered = expected.model_dump(mode="json")
    tampered["aliases"][0]["phrase"] = "koeratoit"
    tampered["expansion_sha256"] = canonical_topic_sha256(
        {
            key: tampered.get(key)
            for key in (
                "schema_version",
                "seed_sha256",
                "aliases",
                "trusted_registry_id",
                "trusted_registry_version",
                "trusted_registry_sha256",
            )
        }
    )
    self_consistent = ValidatedTopicAliasExpansion.model_validate(tampered)

    with pytest.raises(ValueError, match="independently derived"):
        validate_expected_trusted_topic_alias_expansion(
            seed, scope, self_consistent
        )


def test_expected_registry_builder_rejects_seed_scope_mismatch():
    seed, _ = _seed_and_scope("EE")
    wrong_scope = ConfirmedMarketScope(
        scope_label="Latvia", country_codes=("LV",), confirmed=True
    )

    with pytest.raises(ValueError, match="countries do not match"):
        build_expected_trusted_topic_alias_expansion(seed, wrong_scope)


def test_unrelated_seed_cannot_accept_a_foreign_alias_expansion():
    cat_seed, cat_scope = _seed_and_scope("EE")
    cat_expansion = build_expected_trusted_topic_alias_expansion(
        cat_seed, cat_scope
    )
    furniture_scope = _scope("EE")
    furniture_seed = build_topic_seed(
        ImmutableGoalTopicFields(
            goal_id="furniture-ee",
            title="Children's furniture launch",
            exact_topic_anchors=("children's furniture",),
        ),
        furniture_scope,
    )
    assert build_expected_trusted_topic_alias_expansion(
        furniture_seed, furniture_scope
    ) is None

    with pytest.raises(ValueError, match="not applicable"):
        validate_expected_trusted_topic_alias_expansion(
            furniture_seed, furniture_scope, cat_expansion
        )


def test_expansion_rejects_malformed_schema_model_and_unknown_fields():
    seed, _ = _seed_and_scope("EE")
    base = {
        "schema_version": TOPIC_CONTRACT_SCHEMA_VERSION,
        "seed_sha256": seed.seed_sha256,
        "aliases": [],
    }

    with pytest.raises(ValidationError):
        TopicAliasExpansionPayload.model_validate(
            {**base, "schema_version": "research_topic_contract_v999"}
        )
    with pytest.raises(ValidationError, match="extra_forbidden"):
        TopicAliasExpansionPayload.model_validate({**base, "model": "gemini"})
    with pytest.raises(ValidationError):
        TopicAliasExpansionPayload.model_validate(
            {**base, "aliases": [{**_alias("kassitoit"), "relation": "fuzzy"}]}
        )


def test_expansion_rejects_country_anchor_backtranslation_and_generic_abuse():
    seed, scope = _seed_and_scope("EE", "LV")

    with pytest.raises(ValueError, match="outside confirmed scope"):
        _expansion(seed, scope, [_alias("kassitoit", country_code="DE")])
    with pytest.raises(ValueError, match="exact immutable goal anchor"):
        _expansion(
            seed,
            scope,
            [_alias("kassitoit", source_anchor="motor vehicles")],
        )
    with pytest.raises(ValueError, match="back_translation"):
        _expansion(
            seed,
            scope,
            [_alias("kassitoit", back_translation="motor vehicles")],
        )
    with pytest.raises(ValueError, match="geography-only or generic-only"):
        _expansion(seed, scope, [_alias("market research")])


def test_broader_synonym_cannot_claim_evidence_usage():
    seed, _ = _seed_and_scope("EE")
    with pytest.raises(ValidationError, match="retrieval_only"):
        TopicAliasExpansionPayload(
            schema_version=TOPIC_CONTRACT_SCHEMA_VERSION,
            seed_sha256=seed.seed_sha256,
            aliases=[
                _alias(
                    "animal supplies",
                    relation="broader_synonym",
                    usage="evidence_and_retrieval",
                    acceptance_basis="model_proposed",
                )
            ],
        )


def test_self_relabelled_trusted_alias_without_external_registry_is_rejected():
    seed, scope = _seed_and_scope("EE")
    candidate = _alias("mootorsõidukid")
    payload = TopicAliasExpansionPayload(
        schema_version=TOPIC_CONTRACT_SCHEMA_VERSION,
        seed_sha256=seed.seed_sha256,
        aliases=[candidate],
    )

    with pytest.raises(ValueError, match="separately supplied trusted registry"):
        validate_alias_expansion(seed, payload, market_scope=scope)


def test_model_proposed_direct_translation_is_retrieval_only():
    seed, scope = _seed_and_scope("EE")
    expansion = _expansion(
        seed,
        scope,
        [
            _alias(
                "mootorsõidukid",
                usage="retrieval_only",
                acceptance_basis="model_proposed",
            )
        ],
    )

    assert "mootorsõidukid" in retrieval_phrases_for_country(
        seed, country_code="EE", expansion=expansion
    )
    assert not match_visible_statistical_topic(
        seed,
        {"series": "Mootorsõidukid"},
        country_code="EE",
        expansion=expansion,
    ).matched


def test_expansion_length_count_and_per_country_caps_fail_closed():
    seed, scope = _seed_and_scope("EE")

    with pytest.raises(ValidationError):
        TopicAliasExpansionPayload(
            schema_version=TOPIC_CONTRACT_SCHEMA_VERSION,
            seed_sha256=seed.seed_sha256,
            aliases=[_alias("x" * (MAX_TOPIC_PHRASE_CHARS + 1))],
        )
    with pytest.raises(ValidationError):
        TopicAliasExpansionPayload(
            schema_version=TOPIC_CONTRACT_SCHEMA_VERSION,
            seed_sha256=seed.seed_sha256,
            aliases=[
                _alias(f"cat food alias {index}")
                for index in range(MAX_ALIASES + 1)
            ],
        )

    too_many_for_ee = [
        _alias(f"cat food alias {index}")
        for index in range(MAX_ALIASES_PER_COUNTRY + 1)
    ]
    with pytest.raises(ValueError, match="aliases for EE"):
        _expansion(seed, scope, too_many_for_ee)


def test_unconfirmed_or_malformed_country_scope_is_rejected():
    with pytest.raises(ValidationError):
        ConfirmedMarketScope(
            scope_label="Estonia", country_codes=("ZZ",), confirmed=True
        )
    with pytest.raises(ValidationError):
        ConfirmedMarketScope(
            scope_label="Estonia", country_codes=("EE",), confirmed=False
        )


def test_confirmed_balkans_scope_accepts_operational_kosovo_code():
    scope = ConfirmedMarketScope(
        scope_label="Balkans (proposed commercial scope)",
        country_codes=(
            "AL",
            "BA",
            "BG",
            "HR",
            "GR",
            "XK",
            "ME",
            "MK",
            "RO",
            "RS",
            "SI",
        ),
        confirmed=True,
        geography_terms=("Kosovo",),
    )

    seed = build_topic_seed(
        ImmutableGoalTopicFields(
            goal_id="balkans-cat-food",
            title="Commercial cat food launch in the Balkans",
            industry="Pet food",
        ),
        scope,
    )

    assert "XK" in seed.confirmed_country_codes
    assert "cat food" in seed.exact_goal_anchors


def test_matcher_rejects_country_outside_seed_and_expansion_from_other_seed():
    ee_seed, ee_scope = _seed_and_scope("EE")
    lv_scope = ConfirmedMarketScope(scope_label="Latvia", country_codes=("LV",))
    lv_seed = build_topic_seed(_goal(), lv_scope)
    lv_expansion = _expansion(
        lv_seed,
        lv_scope,
        [_alias("kassitoit", country_code="LV")],
    )

    with pytest.raises(ValueError, match="outside the confirmed topic scope"):
        match_visible_statistical_topic(
            ee_seed, {"title": "Pet food"}, country_code="LV"
        )
    with pytest.raises(ValueError, match="different topic seed"):
        match_visible_statistical_topic(
            ee_seed,
            {"title": "Pet food"},
            country_code="EE",
            expansion=lv_expansion,
        )

    # Keep this variable exercised: validation requires exact scope binding.
    assert ee_scope.country_codes == ("EE",)
