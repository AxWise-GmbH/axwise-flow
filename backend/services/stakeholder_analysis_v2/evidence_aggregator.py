"""
Evidence Aggregator Module

Handles evidence aggregation and linking for stakeholder analysis.
Reuses EVIDENCE_LINKING_V2 for consistent evidence attribution.
"""
from typing import List, Dict, Any, Optional
import logging

from backend.domain.interfaces.llm_unified import ILLMService
from backend.schemas import DetectedStakeholder

logger = logging.getLogger(__name__)


class EvidenceAggregator:
    """
    Modular evidence aggregator that handles evidence collection and linking
    for stakeholder analysis components.
    """

    def __init__(self, llm_service: ILLMService):
        self.llm_service = llm_service
        self.evidence_linking_service = None
        
        # Initialize evidence linking service
        self._initialize_evidence_linking()

    def _initialize_evidence_linking(self):
        """Initialize evidence linking service with V2 support."""
        try:
            from backend.services.processing.evidence_linking_service import EvidenceLinkingService
            self.evidence_linking_service = EvidenceLinkingService(self.llm_service)
            logger.info("Evidence linking service initialized")
        except Exception as e:
            logger.warning(f"Failed to initialize evidence linking service: {e}")

    async def aggregate_evidence(
        self,
        detected_stakeholders: List[DetectedStakeholder],
        files: List[Any],
    ) -> Dict[str, Any]:
        """
        Aggregate evidence for stakeholder analysis.
        
        Args:
            detected_stakeholders: Stakeholders to aggregate evidence for
            files: Source files containing evidence
            
        Returns:
            Aggregated evidence data
        """
        logger.info(f"Aggregating evidence for {len(detected_stakeholders)} stakeholders")
        
        try:
            # Extract content from files
            content = self._extract_content_from_files(files)
            
            # Aggregate evidence per stakeholder
            stakeholder_evidence = {}
            for stakeholder in detected_stakeholders:
                evidence = await self._aggregate_stakeholder_evidence(
                    stakeholder, content, files
                )
                stakeholder_evidence[stakeholder.stakeholder_id] = evidence
            
            # Create cross-stakeholder evidence summary
            cross_evidence = self._create_cross_evidence_summary(
                stakeholder_evidence, detected_stakeholders
            )
            
            return {
                "stakeholder_evidence": stakeholder_evidence,
                "cross_evidence_summary": cross_evidence,
                "total_evidence_count": sum(
                    len(ev.get("evidence_items", [])) for ev in stakeholder_evidence.values()
                ),
            }
            
        except Exception as e:
            logger.error(f"Evidence aggregation failed: {e}")
            return {"stakeholder_evidence": {}, "cross_evidence_summary": {}}

    async def _aggregate_stakeholder_evidence(
        self,
        stakeholder: DetectedStakeholder,
        content: str,
        files: List[Any],
    ) -> Dict[str, Any]:
        """Aggregate evidence for a specific stakeholder."""
        
        evidence_items = []
        
        try:
            # Use evidence linking service if available
            if self.evidence_linking_service:
                evidence_items = await self._link_evidence_v2(stakeholder, content)
            else:
                evidence_items = self._extract_basic_evidence(stakeholder, content)
            
            # Calculate evidence quality metrics
            quality_metrics = self._calculate_evidence_quality(evidence_items)
            
            return {
                "stakeholder_id": stakeholder.stakeholder_id,
                "evidence_items": evidence_items,
                "evidence_count": len(evidence_items),
                "quality_metrics": quality_metrics,
                "aggregation_method": "evidence_linking_v2" if self.evidence_linking_service else "basic",
            }
            
        except Exception as e:
            logger.warning(f"Failed to aggregate evidence for {stakeholder.stakeholder_id}: {e}")
            return {
                "stakeholder_id": stakeholder.stakeholder_id,
                "evidence_items": [],
                "evidence_count": 0,
                "quality_metrics": {},
                "aggregation_method": "failed",
            }

    async def _link_evidence_v2(
        self, stakeholder: DetectedStakeholder, content: str
    ) -> List[Dict[str, Any]]:
        """Use EVIDENCE_LINKING_V2 for sophisticated evidence linking."""
        
        evidence_items = []
        
        try:
            # Create attributes dict for evidence linking
            attributes = {
                "stakeholder_profile": {
                    "value": f"{stakeholder.name} - {stakeholder.stakeholder_type}",
                    "confidence": stakeholder.detection_confidence,
                    "evidence": [],
                },
                "key_concerns": {
                    "value": "; ".join(stakeholder.key_concerns),
                    "confidence": 0.8,
                    "evidence": [],
                },
            }
            
            # Use evidence linking service
            scope_meta = {
                "stakeholder_id": stakeholder.stakeholder_id,
                "stakeholder_type": stakeholder.stakeholder_type,
            }
            
            linked_attributes, evidence_map = self.evidence_linking_service.link_evidence_to_attributes_v2(
                attributes, content, scope_meta, protect_key_quotes=True
            )
            
            # Convert to evidence items
            for field, evidence_list in evidence_map.items():
                for evidence in evidence_list:
                    evidence_item = {
                        "field": field,
                        "text": evidence.get("text", ""),
                        "confidence": evidence.get("confidence", 0.5),
                        "start_char": evidence.get("start_char"),
                        "end_char": evidence.get("end_char"),
                        "speaker": evidence.get("speaker"),
                        "source": "evidence_linking_v2",
                    }
                    evidence_items.append(evidence_item)
            
        except Exception as e:
            logger.warning(f"EVIDENCE_LINKING_V2 failed for {stakeholder.stakeholder_id}: {e}")
            # Fallback to basic evidence extraction
            evidence_items = self._extract_basic_evidence(stakeholder, content)
        
        return evidence_items

    def _extract_basic_evidence(
        self, stakeholder: DetectedStakeholder, content: str
    ) -> List[Dict[str, Any]]:
        """Basic evidence extraction as fallback."""
        
        evidence_items = []
        
        # Simple keyword-based evidence extraction
        keywords = [
            stakeholder.name.lower(),
            stakeholder.stakeholder_type.lower(),
            stakeholder.role.lower(),
        ]
        
        # Add concern keywords
        for concern in stakeholder.key_concerns:
            keywords.extend(concern.lower().split()[:3])  # First 3 words
        
        # Find sentences containing keywords
        sentences = content.split('.')
        for i, sentence in enumerate(sentences):
            sentence = sentence.strip()
            if len(sentence) < 20:  # Skip very short sentences
                continue
                
            # Check if sentence contains stakeholder keywords
            sentence_lower = sentence.lower()
            for keyword in keywords:
                if keyword in sentence_lower and len(keyword) > 2:
                    evidence_item = {
                        "field": "stakeholder_mention",
                        "text": sentence,
                        "confidence": 0.6,
                        "keyword": keyword,
                        "sentence_index": i,
                        "source": "basic_extraction",
                    }
                    evidence_items.append(evidence_item)
                    break  # One evidence per sentence
        
        # Limit to top 10 evidence items
        return evidence_items[:10]

    def _calculate_evidence_quality(self, evidence_items: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Calculate quality metrics for evidence."""
        
        if not evidence_items:
            return {"quality_score": 0.0, "completeness": 0.0, "confidence_avg": 0.0}
        
        # Calculate average confidence
        confidences = [item.get("confidence", 0.5) for item in evidence_items]
        confidence_avg = sum(confidences) / len(confidences)
        
        # Calculate completeness (based on evidence count)
        completeness = min(len(evidence_items) / 5.0, 1.0)  # Target 5 evidence items
        
        # Calculate overall quality score
        quality_score = (confidence_avg * 0.6) + (completeness * 0.4)
        
        return {
            "quality_score": round(quality_score, 2),
            "completeness": round(completeness, 2),
            "confidence_avg": round(confidence_avg, 2),
            "evidence_count": len(evidence_items),
        }

    def _create_cross_evidence_summary(
        self,
        stakeholder_evidence: Dict[str, Dict[str, Any]],
        detected_stakeholders: List[DetectedStakeholder],
    ) -> Dict[str, Any]:
        """Create summary of cross-stakeholder evidence patterns."""
        
        total_evidence = sum(
            ev.get("evidence_count", 0) for ev in stakeholder_evidence.values()
        )
        
        # Find stakeholder with most evidence
        best_evidenced = None
        max_evidence = 0
        for stakeholder_id, evidence in stakeholder_evidence.items():
            count = evidence.get("evidence_count", 0)
            if count > max_evidence:
                max_evidence = count
                best_evidenced = stakeholder_id
        
        # Calculate evidence distribution
        evidence_distribution = {}
        for stakeholder in detected_stakeholders:
            evidence_count = stakeholder_evidence.get(
                stakeholder.stakeholder_id, {}
            ).get("evidence_count", 0)
            evidence_distribution[stakeholder.stakeholder_type] = evidence_distribution.get(
                stakeholder.stakeholder_type, 0
            ) + evidence_count
        
        return {
            "total_evidence_count": total_evidence,
            "stakeholder_count": len(detected_stakeholders),
            "best_evidenced_stakeholder": best_evidenced,
            "evidence_distribution": evidence_distribution,
            "average_evidence_per_stakeholder": round(
                total_evidence / max(len(detected_stakeholders), 1), 1
            ),
        }

    def _extract_content_from_files(self, files: List[Any]) -> str:
        """Extract text content from files for analysis."""
        content_parts = []
        
        for file in files:
            try:
                if hasattr(file, 'read'):
                    content = file.read()
                    if isinstance(content, bytes):
                        content = content.decode('utf-8', errors='ignore')
                    content_parts.append(content)
                elif isinstance(file, str):
                    content_parts.append(file)
                elif isinstance(file, dict) and 'content' in file:
                    content_parts.append(str(file['content']))
            except Exception as e:
                logger.warning(f"Failed to extract content from file: {e}")
                continue
        
        return "\n\n".join(content_parts)
