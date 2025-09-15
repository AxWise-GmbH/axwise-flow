"""
Evidence Intelligence Engine

Main orchestration engine that coordinates all evidence intelligence modules
to provide a complete solution for evidence tracking, attribution, and validation.
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, Tuple
import logging
import asyncio
from datetime import datetime
from pathlib import Path
import json

from .context_analyzer import ContextAnalyzer, DocumentContext
from .speaker_intelligence import SpeakerIntelligence, SpeakerProfile
from .demographic_intelligence import DemographicIntelligence, DemographicData
from .evidence_attribution import EvidenceAttribution, AttributedEvidence, EvidenceType
from .validation_engine import ValidationEngine, ValidationResult, ValidationStatus

logger = logging.getLogger(__name__)


class ProcessingMetrics(BaseModel):
    """Metrics for processing performance"""

    total_speakers_identified: int = 0
    unique_speakers_created: int = 0
    demographics_extracted: int = 0
    evidence_pieces_found: int = 0
    evidence_validated: int = 0
    researcher_content_filtered: int = 0
    validation_success_rate: float = 0.0
    processing_time_seconds: float = 0.0
    errors_encountered: List[str] = Field(default_factory=list)


class EvidenceIntelligenceResult(BaseModel):
    """Complete result from evidence intelligence processing"""

    # Core results
    document_context: DocumentContext
    speakers: Dict[str, SpeakerProfile]
    demographics: Dict[str, DemographicData]
    attributed_evidence: List[AttributedEvidence]
    validation_results: Dict[str, ValidationResult]

    # Aggregated insights
    personas: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    themes: List[str] = Field(default_factory=list)
    pain_points: List[str] = Field(default_factory=list)
    needs: List[str] = Field(default_factory=list)

    # Processing metadata
    metrics: ProcessingMetrics
    processing_timestamp: datetime = Field(default_factory=datetime.utcnow)
    engine_version: str = "2.0.0"

    # Quality indicators
    overall_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    data_quality_score: float = Field(default=0.0, ge=0.0, le=1.0)
    completeness_score: float = Field(default=0.0, ge=0.0, le=1.0)


class EvidenceIntelligenceEngine:
    """
    Main orchestration engine for the Evidence Intelligence System.
    Coordinates all modules to provide complete evidence processing pipeline.
    """

    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the Evidence Intelligence Engine.

        Args:
            config: Configuration dictionary containing:
                - llm_services: Dictionary of LLM services
                - processing_options: Processing configuration
                - validation_options: Validation configuration
        """
        self.config = config
        self.llm_services = config.get("llm_services", {})

        # Get primary LLM service
        self.primary_llm = (
            list(self.llm_services.values())[0] if self.llm_services else None
        )

        # Initialize all modules
        self.context_analyzer = ContextAnalyzer(self.primary_llm)
        self.speaker_intelligence = SpeakerIntelligence(self.primary_llm)
        self.demographic_intelligence = DemographicIntelligence(self.primary_llm)
        self.evidence_attribution = EvidenceAttribution(self.primary_llm)
        self.validation_engine = ValidationEngine(self.llm_services)

        # Processing options
        self.enable_multi_llm = config.get("validation_options", {}).get(
            "multi_llm", True
        )
        self.strict_validation = config.get("validation_options", {}).get(
            "strict", True
        )
        self.min_confidence_threshold = config.get("processing_options", {}).get(
            "min_confidence", 0.7
        )

        logger.info(
            f"Evidence Intelligence Engine initialized with {len(self.llm_services)} LLM services"
        )

    async def process_transcript(
        self,
        transcript_text: str,
        metadata: Optional[Dict[str, Any]] = None,
        existing_personas: Optional[Dict[str, Any]] = None,
    ) -> EvidenceIntelligenceResult:
        """
        Process a transcript through the complete evidence intelligence pipeline.

        Args:
            transcript_text: Raw transcript text to process
            metadata: Optional metadata about the transcript
            existing_personas: Optional existing personas for augmentation

        Returns:
            Complete evidence intelligence result
        """
        start_time = datetime.utcnow()
        metrics = ProcessingMetrics()

        try:
            logger.info("Starting Evidence Intelligence processing pipeline")

            # Step 1: Analyze document context
            logger.info("Step 1: Analyzing document context...")
            document_context = await self.context_analyzer.analyze_document(
                transcript_text, metadata
            )

            # Step 2: Identify and separate speakers
            logger.info("Step 2: Identifying speakers with unique IDs...")
            speakers = await self.speaker_intelligence.identify_speakers(
                transcript_text, document_context
            )

            metrics.total_speakers_identified = len(speakers)
            metrics.unique_speakers_created = len(
                set(s.unique_identifier for s in speakers.values())
            )

            # Step 3: Extract demographics for each speaker
            logger.info("Step 3: Extracting demographic information...")
            demographics = await self.demographic_intelligence.extract_all_demographics(
                transcript_text, list(speakers.values())
            )

            metrics.demographics_extracted = len(demographics)

            # Step 4: Attribute evidence to speakers
            logger.info("Step 4: Attributing evidence to speakers...")
            attributed_evidence = await self.evidence_attribution.attribute_evidence(
                transcript_text, speakers, demographics
            )

            # Count researcher content that was filtered
            researcher_content = [
                e for e in attributed_evidence if e.is_researcher_content
            ]
            metrics.researcher_content_filtered = len(researcher_content)

            # Remove researcher content from final evidence
            attributed_evidence = [
                e for e in attributed_evidence if not e.is_researcher_content
            ]
            metrics.evidence_pieces_found = len(attributed_evidence)

            # Step 5: Validate evidence
            logger.info("Step 5: Validating evidence with multi-LLM verification...")
            validation_results = await self.validation_engine.batch_validate(
                attributed_evidence, transcript_text, parallel=True
            )

            # Calculate validation metrics
            verified_count = sum(
                1
                for v in validation_results.values()
                if v.status == ValidationStatus.VERIFIED
            )
            metrics.evidence_validated = verified_count
            metrics.validation_success_rate = (
                verified_count / len(attributed_evidence)
                if attributed_evidence
                else 0.0
            )

            # Step 6: Build personas from validated evidence
            logger.info("Step 6: Building personas from validated evidence...")
            personas = await self._build_personas(
                attributed_evidence,
                validation_results,
                speakers,
                demographics,
                existing_personas,
            )

            # Step 7: Extract themes and insights
            logger.info("Step 7: Extracting themes and insights...")
            themes, pain_points, needs = self._extract_insights(attributed_evidence)

            # Calculate quality scores
            overall_confidence = self._calculate_overall_confidence(
                validation_results, demographics, attributed_evidence
            )

            data_quality_score = self._calculate_data_quality(
                document_context, speakers, validation_results
            )

            completeness_score = self._calculate_completeness(
                demographics, attributed_evidence, validation_results
            )

            # Calculate processing time
            processing_time = (datetime.utcnow() - start_time).total_seconds()
            metrics.processing_time_seconds = processing_time

            logger.info(
                f"Evidence Intelligence processing complete in {processing_time:.2f}s"
            )
            logger.info(
                f"Results: {metrics.evidence_pieces_found} evidence pieces, "
                f"{metrics.evidence_validated} validated, "
                f"{metrics.researcher_content_filtered} researcher items filtered"
            )

            return EvidenceIntelligenceResult(
                document_context=document_context,
                speakers=speakers,
                demographics=demographics,
                attributed_evidence=attributed_evidence,
                validation_results=validation_results,
                personas=personas,
                themes=themes,
                pain_points=pain_points,
                needs=needs,
                metrics=metrics,
                overall_confidence=overall_confidence,
                data_quality_score=data_quality_score,
                completeness_score=completeness_score,
            )

        except Exception as e:
            logger.error(f"Error in evidence intelligence processing: {e}")
            metrics.errors_encountered.append(str(e))

            # Return partial results if possible
            return EvidenceIntelligenceResult(
                document_context=(
                    document_context
                    if "document_context" in locals()
                    else DocumentContext()
                ),
                speakers=speakers if "speakers" in locals() else {},
                demographics=demographics if "demographics" in locals() else {},
                attributed_evidence=(
                    attributed_evidence if "attributed_evidence" in locals() else []
                ),
                validation_results=(
                    validation_results if "validation_results" in locals() else {}
                ),
                metrics=metrics,
                overall_confidence=0.0,
                data_quality_score=0.0,
                completeness_score=0.0,
            )

    async def _build_personas(
        self,
        attributed_evidence: List[AttributedEvidence],
        validation_results: Dict[str, ValidationResult],
        speakers: Dict[str, SpeakerProfile],
        demographics: Dict[str, DemographicData],
        existing_personas: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Dict[str, Any]]:
        """Build or augment personas from validated evidence"""

        personas = existing_personas or {}

        # Group evidence by speaker
        speaker_evidence = {}
        for evidence in attributed_evidence:
            if evidence.speaker_id not in speaker_evidence:
                speaker_evidence[evidence.speaker_id] = []

            # Only include validated evidence in personas
            validation = validation_results.get(evidence.text)
            if validation and validation.status in [
                ValidationStatus.VERIFIED,
                ValidationStatus.PROBABLE,
            ]:
                speaker_evidence[evidence.speaker_id].append(evidence)

        # Build persona for each speaker
        for speaker_id, evidence_list in speaker_evidence.items():
            # Skip if no valid evidence
            if not evidence_list:
                continue

            # Get speaker profile and demographics
            speaker_profile = speakers.get(speaker_id)
            speaker_demographics = demographics.get(speaker_id)

            if not speaker_profile:
                continue

            # Create or update persona
            persona_id = f"persona_{speaker_id}"

            persona = {
                "id": persona_id,
                "speaker_id": speaker_id,
                "role": speaker_profile.role.value,
                "interview_session": speaker_profile.interview_session,
                # Demographics
                "age": speaker_demographics.age if speaker_demographics else None,
                "age_range": (
                    speaker_demographics.age_range if speaker_demographics else None
                ),
                "gender": speaker_demographics.gender if speaker_demographics else None,
                "location": (
                    speaker_demographics.location if speaker_demographics else None
                ),
                "profession": (
                    speaker_demographics.profession if speaker_demographics else None
                ),
                # Evidence summary
                "evidence_count": len(evidence_list),
                "validated_evidence_count": len(
                    [
                        e
                        for e in evidence_list
                        if validation_results.get(e.text, {}).status
                        == ValidationStatus.VERIFIED
                    ]
                ),
                # Key insights
                "pain_points": [
                    e.text
                    for e in evidence_list
                    if e.evidence_type == EvidenceType.PAIN_POINT
                ],
                "needs": [
                    e.text
                    for e in evidence_list
                    if e.evidence_type == EvidenceType.NEED
                ],
                "behaviors": [
                    e.text
                    for e in evidence_list
                    if e.evidence_type == EvidenceType.BEHAVIOR
                ],
                "preferences": [
                    e.text
                    for e in evidence_list
                    if e.evidence_type == EvidenceType.PREFERENCE
                ],
                # Themes
                "themes": list(set(theme for e in evidence_list for theme in e.themes)),
                # Metadata
                "created_at": datetime.utcnow().isoformat(),
                "confidence_score": (
                    speaker_demographics.overall_confidence
                    if speaker_demographics
                    else 0.5
                ),
            }

            # Merge with existing persona if provided
            if existing_personas and persona_id in existing_personas:
                existing = existing_personas[persona_id]
                # Merge evidence lists
                for key in ["pain_points", "needs", "behaviors", "preferences"]:
                    if key in existing:
                        persona[key] = list(set(persona[key] + existing.get(key, [])))
                # Update counts
                persona["evidence_count"] += existing.get("evidence_count", 0)

            personas[persona_id] = persona

        logger.info(f"Built {len(personas)} personas from validated evidence")
        return personas

    def _extract_insights(
        self, attributed_evidence: List[AttributedEvidence]
    ) -> Tuple[List[str], List[str], List[str]]:
        """Extract themes, pain points, and needs from evidence"""

        themes = set()
        pain_points = []
        needs = []

        for evidence in attributed_evidence:
            # Collect themes
            themes.update(evidence.themes)

            # Collect pain points
            if evidence.evidence_type == EvidenceType.PAIN_POINT:
                pain_points.append(evidence.text)

            # Collect needs
            if evidence.evidence_type == EvidenceType.NEED:
                needs.append(evidence.text)

        return list(themes), pain_points, needs

    def _calculate_overall_confidence(
        self,
        validation_results: Dict[str, ValidationResult],
        demographics: Dict[str, DemographicData],
        attributed_evidence: List[AttributedEvidence],
    ) -> float:
        """Calculate overall confidence score for the results"""

        confidence_scores = []

        # Validation confidence
        if validation_results:
            validation_confidences = [
                v.confidence_score for v in validation_results.values()
            ]
            if validation_confidences:
                confidence_scores.append(
                    sum(validation_confidences) / len(validation_confidences)
                )

        # Demographics confidence
        if demographics:
            demo_confidences = [d.overall_confidence for d in demographics.values()]
            if demo_confidences:
                confidence_scores.append(sum(demo_confidences) / len(demo_confidences))

        # Attribution confidence
        if attributed_evidence:
            attr_confidences = [e.confidence_score for e in attributed_evidence]
            if attr_confidences:
                confidence_scores.append(sum(attr_confidences) / len(attr_confidences))

        return (
            sum(confidence_scores) / len(confidence_scores)
            if confidence_scores
            else 0.0
        )

    def _calculate_data_quality(
        self,
        document_context: DocumentContext,
        speakers: Dict[str, SpeakerProfile],
        validation_results: Dict[str, ValidationResult],
    ) -> float:
        """Calculate data quality score"""

        quality_factors = []

        # Document structure quality
        if document_context.has_clear_structure:
            quality_factors.append(1.0)
        else:
            quality_factors.append(0.5)

        # Speaker identification quality
        if speakers:
            unique_speakers = len(set(s.unique_identifier for s in speakers.values()))
            if unique_speakers == len(speakers):
                quality_factors.append(1.0)  # All speakers unique
            else:
                quality_factors.append(unique_speakers / len(speakers))

        # Validation quality
        if validation_results:
            verified_ratio = sum(
                1
                for v in validation_results.values()
                if v.status == ValidationStatus.VERIFIED
            ) / len(validation_results)
            quality_factors.append(verified_ratio)

        return sum(quality_factors) / len(quality_factors) if quality_factors else 0.0

    def _calculate_completeness(
        self,
        demographics: Dict[str, DemographicData],
        attributed_evidence: List[AttributedEvidence],
        validation_results: Dict[str, ValidationResult],
    ) -> float:
        """Calculate completeness score"""

        completeness_factors = []

        # Demographics completeness
        if demographics:
            demo_with_age = sum(
                1 for d in demographics.values() if d.age or d.age_range
            )
            completeness_factors.append(demo_with_age / len(demographics))

        # Evidence completeness
        if attributed_evidence:
            evidence_with_metadata = sum(
                1 for e in attributed_evidence if e.timestamp or e.interview_session
            )
            completeness_factors.append(
                evidence_with_metadata / len(attributed_evidence)
            )

        # Validation completeness
        if validation_results and attributed_evidence:
            validated_ratio = len(validation_results) / len(attributed_evidence)
            completeness_factors.append(validated_ratio)

        return (
            sum(completeness_factors) / len(completeness_factors)
            if completeness_factors
            else 0.0
        )

    async def remediate_evidence(
        self,
        evidence: AttributedEvidence,
        validation_result: ValidationResult,
        source_text: str,
    ) -> AttributedEvidence:
        """
        Remediate evidence that failed validation.

        Args:
            evidence: Evidence that needs remediation
            validation_result: Validation result showing issues
            source_text: Original source text

        Returns:
            Remediated evidence
        """
        logger.info(f"Remediating evidence with status: {validation_result.status}")

        # If contaminated, try to extract clean version
        if validation_result.status == ValidationStatus.CONTAMINATED:
            # Re-process to filter researcher content
            filtered = self.evidence_attribution._filter_researcher_content([evidence])
            if not filtered:
                logger.warning("Evidence completely filtered as researcher content")
                evidence.is_researcher_content = True
                return evidence

        # If refuted or uncertain, try to find correct attribution
        if validation_result.status in [
            ValidationStatus.REFUTED,
            ValidationStatus.UNCERTAIN,
        ]:
            # Search for similar content in source
            if validation_result.source_segments:
                # Use the best matching segment
                evidence.text = validation_result.source_segments[0]
                evidence.normalized_text = self.evidence_attribution._normalize_text(
                    evidence.text
                )
                evidence.confidence_score = validation_result.confidence_score

        # Add validation notes to evidence
        evidence.validation_method = "remediated"
        evidence.validation_score = validation_result.confidence_score

        return evidence

    def export_results(
        self,
        result: EvidenceIntelligenceResult,
        output_path: Path,
        format: str = "json",
    ) -> None:
        """
        Export results to file.

        Args:
            result: Evidence intelligence result to export
            output_path: Path to save the results
            format: Export format (json, csv, etc.)
        """
        try:
            if format == "json":
                # Convert to JSON-serializable dict
                export_data = {
                    "processing_timestamp": result.processing_timestamp.isoformat(),
                    "engine_version": result.engine_version,
                    "metrics": result.metrics.dict(),
                    "quality_scores": {
                        "overall_confidence": result.overall_confidence,
                        "data_quality": result.data_quality_score,
                        "completeness": result.completeness_score,
                    },
                    "document_context": result.document_context.dict(),
                    "speakers": {k: v.dict() for k, v in result.speakers.items()},
                    "demographics": {
                        k: v.dict() for k, v in result.demographics.items()
                    },
                    "evidence": [e.dict() for e in result.attributed_evidence],
                    "validation": {
                        k: v.dict() for k, v in result.validation_results.items()
                    },
                    "personas": result.personas,
                    "insights": {
                        "themes": result.themes,
                        "pain_points": result.pain_points,
                        "needs": result.needs,
                    },
                }

                with open(output_path, "w") as f:
                    json.dump(export_data, f, indent=2, default=str)

                logger.info(f"Results exported to {output_path}")

            else:
                logger.warning(f"Export format {format} not yet implemented")

        except Exception as e:
            logger.error(f"Error exporting results: {e}")
