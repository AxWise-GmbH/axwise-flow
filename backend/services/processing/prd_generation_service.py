"""
PRD generation service.
"""

import logging
from typing import Dict, Any, List, Mapping, Optional
import json
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from fastapi import HTTPException

from backend.services.llm import LLMServiceFactory
from backend.models import CachedPRD, User
from backend.services.research_quality_service import (
    COMMERCIAL_MARKET_LAUNCH,
    _strict_iso_country_code_values,
    clean_semantic_text,
    normalize_research_prd_type,
    validate_research_prd,
)
from backend.services.llm.prompts.tasks.prd_generation import PRDGenerationPrompts

logger = logging.getLogger(__name__)

_MAX_REPAIR_CANDIDATE_BYTES = 128_000
_MAX_PUBLISHABLE_PRD_BYTES = 256_000
_MAX_TERMINAL_VALIDATION_ISSUES = 16
_MAX_TERMINAL_ISSUE_CODE_BYTES = 96
_MAX_TERMINAL_ISSUE_MESSAGE_BYTES = 512
_MAX_ERROR_BYTES = 12_000
_OBSERVED_PRICE_DIFFERENCE_KEY = "observed_pack_price_difference"
_OBSERVED_PRICE_DIFFERENCE_FORMULA = (
    "observed_pack_price_difference = higher_observed_pack_price - "
    "lower_observed_pack_price"
)
_TYPED_CALCULATION_KEYS = {
    "calculation_kind",
    "formula",
    "input_bindings",
    "input_claim_ids",
}
_MARKET_SCOPE_ISSUE_PRIORITY = {
    "commercial_market_scope_countries_invalid": 0,
    "commercial_market_scope_target_geography_invalid": 1,
    "commercial_market_scope_country_conflict": 2,
    "commercial_market_scope_key_invalid": 3,
}


def _truncate_utf8(value: Any, max_bytes: int) -> str:
    encoded = str(value or "").encode("utf-8")
    if len(encoded) <= max_bytes:
        return encoded.decode("utf-8")
    return encoded[:max_bytes].decode("utf-8", errors="ignore")


def _strict_json_object(
    candidate: Any,
    *,
    max_bytes: int,
    label: str,
) -> Dict[str, Any]:
    """Return one bounded canonical strict-JSON object."""

    if not isinstance(candidate, dict):
        raise ValueError(f"{label} must be a JSON object")

    def validate_json_shape(value: Any, ancestors: set[int]) -> None:
        if isinstance(value, dict):
            identity = id(value)
            if identity in ancestors:
                raise ValueError(f"{label} contains a cycle")
            if any(not isinstance(key, str) for key in value):
                raise ValueError(f"{label} has a non-string key")
            ancestors.add(identity)
            try:
                for child in value.values():
                    validate_json_shape(child, ancestors)
            finally:
                ancestors.remove(identity)
            return
        if isinstance(value, list):
            identity = id(value)
            if identity in ancestors:
                raise ValueError(f"{label} contains a cycle")
            ancestors.add(identity)
            try:
                for child in value:
                    validate_json_shape(child, ancestors)
            finally:
                ancestors.remove(identity)
            return
        if value is None or isinstance(value, (str, int, float, bool)):
            return
        raise ValueError(f"{label} is not strict JSON")

    validate_json_shape(candidate, set())
    try:
        serialized = json.dumps(
            candidate,
            allow_nan=False,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
    except (TypeError, ValueError, OverflowError, RecursionError) as exc:
        raise ValueError(f"{label} is not strict JSON") from exc
    if len(serialized.encode("utf-8")) > max_bytes:
        raise ValueError(f"{label} exceeds the publishable limit")
    return json.loads(serialized)


def _strict_json_model_candidate(candidate: Any) -> Dict[str, Any]:
    """Canonicalize untrusted model output before it can be validated."""

    canonical = _strict_json_object(
        candidate,
        max_bytes=_MAX_PUBLISHABLE_PRD_BYTES,
        label="Commercial PRD model output",
    )
    # Metadata is service-owned. Validate the model-supplied value as strict
    # JSON above, then discard it before the service constructs its own record.
    canonical.pop("metadata", None)
    return canonical


def _canonicalize_observed_price_difference_key(
    candidate: Dict[str, Any],
) -> Dict[str, Any]:
    """Rename one unambiguous exact typed calculation to its schema key.

    Gemini may reproduce the immutable four-field calculation exactly while
    naming its containing property descriptively.  The property name carries
    no evidence authority, so the service may canonicalize that one label only
    when there is no collision or competing formula-like child.  IDs, fact
    bindings, values, and formula content remain untouched and must still pass
    the full semantic validator.
    """

    commercial = candidate.get("commercial_prd")
    if not isinstance(commercial, dict):
        return candidate
    pricing = commercial.get("pricing_and_unit_economics")
    if not isinstance(pricing, dict) or _OBSERVED_PRICE_DIFFERENCE_KEY in pricing:
        return candidate

    formula_like_children = []
    for key, value in pricing.items():
        is_formula_like = key in _TYPED_CALCULATION_KEYS or (
            isinstance(value, Mapping)
            and bool(set(value).intersection(_TYPED_CALCULATION_KEYS))
        )
        if is_formula_like:
            formula_like_children.append((key, value))
    if len(formula_like_children) != 1:
        return candidate

    source_key, calculation = formula_like_children[0]
    if (
        not isinstance(calculation, dict)
        or set(calculation) != _TYPED_CALCULATION_KEYS
        or calculation.get("calculation_kind")
        != _OBSERVED_PRICE_DIFFERENCE_KEY
        or calculation.get("formula") != _OBSERVED_PRICE_DIFFERENCE_FORMULA
    ):
        return candidate
    pricing[_OBSERVED_PRICE_DIFFERENCE_KEY] = pricing.pop(source_key)
    return candidate


def _project_reviewed_observed_sku_competitors(
    candidate: Dict[str, Any],
) -> Dict[str, Any]:
    """Keep only exact signed SKU pairs in reviewed competitor containers."""

    commercial = candidate.get("commercial_prd")
    competitors = (
        commercial.get("competitors") if isinstance(commercial, Mapping) else None
    )
    if not isinstance(competitors, list):
        return candidate
    for competitor in competitors:
        if isinstance(competitor, dict) and "observed_skus" in competitor:
            observed_skus = competitor["observed_skus"]
            competitor.clear()
            competitor["observed_skus"] = observed_skus
    return candidate


def _project_immutable_market_scope_countries(
    candidate: Dict[str, Any],
    critical_claim_quality: Optional[Mapping[str, Any]],
) -> Dict[str, Any]:
    """Fill only an absent country key from the server-owned request scope.

    The model may describe the market while omitting the machine-readable ISO
    list required by every jurisdiction-bound evidence adapter.  Supplying the
    already-validated acquisition scope is a structural projection, not a
    provenance claim: present model values are never overwritten, and the full
    semantic validator still requires exact equality before publication.
    """

    immutable_countries = _strict_iso_country_code_values(
        (critical_claim_quality or {}).get("requested_country_codes")
    )
    if not immutable_countries:
        return candidate
    commercial = candidate.get("commercial_prd")
    market_scope = (
        commercial.get("market_scope") if isinstance(commercial, Mapping) else None
    )
    if isinstance(market_scope, dict) and "countries" not in market_scope:
        market_scope["countries"] = sorted(immutable_countries)
    return candidate


def _canonicalize_legacy_market_scope_target_geography(
    candidate: Dict[str, Any],
) -> Dict[str, Any]:
    """Remove unprovable claim metadata from one legacy geography wrapper.

    Older commercial candidates wrapped ``target_geography`` in the generic
    traceable-value shape.  Country authority now comes only from the immutable
    request scope, so retaining those claim IDs would falsely imply that an
    unrelated evidence claim proves the geography.  Accept only the exact
    legacy shape, preserve its raw statement verbatim for strict validation,
    and discard the redundant IDs before publication.
    """

    commercial = candidate.get("commercial_prd")
    market_scope = (
        commercial.get("market_scope") if isinstance(commercial, Mapping) else None
    )
    if not isinstance(market_scope, dict):
        return candidate
    target_geography = market_scope.get("target_geography")
    if (
        not isinstance(target_geography, Mapping)
        or set(target_geography) != {"statement", "claim_ids"}
    ):
        return candidate
    statement = target_geography.get("statement")
    claim_ids = target_geography.get("claim_ids")
    if (
        not isinstance(statement, str)
        or not statement.strip()
        or not isinstance(claim_ids, list)
        or not claim_ids
        or any(not isinstance(claim_id, str) or not claim_id for claim_id in claim_ids)
        or len(set(claim_ids)) != len(claim_ids)
    ):
        return candidate
    market_scope["target_geography"] = statement
    return candidate


def _strict_json_publishable_prd(candidate: Any) -> Dict[str, Any]:
    """Bound the complete result, including service metadata and validation."""

    return _strict_json_object(
        candidate,
        max_bytes=_MAX_PUBLISHABLE_PRD_BYTES,
        label="Final commercial PRD",
    )


def _bounded_validation_summary(validation: Optional[Mapping[str, Any]]) -> Dict[str, Any]:
    raw_issues = [
        item
        for item in (validation or {}).get("issues") or []
        if isinstance(item, Mapping)
    ]
    bounded = [
        {
            "code": _truncate_utf8(
                item.get("code"), _MAX_TERMINAL_ISSUE_CODE_BYTES
            ),
            "message": _truncate_utf8(
                item.get("message"), _MAX_TERMINAL_ISSUE_MESSAGE_BYTES
            ),
        }
        for item in raw_issues
    ]
    bounded.sort(
        key=lambda item: (
            _MARKET_SCOPE_ISSUE_PRIORITY.get(
                item["code"],
                4 if item["code"].startswith("commercial_market_scope_") else 5,
            ),
            item["message"],
            item["code"],
        )
    )
    return {
        "issue_count": int(
            (validation or {}).get("issue_count") or len(raw_issues)
        ),
        "issues": bounded[:_MAX_TERMINAL_VALIDATION_ISSUES],
    }


def _bounded_json_repair_candidate(
    candidate: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Return strict JSON model output for repair without service metadata.

    Repair is best-effort when a provider returns a cyclic, non-JSON, or
    unexpectedly large dictionary. The semantic validator still fails closed;
    the second attempt then receives its exact issue list without an unsafe or
    unbounded copy of the first response.
    """

    model_candidate = {
        str(key): value
        for key, value in candidate.items()
        if str(key) != "metadata"
    }
    try:
        serialized = json.dumps(
            model_candidate,
            allow_nan=False,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
    except (TypeError, ValueError, OverflowError, RecursionError):
        logger.warning("Omitting non-JSON commercial PRD repair candidate")
        return None
    if len(serialized.encode("utf-8")) > _MAX_REPAIR_CANDIDATE_BYTES:
        logger.warning("Omitting oversized commercial PRD repair candidate")
        return None
    return json.loads(serialized)


class PRDGenerationService:
    """
    Service for generating Product Requirements Documents (PRDs) from analysis results.
    """

    def __init__(
        self,
        db: Optional[Session] = None,
        llm_service=None,
        user: Optional[User] = None,
    ):
        """
        Initialize the PRD generation service.

        Args:
            db: Database session for caching PRDs
            llm_service: LLM service to use for PRD generation
            user: User model instance for usage tracking
        """
        self.db = db
        self.user = user
        self.llm_service = llm_service or LLMServiceFactory.create("enhanced_gemini")
        logger.info(
            f"Initialized PRDGenerationService with {self.llm_service.__class__.__name__}"
        )

    async def generate_prd(
        self,
        analysis_results: Dict[str, Any],
        prd_type: str = "both",
        industry: Optional[str] = None,
        result_id: Optional[int] = None,
        force_regenerate: bool = False,
        document_intent: Optional[str] = None,
        critical_claim_quality: Optional[Dict[str, Any]] = None,
        repair_feedback: Optional[List[Dict[str, str]]] = None,
    ) -> Dict[str, Any]:
        """
        Generate a PRD from analysis results.

        Args:
            analysis_results: Analysis results containing themes, patterns, insights, and personas
            prd_type: Type of PRD to generate ("operational", "technical", or "both")
            industry: Optional industry context
            result_id: ID of the analysis result (for caching)
            force_regenerate: Whether to force regeneration even if cached version exists

        Returns:
            Generated PRD
        """
        terminal_validation_summary: Optional[Dict[str, Any]] = None
        try:
            # Check if user can generate PRD
            if self.db and self.user:
                from backend.services.usage_tracking_service import UsageTrackingService

                usage_service = UsageTrackingService(self.db, self.user)

                can_generate = await usage_service.can_generate_prd()
                if not can_generate:
                    raise HTTPException(
                        status_code=403,
                        detail="You have reached your monthly PRD generation limit. Please upgrade your subscription to continue.",
                    )

            semantic_intent = normalize_research_prd_type(document_intent or prd_type)
            # The legacy DB column is a short storage discriminator. Semantic
            # intent lives in metadata and must not overflow that cache key.
            cache_type = prd_type if prd_type in {"operational", "technical", "both"} else "operational"

            # Check cache first if database session is available and not forcing regeneration
            if self.db and result_id and not force_regenerate:
                cached_prd = self._get_cached_prd(result_id, cache_type)
                if cached_prd:
                    logger.info(
                        f"Using cached PRD for result_id: {result_id}, prd_type: {prd_type}"
                    )
                    # Ensure normalized shape even for older cached PRDs
                    try:
                        normalized = self._normalize_operational_prd(
                            dict(cached_prd.prd_data)
                        )
                    except Exception:
                        normalized = cached_prd.prd_data
                    validation = validate_research_prd(
                        normalized,
                        prd_type=semantic_intent,
                        critical_claim_quality=critical_claim_quality,
                    )
                    if validation["status"] == "passed":
                        return normalized

            logger.info(
                f"Generating {prd_type} PRD for result_id: {result_id or 'unknown'}"
            )

            # Extract relevant data from analysis results
            themes = analysis_results.get("themes", [])
            patterns = analysis_results.get("patterns", [])
            insights = analysis_results.get("insights", [])
            personas = analysis_results.get("personas", [])

            # Get original text if available
            original_text = analysis_results.get("original_text", "")

            # Prepare request data for LLM
            prompt_data = {
                "text": original_text,
                "themes": themes,
                "patterns": patterns,
                "insights": insights,
                "personas": personas,
                "prd_type": prd_type,
                "document_intent": semantic_intent,
                "critical_claim_quality": critical_claim_quality or {},
                "repair_feedback": repair_feedback or [],
                "industry": industry,
            }
            request_data = {
                "task": "prd_generation",
                "text": "",
                "themes": themes,
                "patterns": patterns,
                "insights": insights,
                "personas": personas,
                "prd_type": prd_type,
                "document_intent": semantic_intent,
                "critical_claim_quality": critical_claim_quality or {},
                "repair_feedback": repair_feedback or [],
                "industry": industry,
                "enforce_json": True,  # Flag to enforce JSON output
            }

            validation = None
            prd_data = None
            repair_candidate = None
            attempts = 2 if semantic_intent == COMMERCIAL_MARKET_LAUNCH else 1
            for attempt in range(attempts):
                logger.info("Calling LLM to generate PRD (attempt %s/%s)", attempt + 1, attempts)
                request_data["repair_feedback"] = (
                    list((validation or {}).get("issues") or [])
                    if attempt
                    else (repair_feedback or [])
                )
                prompt_data["repair_feedback"] = request_data["repair_feedback"]
                prompt_data["repair_candidate"] = repair_candidate
                request_data["text"] = PRDGenerationPrompts.get_prompt(prompt_data)
                llm_response = await self.llm_service.analyze(request_data)
                try:
                    raw_candidate = _strict_json_model_candidate(
                        self._parse_llm_response(llm_response)
                    )
                    if semantic_intent == COMMERCIAL_MARKET_LAUNCH:
                        # Only the reviewed, non-semantic structural projections
                        # may precede validation. Validate the raw
                        # strict JSON before presentation cleanup so Markdown,
                        # LaTeX, controls, or altered machine identifiers can
                        # never be cleaned into a valid signed identity,
                        # formula, binding, or claim ID.
                        raw_candidate = _project_reviewed_observed_sku_competitors(
                            raw_candidate
                        )
                        raw_candidate = _project_immutable_market_scope_countries(
                            raw_candidate,
                            critical_claim_quality,
                        )
                        raw_candidate = (
                            _canonicalize_legacy_market_scope_target_geography(
                                raw_candidate
                            )
                        )
                        raw_candidate = _canonicalize_observed_price_difference_key(
                            raw_candidate
                        )
                        raw_validation = validate_research_prd(
                            raw_candidate,
                            prd_type=semantic_intent,
                            critical_claim_quality=critical_claim_quality,
                        )
                        if raw_validation["status"] != "passed":
                            validation = raw_validation
                            repair_candidate = _bounded_json_repair_candidate(
                                raw_candidate
                            )
                            continue
                    candidate = _strict_json_model_candidate(
                        clean_semantic_text(raw_candidate)
                    )
                except (TypeError, ValueError, OverflowError, RecursionError):
                    validation = {
                        "status": "blocked",
                        "issue_count": 1,
                        "issues": [
                            {
                                "code": "commercial_prd_json_invalid",
                                "message": (
                                    "Commercial PRD model output must be a bounded "
                                    "strict-JSON object with string keys and finite values."
                                ),
                            }
                        ],
                    }
                    repair_candidate = None
                    continue
                candidate["metadata"] = {
                    "generated_from": {
                        "themes_count": len(themes),
                        "patterns_count": len(patterns),
                        "insights_count": len(insights),
                        "personas_count": len(personas),
                    },
                    "prd_type": semantic_intent,
                    "industry": industry,
                    "generation_attempts": attempt + 1,
                }
                if semantic_intent != COMMERCIAL_MARKET_LAUNCH:
                    candidate = self._normalize_operational_prd(candidate)
                validation = validate_research_prd(
                    candidate,
                    prd_type=semantic_intent,
                    critical_claim_quality=critical_claim_quality,
                )
                if validation["status"] == "passed":
                    prd_data = candidate
                    break
                if semantic_intent == COMMERCIAL_MARKET_LAUNCH:
                    # The failed model JSON is untrusted repair data, not system
                    # authority. Keep it separate from service-owned metadata so
                    # the bounded second attempt edits the model schema it emitted.
                    repair_candidate = _bounded_json_repair_candidate(candidate)
            if prd_data is None:
                terminal_validation_summary = _bounded_validation_summary(validation)
                raise ValueError(
                    "Research PRD semantic validation failed after bounded same-model repair: "
                    + json.dumps(
                        terminal_validation_summary,
                        ensure_ascii=False,
                        sort_keys=True,
                        separators=(",", ":"),
                    )
                )
            prd_data["metadata"]["validation"] = validation
            # The model candidate was bounded before service-owned metadata.
            # Re-canonicalize the complete durable object so metadata or
            # validation overhead cannot cross the same publication limit.
            prd_data = _strict_json_publishable_prd(prd_data)

            # Cache the PRD if database session is available
            if self.db and result_id:
                self._cache_prd(result_id, cache_type, prd_data)

            logger.info(f"Successfully generated PRD with type: {prd_type}")
            return prd_data

        except Exception as e:
            bounded_error = _truncate_utf8(str(e), _MAX_ERROR_BYTES)
            logger.error("Error generating PRD: %s", bounded_error)
            # Fail closed. A generic operational/software fallback must never
            # be published as a completed commercial research document.
            result = {
                "error": f"Failed to generate PRD: {bounded_error}",
                "prd_type": document_intent or prd_type,
                "status": "blocked",
            }
            if terminal_validation_summary is not None:
                result["validation"] = terminal_validation_summary
            return result

    def _extract_json_candidate(self, text: str) -> Optional[str]:
        """Best-effort extraction of a JSON object from free text.
        - Prefer fenced ```json ... ``` blocks
        - Else, find the longest balanced {...} region
        """
        if not text:
            return None
        # 1) Fenced code block
        fence = "```"
        if fence in text:
            # Try ```json
            start = text.find("```json")
            if start != -1:
                start = start + len("```json")
                end = text.find("```", start)
                if end != -1:
                    candidate = text[start:end].strip()
                    return candidate if candidate else None
            # Try any fenced block
            start = text.find(fence)
            if start != -1:
                start = start + len(fence)
                end = text.find(fence, start)
                if end != -1:
                    candidate = text[start:end].strip()
                    return candidate if candidate else None
        # 2) Longest balanced braces
        first = text.find("{")
        last = text.rfind("}")
        if first != -1 and last != -1 and last > first:
            segment = text[first : last + 1]
            # Scan for last index where braces are balanced
            depth = 0
            best_idx = -1
            for i, ch in enumerate(segment):
                if ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        best_idx = i
            if best_idx != -1:
                return segment[: best_idx + 1]
        return None

    def _parse_llm_response(self, response: Any) -> Dict[str, Any]:
        """
        Parse LLM response into a PRD dictionary.

        Args:
            response: LLM response

        Returns:
            Parsed PRD dictionary
        """
        try:
            # Handle different response formats
            if isinstance(response, dict):
                # If response is already a dictionary
                if "prd_type" in response:
                    return response
                elif "text" in response:
                    # Try to parse JSON from text with tolerant extraction
                    candidate = self._extract_json_candidate(response.get("text", ""))
                    if candidate:
                        try:
                            return json.loads(candidate)
                        except json.JSONDecodeError:
                            logger.warning(
                                "Failed to parse extracted JSON from response text"
                            )
                    logger.warning(
                        "Failed to parse JSON from response text; using fallback"
                    )
                    return self._create_fallback_prd(response.get("text", ""))
            elif isinstance(response, str):
                # Try to parse JSON from string with tolerant extraction
                candidate = self._extract_json_candidate(response)
                if candidate:
                    try:
                        return json.loads(candidate)
                    except json.JSONDecodeError:
                        logger.warning(
                            "Failed to parse extracted JSON from response string"
                        )
                logger.warning(
                    "Failed to parse JSON from response string; using fallback"
                )
                return self._create_fallback_prd(response)

            # If we can't parse the response, return a fallback PRD
            logger.warning(f"Unexpected response format: {type(response)}")
            return self._create_fallback_prd(str(response))

        except Exception as e:
            logger.error(f"Error parsing LLM response: {str(e)}")
            return self._create_fallback_prd("Error parsing LLM response")

    def _normalize_operational_prd(self, prd_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Ensure operational_prd contains 'brd' and 'implementation_blueprint' keys.

        - Map legacy top-level fields into brd if missing
        - Scaffold empty implementation_blueprint if missing
        - Preserve existing top-level fields for frontend compatibility
        """
        try:
            op = prd_data.get("operational_prd")
            if not isinstance(op, dict):
                return prd_data

            # 1) Build BRD if missing
            if "brd" not in op or not isinstance(op.get("brd"), dict):
                objectives = op.get("objectives") or []
                scope = op.get("scope") or {"included": [], "excluded": []}
                user_stories = op.get("user_stories") or []
                requirements = op.get("requirements") or []
                success_metrics = op.get("success_metrics") or []

                # Transform user_stories -> stakeholder_scenarios with justification placeholder
                stakeholder_scenarios = []
                for us in user_stories:
                    if not isinstance(us, dict):
                        continue
                    scenario_text = us.get("story") or us.get("scenario") or ""
                    acceptance = us.get("acceptance_criteria") or []
                    justification = us.get("justification") or {
                        "linked_theme": "",
                        "impact_score": "",
                        "frequency": 0.0,
                        "evidence_quotes": [],
                    }
                    stakeholder_scenarios.append(
                        {
                            "scenario": scenario_text,
                            "acceptance_criteria": acceptance,
                            "justification": justification,
                        }
                    )

                # Transform requirements -> core_specifications
                core_specifications = []
                for req in requirements:
                    if not isinstance(req, dict):
                        continue
                    core_specifications.append(
                        {
                            "id": req.get("id", ""),
                            "specification": req.get("title")
                            or req.get("description")
                            or "",
                            "priority": req.get("priority", ""),
                            "weighting": {
                                "impact_score": (req.get("weighting", {}) or {}).get(
                                    "impact_score", ""
                                ),
                                "frequency": (req.get("weighting", {}) or {}).get(
                                    "frequency", 0.0
                                ),
                                "priority_basis": "Impact x Frequency",
                            },
                            "related_scenarios": req.get("related_user_stories") or [],
                        }
                    )

                op["brd"] = {
                    "objectives": objectives,
                    "scope": scope,
                    "stakeholder_scenarios": stakeholder_scenarios,
                    "core_specifications": core_specifications,
                    "success_metrics": success_metrics,
                }

            # 2) Build Implementation Blueprint if missing
            if "implementation_blueprint" not in op or not isinstance(
                op.get("implementation_blueprint"), dict
            ):
                op["implementation_blueprint"] = {
                    "solution_overview": "",
                    "solution_structure": [],
                    "core_components_and_methodology": [],
                    "key_implementation_tasks": [],
                    "quality_assurance_and_validation": [],
                    "stakeholder_success_plan": {},
                    "tiered_solution_models": [],
                }

            prd_data["operational_prd"] = op
            return prd_data
        except Exception as e:
            logger.warning(f"Normalization of operational_prd failed: {e}")
            return prd_data

    def _get_cached_prd(self, result_id: int, prd_type: str) -> Optional[CachedPRD]:
        """
        Get a cached PRD from the database.

        Args:
            result_id: ID of the analysis result
            prd_type: Type of PRD to retrieve

        Returns:
            Cached PRD if found, None otherwise
        """
        try:
            if not self.db:
                return None

            cached_prd = (
                self.db.query(CachedPRD)
                .filter(
                    CachedPRD.result_id == result_id, CachedPRD.prd_type == prd_type
                )
                .first()
            )

            return cached_prd
        except SQLAlchemyError as e:
            logger.error(f"Error retrieving cached PRD: {str(e)}")
            return None

    def _cache_prd(
        self, result_id: int, prd_type: str, prd_data: Dict[str, Any]
    ) -> bool:
        """
        Cache a PRD in the database.

        Args:
            result_id: ID of the analysis result
            prd_type: Type of PRD to cache
            prd_data: PRD data to cache

        Returns:
            True if caching was successful, False otherwise
        """
        try:
            if not self.db:
                return False

            # Check if a cached PRD already exists
            existing_prd = (
                self.db.query(CachedPRD)
                .filter(
                    CachedPRD.result_id == result_id, CachedPRD.prd_type == prd_type
                )
                .first()
            )

            if existing_prd:
                # Update existing cached PRD
                existing_prd.prd_data = prd_data
                existing_prd.updated_at = datetime.utcnow()
                self.db.commit()
                logger.info(
                    f"Updated cached PRD for result_id: {result_id}, prd_type: {prd_type}"
                )
            else:
                # Create new cached PRD
                cached_prd = CachedPRD(
                    result_id=result_id,
                    prd_type=prd_type,
                    prd_data=prd_data,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow(),
                )
                self.db.add(cached_prd)
                self.db.commit()
                logger.info(
                    f"Created cached PRD for result_id: {result_id}, prd_type: {prd_type}"
                )

            return True
        except SQLAlchemyError as e:
            logger.error(f"Error caching PRD: {str(e)}")
            self.db.rollback()
            return False

    def _create_fallback_prd(self, text: str) -> Dict[str, Any]:
        """
        Create a fallback PRD when parsing fails.

        Args:
            text: Raw text from LLM

        Returns:
            Fallback PRD dictionary
        """
        logger.info("Creating fallback PRD")

        # Try to extract some content from the text
        objectives = []
        lines = text.split("\n")
        for line in lines:
            if "objective" in line.lower() or "goal" in line.lower():
                objectives.append(
                    {"title": "Extracted Objective", "description": line.strip()}
                )

        if not objectives:
            objectives = [
                {
                    "title": "Fallback Objective",
                    "description": "Improve user experience based on research insights",
                }
            ]

        return {
            "prd_type": "both",
            "operational_prd": {
                "objectives": objectives,
                "scope": {
                    "included": ["Features based on user research"],
                    "excluded": ["Features not supported by research"],
                },
                "user_stories": [
                    {
                        "story": "As a user, I want to accomplish my goals efficiently so that I can be more productive",
                        "acceptance_criteria": [
                            "Given I am using the application",
                            "When I perform an action",
                            "Then I should see the expected result",
                        ],
                        "what": "Efficient user interface",
                        "why": "Improves user productivity",
                        "how": "Implement based on research findings",
                    }
                ],
                "requirements": [
                    {
                        "id": "REQ-001",
                        "title": "User-Centered Design",
                        "description": "The application should follow user-centered design principles",
                        "priority": "High",
                        "related_user_stories": ["US-001"],
                    }
                ],
                "success_metrics": [
                    {
                        "metric": "User Satisfaction",
                        "target": "90% positive feedback",
                        "measurement_method": "User surveys",
                    }
                ],
            },
            "technical_prd": {
                "objectives": objectives,
                "scope": {
                    "included": ["Core functionality"],
                    "excluded": ["Advanced features for future releases"],
                },
                "architecture": {
                    "overview": "Standard web application architecture",
                    "components": [
                        {
                            "name": "Frontend",
                            "purpose": "User interface",
                            "interactions": ["Communicates with backend API"],
                        },
                        {
                            "name": "Backend",
                            "purpose": "Business logic and data processing",
                            "interactions": ["Communicates with database"],
                        },
                    ],
                    "data_flow": "Frontend → Backend → Database",
                },
                "implementation_requirements": [
                    {
                        "id": "TECH-001",
                        "title": "Performance Optimization",
                        "description": "Ensure application responds within 2 seconds",
                        "priority": "High",
                        "dependencies": [],
                    }
                ],
                "testing_validation": [
                    {
                        "test_type": "Performance Testing",
                        "description": "Measure response times under load",
                        "success_criteria": "95% of requests complete within 2 seconds",
                    }
                ],
                "success_metrics": [
                    {
                        "metric": "Response Time",
                        "target": "< 2 seconds",
                        "measurement_method": "Automated performance tests",
                    }
                ],
            },
        }
