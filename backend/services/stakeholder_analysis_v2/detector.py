"""
Stakeholder Detector Module

Handles stakeholder detection and profiling with clear separation of concerns.
Extracts stakeholder detection logic from the monolithic service.
"""

from typing import List, Dict, Any, Optional
import logging

from backend.domain.interfaces.llm_unified import ILLMService
from backend.schemas import DetectedStakeholder
from backend.models.stakeholder_models import StakeholderDetector as LegacyDetector

logger = logging.getLogger(__name__)


class StakeholderDetector:
    """
    Modular stakeholder detector that handles identification and profiling
    of stakeholders from interview data.
    """

    def __init__(self, llm_service: ILLMService):
        self.llm_service = llm_service
        self.legacy_detector = LegacyDetector()

    async def detect_stakeholders(
        self,
        files: List[Any],
        base_analysis: Any,
        personas: Optional[List[Dict[str, Any]]] = None,
    ) -> List[DetectedStakeholder]:
        """
        Detect stakeholders from interview files and personas.

        Args:
            files: Interview files to analyze
            base_analysis: Base analysis result for context
            personas: Optional personas for stakeholder mapping

        Returns:
            List of detected stakeholders
        """
        logger.info("Starting stakeholder detection")

        detected_stakeholders = []

        try:
            # Strategy 1: Extract from personas if available
            if personas:
                persona_stakeholders = await self._extract_from_personas(personas)
                detected_stakeholders.extend(persona_stakeholders)
                logger.info(
                    f"Extracted {len(persona_stakeholders)} stakeholders from personas"
                )

            # Strategy 2: LLM-based detection from content
            if self.llm_service and len(detected_stakeholders) < 2:
                content = self._extract_content_from_files(files)
                if len(content) > 100:
                    llm_stakeholders = await self._detect_with_llm(
                        content, base_analysis
                    )
                    detected_stakeholders.extend(llm_stakeholders)
                    logger.info(
                        f"Detected {len(llm_stakeholders)} stakeholders via LLM"
                    )

            # Strategy 3: Pattern-based fallback
            if len(detected_stakeholders) < 2:
                pattern_result = self.legacy_detector.detect_multi_stakeholder_data(
                    files,
                    (
                        base_analysis.model_dump()
                        if hasattr(base_analysis, "model_dump")
                        else base_analysis
                    ),
                )
                if pattern_result.detected_stakeholders:
                    mapped = []
                    for item in pattern_result.detected_stakeholders:
                        try:
                            mapped.append(self._to_schema_stakeholder(item))
                        except Exception as e:
                            logger.warning(
                                f"Failed to map pattern stakeholder to schema: {e}"
                            )
                    detected_stakeholders.extend(mapped)
                    logger.info(f"Detected {len(mapped)} stakeholders via patterns")

            # Deduplicate and validate
            unique_stakeholders = self._deduplicate_stakeholders(detected_stakeholders)
            validated_stakeholders = self._validate_stakeholders(unique_stakeholders)

            logger.info(f"Final stakeholder count: {len(validated_stakeholders)}")
            return validated_stakeholders

        except Exception as e:
            logger.error(f"Stakeholder detection failed: {e}")
            return []

    async def _extract_from_personas(
        self, personas: List[Dict[str, Any]]
    ) -> List[DetectedStakeholder]:
        """Extract stakeholders from persona data and map to schema."""
        stakeholders: List[DetectedStakeholder] = []

        for i, persona in enumerate(personas):
            try:
                # Extract and normalize stakeholder type
                raw_type = self._extract_stakeholder_type(persona)
                stakeholder_type = self._normalize_stakeholder_type(raw_type)
                stakeholder_id = f"stakeholder_{i+1}"

                # Build schema-compliant stakeholder
                demographic_profile: Optional[Dict[str, Any]] = None
                if isinstance(persona.get("demographics"), dict):
                    demographic_profile = persona.get("demographics")
                elif isinstance(persona.get("demographics"), str):
                    demographic_profile = {"raw": persona.get("demographics")}

                stakeholder = DetectedStakeholder(
                    stakeholder_id=stakeholder_id,
                    stakeholder_type=stakeholder_type,
                    confidence_score=0.9,  # High confidence from persona data
                    demographic_profile=demographic_profile,
                    individual_insights={
                        "name": persona.get("name", f"Stakeholder {i+1}"),
                        "role": persona.get("role", "Unknown"),
                        "influence_level": self._calculate_influence_level(persona),
                        "key_concerns": self._extract_key_concerns(persona),
                        "source": "persona_extraction",
                    },
                )
                stakeholders.append(stakeholder)

            except Exception as e:
                logger.warning(f"Failed to extract stakeholder from persona {i}: {e}")
                continue

        return stakeholders

    async def _detect_with_llm(
        self, content: str, base_analysis: Any
    ) -> List[DetectedStakeholder]:
        """Use LLM to detect stakeholders from content."""
        try:
            # Use the existing LLM detection logic from the legacy detector
            from backend.models.stakeholder_models import (
                StakeholderDetector as LegacyDetector,
            )

            llm_detected = await LegacyDetector.detect_real_stakeholders_with_llm(
                content, self.llm_service, base_analysis
            )

            results: List[DetectedStakeholder] = []
            for item in llm_detected or []:
                try:
                    results.append(self._to_schema_stakeholder(item))
                except Exception as e:
                    logger.warning(f"Failed to map LLM stakeholder to schema: {e}")
            return results

        except Exception as e:
            logger.error(f"LLM stakeholder detection failed: {e}")
            return []

    def _extract_content_from_files(self, files: List[Any]) -> str:
        """Extract text content from files for analysis."""
        content_parts: List[str] = []

        for file in files:
            try:
                if hasattr(file, "read"):
                    content = file.read()
                    if isinstance(content, bytes):
                        content = content.decode("utf-8", errors="ignore")
                    content_parts.append(content)
                elif isinstance(file, str):
                    content_parts.append(file)
                elif isinstance(file, dict) and "content" in file:
                    content_parts.append(str(file["content"]))
            except Exception as e:
                logger.warning(f"Failed to extract content from file: {e}")
                continue

        return "\n\n".join(content_parts)

    def _extract_stakeholder_type(self, persona: Dict[str, Any]) -> str:
        """Extract stakeholder type from persona data."""
        # Look for stakeholder intelligence data
        if isinstance(persona.get("stakeholder_intelligence"), dict):
            stakeholder_type = persona["stakeholder_intelligence"].get(
                "stakeholder_type"
            )
            if stakeholder_type and stakeholder_type != "primary_customer":
                return stakeholder_type

        # Fallback to role or demographics
        role = persona.get("role", "")
        if role:
            return role

        demographics = persona.get("demographics", {})
        if isinstance(demographics, dict):
            return demographics.get("role", "Unknown Stakeholder")
        elif isinstance(demographics, str):
            return demographics

        return "Unknown Stakeholder"

    def _calculate_influence_level(self, persona: Dict[str, Any]) -> float:
        """Calculate influence level based on persona data."""
        # Simple heuristic based on available data
        base_influence = 0.5

        # Boost for leadership roles
        role = persona.get("role", "").lower()
        if any(
            keyword in role
            for keyword in ["manager", "director", "lead", "head", "ceo", "cto"]
        ):
            base_influence += 0.3

        # Boost for detailed personas (more evidence = more influence)
        evidence_count = 0
        for field in [
            "goals_and_motivations",
            "challenges_and_frustrations",
            "key_quotes",
        ]:
            field_data = persona.get(field, {})
            if isinstance(field_data, dict) and field_data.get("evidence"):
                evidence_count += len(field_data["evidence"])

        if evidence_count > 5:
            base_influence += 0.2

        return min(base_influence, 1.0)

    def _normalize_stakeholder_type(self, label: str) -> str:
        """Map free-form labels/roles to allowed stakeholder_type literals.
        Allowed values: primary_customer, secondary_user, decision_maker, influencer.
        """
        if not label:
            return "primary_customer"
        l = str(label).lower()
        if any(
            k in l
            for k in [
                "owner",
                "manager",
                "director",
                "head",
                "lead",
                "cxo",
                "chief",
                "vp",
                "decision",
            ]
        ):
            return "decision_maker"
        if any(k in l for k in ["influenc", "advisor", "consultant", "evangelist"]):
            return "influencer"
        if any(
            k in l
            for k in [
                "developer",
                "engineer",
                "analyst",
                "qa",
                "tester",
                "designer",
                "admin",
                "operator",
                "support",
            ]
        ):
            return "secondary_user"
        if any(k in l for k in ["customer", "user", "end user", "buyer", "client"]):
            return "primary_customer"
        return "primary_customer"

    def _to_schema_stakeholder(self, item: Any) -> DetectedStakeholder:
        """Convert a loose dict or DetectedStakeholder-like object to schema DetectedStakeholder."""
        if isinstance(item, DetectedStakeholder):
            return item
        if not isinstance(item, dict):
            raise ValueError("Unsupported stakeholder item type")

        sid = item.get("stakeholder_id") or item.get("id") or "unknown"
        stype = self._normalize_stakeholder_type(
            item.get("stakeholder_type") or item.get("type") or ""
        )
        conf = item.get("confidence_score") or item.get("confidence") or 0.5
        demo = item.get("demographic_profile") or item.get("demographic_info") or None
        insights = item.get("individual_insights") or {}
        influence = item.get("influence_metrics") or {}
        evidence = item.get("authentic_evidence") or None

        # Ensure types are correct
        if demo is not None and not isinstance(demo, dict):
            demo = {"raw": str(demo)}
        if not isinstance(insights, dict):
            insights = {"raw": str(insights)}
        if not isinstance(influence, dict):
            influence = {}
        if evidence is not None and not isinstance(evidence, dict):
            evidence = {"quotes": [str(evidence)]}

        return DetectedStakeholder(
            stakeholder_id=sid,
            stakeholder_type=stype,
            confidence_score=float(conf),
            demographic_profile=demo,
            individual_insights=insights,
            influence_metrics={
                k: float(v) for k, v in influence.items() if isinstance(v, (int, float))
            },
            authentic_evidence=evidence,
        )

    def _extract_key_concerns(self, persona: Dict[str, Any]) -> List[str]:
        """Extract key concerns from persona data."""
        concerns = []

        # Extract from challenges
        challenges = persona.get("challenges_and_frustrations", {})
        if isinstance(challenges, dict) and challenges.get("value"):
            concerns.append(challenges["value"])
        elif isinstance(challenges, str):
            concerns.append(challenges)

        # Extract from goals
        goals = persona.get("goals_and_motivations", {})
        if isinstance(goals, dict) and goals.get("value"):
            concerns.append(f"Goal: {goals['value']}")
        elif isinstance(goals, str):
            concerns.append(f"Goal: {goals}")

        return concerns[:3]  # Limit to top 3 concerns

    def _deduplicate_stakeholders(
        self, stakeholders: List[DetectedStakeholder]
    ) -> List[DetectedStakeholder]:
        """Remove duplicate stakeholders based on normalized name (if present) and type."""
        seen = set()
        unique: List[DetectedStakeholder] = []

        for stakeholder in stakeholders:
            name = ""
            try:
                if isinstance(stakeholder.individual_insights, dict):
                    name = str(stakeholder.individual_insights.get("name", ""))
            except Exception:
                name = ""
            name_key = name.lower().strip() if isinstance(name, str) else ""
            type_key = str(stakeholder.stakeholder_type).lower()
            key = (name_key or stakeholder.stakeholder_id, type_key)
            if key not in seen:
                seen.add(key)
                unique.append(stakeholder)

        return unique

    def _validate_stakeholders(
        self, stakeholders: List[DetectedStakeholder]
    ) -> List[DetectedStakeholder]:
        """Validate and filter stakeholders according to schema fields."""
        valid: List[DetectedStakeholder] = []

        for stakeholder in stakeholders:
            try:
                has_id = bool(stakeholder.stakeholder_id)
                has_type = bool(stakeholder.stakeholder_type)
                conf_ok = 0.3 <= float(stakeholder.confidence_score) <= 1.0
                if has_id and has_type and conf_ok:
                    valid.append(stakeholder)
            except Exception:
                continue

        return valid
