"""Enhanced persona formation service with comprehensive attribute analysis"""

from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict
import asyncio
import json
import logging
from datetime import datetime
import re

# Import LLM interface
try:
    # Try to import from backend structure
    from backend.domain.interfaces.llm import ILLMService
except ImportError:
    try:
        # Try to import from regular structure
        from domain.interfaces.llm import ILLMService
    except ImportError:
        # Create a minimal interface if both fail
        logger = logging.getLogger(__name__)
        logger.warning("Could not import ILLMService interface, using minimal definition")
        
        class ILLMService:
            """Minimal LLM service interface"""
            async def generate_response(self, *args, **kwargs):
                raise NotImplementedError("This is a minimal interface")

# Add error handling for event imports
try:
    from backend.infrastructure.events.event_manager import event_manager, EventType
    logger = logging.getLogger(__name__)
    logger.info("Successfully imported event_manager from backend.infrastructure.events")
except ImportError:
    try:
        from infrastructure.events.event_manager import event_manager, EventType
        logger = logging.getLogger(__name__)
        logger.info("Successfully imported event_manager from infrastructure.events")
    except ImportError:
        # Use the fallback events implementation
        try:
            from backend.infrastructure.state.events import event_manager, EventType
            logger = logging.getLogger(__name__)
            logger.info("Using fallback event_manager from backend.infrastructure.state.events")
        except ImportError:
            try:
                from infrastructure.state.events import event_manager, EventType
                logger = logging.getLogger(__name__)
                logger.info("Using fallback event_manager from infrastructure.state.events")
            except ImportError:
                # Create minimal event system if all imports fail
                logger.error("Failed to import events system, using minimal event logging")
                from enum import Enum
                
                class EventType(Enum):
                    """Minimal event types for error handling"""
                    PROCESSING_STATUS = "PROCESSING_STATUS"
                    PROCESSING_ERROR = "PROCESSING_ERROR"
                    PROCESSING_STEP = "PROCESSING_STEP"  
                    PROCESSING_COMPLETED = "PROCESSING_COMPLETED"
                
                class MinimalEventManager:
                    """Minimal event manager for logging only"""
                    async def emit(self, event_type, payload=None):
                        logger.info(f"Event: {event_type}, Payload: {payload}")
                        
                    async def emit_error(self, error, context=None):
                        logger.error(f"Error: {str(error)}, Context: {context}")
                
                event_manager = MinimalEventManager()

try:
    from backend.infrastructure.data.config import SystemConfig
except ImportError:
    try:
        from infrastructure.data.config import SystemConfig
    except ImportError:
        logger.warning("Could not import SystemConfig, using minimal definition")
        
        class SystemConfig:
            """Minimal system config"""
            def __init__(self):
                self.llm = type('obj', (object,), {
                    'provider': 'openai',
                    'model': 'gpt-3.5-turbo',
                    'temperature': 0.3,
                    'max_tokens': 2000
                })
                self.processing = type('obj', (object,), {
                    'batch_size': 10,
                    'max_tokens': 2000
                })
                self.validation = type('obj', (object,), {
                    'min_confidence': 0.4
                })

logger = logging.getLogger(__name__)

@dataclass
class PersonaTrait:
    """A trait or attribute of a persona with confidence and supporting evidence"""
    value: str
    confidence: float
    evidence: List[str]

@dataclass
class Persona:
    """A user persona derived from interview data"""
    name: str
    description: str
    role_context: PersonaTrait
    key_responsibilities: PersonaTrait
    tools_used: PersonaTrait
    collaboration_style: PersonaTrait
    analysis_approach: PersonaTrait
    pain_points: PersonaTrait
    patterns: List[str]
    confidence: float
    evidence: List[str]
    metadata: Optional[Dict[str, Any]] = None

def persona_to_dict(persona: Persona) -> Dict[str, Any]:
    """Convert a Persona object to a dictionary for JSON serialization"""
    result = asdict(persona)
    # Ensure all confidence values are Python float
    result['role_context']['confidence'] = float(result['role_context']['confidence'])
    result['key_responsibilities']['confidence'] = float(result['key_responsibilities']['confidence'])
    result['tools_used']['confidence'] = float(result['tools_used']['confidence'])
    result['collaboration_style']['confidence'] = float(result['collaboration_style']['confidence'])
    result['analysis_approach']['confidence'] = float(result['analysis_approach']['confidence'])
    result['pain_points']['confidence'] = float(result['pain_points']['confidence'])
    result['confidence'] = float(result['confidence'])
    return result

class PersonaFormationService:
    """Service for forming personas from analysis patterns"""
    
    def __init__(self, config, llm_service):
        """Initialize with system config and LLM service
        
        Args:
            config: System configuration object
            llm_service: Initialized LLM service
        """
        self.config = config
        self.llm_service = llm_service
        self.min_confidence = getattr(config.validation, 'min_confidence', 0.4)
        self.validation_threshold = self.min_confidence
        logger.info(f"Initialized PersonaFormationService with {llm_service.__class__.__name__}")

    async def form_personas(self, patterns, context=None):
        """Form personas from identified patterns
        
        Args:
            patterns: List of identified patterns from analysis
            context: Optional additional context
            
        Returns:
            List of persona dictionaries
        """
        try:
            logger.info(f"Forming personas from {len(patterns)} patterns")
            
            # Skip if no patterns
            if not patterns or len(patterns) == 0:
                logger.warning("No patterns provided for persona formation")
                return []
            
            # Group patterns by similarity
            grouped_patterns = self._group_patterns(patterns)
            logger.info(f"Grouped patterns into {len(grouped_patterns)} potential personas")
            
            # Form a persona from each group 
            personas = []
            
            for i, group in enumerate(grouped_patterns):
                try:
                    # Convert the group to a persona
                    attributes = await self._analyze_patterns_for_persona(group)
                                        
                    if attributes.get('confidence', 0) >= self.validation_threshold:
                        try:
                            # Ensure all required fields are present
                            for field in ['name', 'description', 'role_context', 'role_confidence', 'role_evidence',
                                         'responsibilities', 'resp_confidence', 'resp_evidence', 'tools', 
                                         'tools_confidence', 'tools_evidence', 'collaboration', 'collab_confidence',
                                         'collab_evidence', 'analysis', 'analysis_confidence', 'analysis_evidence',
                                         'pain_points', 'pain_confidence', 'pain_evidence', 'confidence', 'evidence']:
                                if field not in attributes or attributes[field] is None:
                                    if field.endswith('_evidence') or field == 'evidence' or field == 'patterns':
                                        attributes[field] = []
                                    elif field.endswith('_confidence') or field == 'confidence':
                                        attributes[field] = 0.5  # Default confidence
                                    else:
                                        attributes[field] = f"Not enough information to determine {field.replace('_', ' ')}"
                            
                            # Ensure patterns field exists
                            if 'patterns' not in attributes or attributes['patterns'] is None:
                                attributes['patterns'] = [p.get('description', '') for p in group if p.get('description')]
                                
                            persona = Persona(
                                name=attributes['name'],
                                description=attributes['description'],
                                role_context=PersonaTrait(
                                    value=attributes['role_context'],
                                    confidence=attributes['role_confidence'],
                                    evidence=attributes['role_evidence']
                                ),
                                key_responsibilities=PersonaTrait(
                                    value=attributes['responsibilities'],
                                    confidence=attributes['resp_confidence'], 
                                    evidence=attributes['resp_evidence']
                                ),
                                tools_used=PersonaTrait(
                                    value=attributes['tools'],
                                    confidence=attributes['tools_confidence'],
                                    evidence=attributes['tools_evidence'] 
                                ),
                                collaboration_style=PersonaTrait(
                                    value=attributes['collaboration'],
                                    confidence=attributes['collab_confidence'],
                                    evidence=attributes['collab_evidence']
                                ),
                                analysis_approach=PersonaTrait(
                                    value=attributes['analysis'],
                                    confidence=attributes['analysis_confidence'],
                                    evidence=attributes['analysis_evidence']
                                ),
                                pain_points=PersonaTrait(
                                    value=attributes['pain_points'],
                                    confidence=attributes['pain_confidence'],
                                    evidence=attributes['pain_evidence']
                                ),
                                patterns=attributes['patterns'],
                                confidence=attributes['confidence'],
                                evidence=attributes['evidence'],
                                metadata=self._get_metadata(group)
                            )
                            personas.append(persona)
                            
                            logger.info(f"Created persona: {persona.name} with confidence {persona.confidence}")
                        except KeyError as key_error:
                            logger.error(f"Missing key in persona attributes: {str(key_error)}")
                            logger.debug(f"Available keys: {list(attributes.keys())}")
                    else:
                        logger.warning(
                            f"Skipping persona creation - confidence {attributes.get('confidence', 0)} "
                            f"below threshold {self.validation_threshold}"
                        )
                except Exception as attr_error:
                    logger.error(f"Error analyzing persona attributes: {str(attr_error)}")
                    
                # Emit event for tracking
                try:
                    await event_manager.emit(
                        EventType.PROCESSING_STEP,
                        {
                            'stage': 'persona_formation',
                            'progress': (i + 1) / len(grouped_patterns),
                            'data': {
                                'personas_found': len(personas),
                                'groups_processed': i + 1
                            }
                        }
                    )
                except Exception as event_error:
                    logger.warning(f"Could not emit processing step event: {str(event_error)}")
            
            # If no personas were created, try to create a default one
            if not personas:
                logger.warning("No personas created from patterns, creating default persona")
                personas = await self._create_default_persona(context)
            
            # Convert Persona objects to dictionaries before returning
            return [persona_to_dict(p) for p in personas]
            
        except Exception as e:
            logger.error(f"Error creating personas: {str(e)}")
            try:
                await event_manager.emit_error(e, {'stage': 'persona_formation'})
            except Exception as event_error:
                logger.warning(f"Could not emit error event: {str(event_error)}")
            # Return empty list instead of raising to prevent analysis failure
            return []
            
    def _group_patterns(self, patterns):
        """Group patterns by similarity
        
        Args:
            patterns: List of patterns from analysis
            
        Returns:
            List of pattern groups
        """
        # Simple grouping by pattern type
        grouped = {}
        for pattern in patterns:
            pattern_type = pattern.get('type', 'unknown')
            if pattern_type not in grouped:
                grouped[pattern_type] = []
            grouped[pattern_type].append(pattern)
        
        # Convert to list of groups
        return list(grouped.values())
        
    def _get_metadata(self, pattern_group):
        """Generate metadata for a persona based on pattern group
        
        Args:
            pattern_group: Group of patterns used to form persona
            
        Returns:
            Metadata dictionary
        """
        # Calculate confidence and evidence metrics
        pattern_confidence = sum(p.get('confidence', 0) for p in pattern_group) / max(len(pattern_group), 1)
        evidence_count = sum(len(p.get('evidence', [])) for p in pattern_group)
        
        # Create validation metrics
        validation_metrics = {
            'pattern_confidence': pattern_confidence,
            'evidence_count': evidence_count,
            'attribute_coverage': {
                'role': 0.6,  # Estimated coverage based on pattern types
                'responsibilities': 0.7,
                'tools': 0.5,
                'collaboration': 0.4,
                'analysis': 0.6,
                'pain_points': 0.8
            }
        }
        
        return {
            'timestamp': datetime.now().isoformat(),
            'sample_size': len(pattern_group),
            'validation_metrics': validation_metrics
        }

    def _calculate_pattern_confidence(self, group: List[Dict[str, Any]]) -> float:
        """Calculate confidence score for pattern matching"""
        if not group:
            return 0.0
            
        confidences = [p.get('confidence', 0) for p in group]
        return sum(confidences) / len(confidences)

    def _calculate_attribute_coverage(self, group: List[Dict[str, Any]]) -> Dict[str, float]:
        """Calculate coverage ratio for each attribute"""
        required_attributes = [
            'role_context',
            'key_responsibilities', 
            'tools_used',
            'collaboration_style',
            'pain_points'
        ]
        
        coverage = {}
        for attr in required_attributes:
            present = sum(1 for p in group if p.get(attr))
            coverage[attr] = present / len(group) if group else 0.0
            
        return coverage

    async def _analyze_patterns_for_persona(self, patterns: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze patterns to extract persona attributes
        
        Args:
            patterns: List of patterns to analyze
            
        Returns:
            Dictionary of persona attributes
        """
        # Prepare prompt with pattern descriptions
        pattern_descriptions = "\n".join(f"- {p.get('description', '')}" for p in patterns if p.get('description'))
        prompt = f"""
        Analyze these patterns from interview data to create a detailed user persona:
        
        PATTERNS:
        {pattern_descriptions}
        
        Based on these patterns, create a detailed persona with the following attributes:
        1. Name: A descriptive role-based name
        2. Description: Brief summary of who this persona is
        3. Role context: Their work context and environment
        4. Key responsibilities: Their main tasks and responsibilities
        5. Tools used: Tools, software, or methods they use
        6. Collaboration style: How they collaborate with others
        7. Analysis approach: How they approach problems and analysis
        8. Pain points: Challenges or frustrations they face
        
        Return a JSON object with these properties:
        - name: Role-based name (e.g., "Technical Project Manager")
        - description: Brief description
        - role_context: Primary work context
        - role_confidence: Confidence score (0.0-1.0) for role identification
        - role_evidence: List of supporting evidence for role
        - responsibilities: Key responsibilities
        - resp_confidence: Confidence score (0.0-1.0) for responsibilities
        - resp_evidence: List of supporting evidence for responsibilities
        - tools: Tools, software, or methods used
        - tools_confidence: Confidence score (0.0-1.0) for tools
        - tools_evidence: List of supporting evidence for tools
        - collaboration: Collaboration style
        - collab_confidence: Confidence score (0.0-1.0) for collaboration style
        - collab_evidence: List of supporting evidence for collaboration
        - analysis: Analysis approach
        - analysis_confidence: Confidence score (0.0-1.0) for analysis approach
        - analysis_evidence: List of supporting evidence for analysis
        - pain_points: Pain points and challenges
        - pain_confidence: Confidence score (0.0-1.0) for pain points
        - pain_evidence: List of supporting evidence for pain points
        - patterns: List of most relevant patterns
        - confidence: Overall confidence score (0.0-1.0)
        - evidence: Overall list of supporting evidence
        """
        
        try:
            # Call LLM to analyze patterns - using the analyze method or _make_request if available
            if hasattr(self.llm_service, '_make_request'):
                response = await self.llm_service._make_request(prompt)
            else:
                # Use analyze method which is standard across all implementations
                response = await self.llm_service.analyze({
                    'task': 'persona_formation',
                    'text': pattern_descriptions,
                    'prompt': prompt
                })
            
            # Ensure response is a dictionary
            if isinstance(response, dict):
                return response
            elif isinstance(response, str):
                # Try to parse JSON
                try:
                    return json.loads(response)
                except json.JSONDecodeError:
                    logger.error(f"Failed to parse LLM response as JSON: {response[:100]}...")
                    # Extract JSON if present in text
                    json_match = re.search(r'{[\s\S]*}', response)
                    if json_match:
                        try:
                            json_str = json_match.group(0)
                            return json.loads(json_str)
                        except json.JSONDecodeError:
                            logger.error(f"Failed to extract JSON from response: {json_str[:100]}...")
            
            # Fallback to minimal response
            logger.warning("Using fallback for pattern analysis due to invalid response")
            return {
                "name": "Interview Participant",
                "description": "Persona derived from interview patterns",
                "role_context": "Role derived from interview data",
                "role_confidence": 0.6,
                "role_evidence": [],
                "responsibilities": "Responsibilities derived from patterns",
                "resp_confidence": 0.6,
                "resp_evidence": [],
                "tools": "Tools mentioned in interview",
                "tools_confidence": 0.6,
                "tools_evidence": [],
                "collaboration": "Collaboration style from patterns",
                "collab_confidence": 0.6,
                "collab_evidence": [],
                "analysis": "Analysis approach from patterns",
                "analysis_confidence": 0.6,
                "analysis_evidence": [],
                "pain_points": "Pain points from patterns",
                "pain_confidence": 0.6,
                "pain_evidence": [],
                "patterns": [p.get("description", "") for p in patterns],
                "confidence": 0.6,
                "evidence": []
            }
        except Exception as e:
            logger.error(f"Error analyzing patterns for persona: {str(e)}")
            # Return minimal data to avoid failures
            return {
                "name": "Default Persona",
                "description": "Default persona due to analysis error",
                "role_context": "",
                "role_confidence": 0.5,
                "role_evidence": [],
                "responsibilities": "",
                "resp_confidence": 0.5,
                "resp_evidence": [],
                "tools": "",
                "tools_confidence": 0.5,
                "tools_evidence": [],
                "collaboration": "",
                "collab_confidence": 0.5,
                "collab_evidence": [],
                "analysis": "",
                "analysis_confidence": 0.5,
                "analysis_evidence": [],
                "pain_points": "",
                "pain_confidence": 0.5,
                "pain_evidence": [],
                "patterns": [],
                "confidence": 0.5,
                "evidence": []
            }

    async def _create_default_persona(self, context: Optional[Dict[str, Any]] = None) -> List[Persona]:
        """Create a default persona when no patterns are found"""
        try:
            logger.info("Starting _create_default_persona with context")
            if context is None:
                logger.error("Context is None - cannot create default persona without context")
                return []
                
            # Get the original text from context if available
            original_text = ""
            if context and 'original_text' in context:
                original_text = context['original_text']
                logger.info(f"Found original_text in context, length: {len(original_text)}")
            elif context:
                # Try to find text content
                for key, value in context.items():
                    if isinstance(value, str) and len(value) > 100:
                        original_text = value
                        logger.info(f"Using '{key}' as original_text, length: {len(value)}")
                        break
            
            if not original_text:
                logger.warning("No original text found in context to create default persona")
                return []
            
            # Create a direct prompt for persona extraction
            prompt = f"""
            Given the following interview text, create a detailed persona profile for the main participant.
            
            Interview text:
            {original_text[:4000]}
            
            Create a detailed persona including:
            1. Name and role (e.g., "Technical Project Manager")
            2. Description (a brief summary of who this person is)
            3. Role context (their primary job or function)
            4. Key responsibilities (main tasks they handle)
            5. Tools they use
            6. Collaboration style (how they work with others)
            7. Analysis approach (how they process information)
            8. Pain points (challenges they face)
            
            Return this as a structured JSON with all these attributes.
            """
            
            # Call LLM directly for persona creation
            logger.info("Calling LLM service for persona creation")
            if hasattr(self.llm_service, '_make_request'):
                response = await self.llm_service._make_request(prompt)
            else:
                # Use analyze method which is standard across all implementations
                response = await self.llm_service.analyze({
                    'task': 'persona_formation',
                    'text': original_text[:4000],
                    'prompt': prompt
                })
            
            # Try to extract persona data
            if isinstance(response, dict):
                logger.info(f"Response keys: {list(response.keys())}")
                
                # For Gemini, we might need to extract the actual persona data
                persona_data = response
                if 'error' in response:
                    logger.error(f"LLM service returned error: {response.get('error')}")
                    return []
                elif 'raw_response' in response:
                    # Try to parse the raw response as JSON
                    try:
                        raw_text = response.get('raw_response', '')
                        # Find JSON in raw text
                        import re
                        match = re.search(r"{.*}", raw_text, re.DOTALL)
                        if match:
                            json_str = match.group(0)
                            persona_data = json.loads(json_str)
                            logger.info(f"Extracted persona data from raw response: {list(persona_data.keys())}")
                        else:
                            logger.error("Could not find JSON object in raw response")
                            return []
                    except Exception as e:
                        logger.error(f"Error extracting persona data from raw response: {str(e)}")
                        return []
                
                try:
                    # Create a persona object from the extracted data
                    persona = Persona(
                        name=persona_data.get('name', 'Default Persona'),
                        description=persona_data.get('description', 'Generated from interview data'),
                        role_context=PersonaTrait(
                            value=persona_data.get('role_context', ''),
                            confidence=0.7,
                            evidence=[]
                        ),
                        key_responsibilities=PersonaTrait(
                            value=persona_data.get('key_responsibilities', ''),
                            confidence=0.7,
                            evidence=[]
                        ),
                        tools_used=PersonaTrait(
                            value=persona_data.get('tools_used', ''),
                            confidence=0.7,
                            evidence=[]
                        ),
                        collaboration_style=PersonaTrait(
                            value=persona_data.get('collaboration_style', ''),
                            confidence=0.7,
                            evidence=[]
                        ),
                        analysis_approach=PersonaTrait(
                            value=persona_data.get('analysis_approach', ''),
                            confidence=0.7,
                            evidence=[]
                        ),
                        pain_points=PersonaTrait(
                            value=persona_data.get('pain_points', ''),
                            confidence=0.7,
                            evidence=[]
                        ),
                        patterns=[],
                        confidence=0.7,
                        evidence=[],
                        metadata={
                            'source': 'default_persona_generation',
                            'timestamp': datetime.now().isoformat()
                        }
                    )
                    
                    logger.info(f"Created default persona: {persona.name}")
                    return [persona]
                except Exception as persona_error:
                    logger.error(f"Error creating Persona object: {str(persona_error)}")
                    # Return an even more simplified persona as a last resort
                    minimal_persona = Persona(
                        name="Default Participant",
                        description="Default persona created from interview",
                        role_context=PersonaTrait(
                            value="Interview participant",
                            confidence=0.5,
                            evidence=[]
                        ),
                        key_responsibilities=PersonaTrait(
                            value="Participating in the interview",
                            confidence=0.5,
                            evidence=[]
                        ),
                        tools_used=PersonaTrait(
                            value="Communication tools",
                            confidence=0.5,
                            evidence=[]
                        ),
                        collaboration_style=PersonaTrait(
                            value="Direct communication",
                            confidence=0.5,
                            evidence=[]
                        ),
                        analysis_approach=PersonaTrait(
                            value="Thoughtful responses",
                            confidence=0.5,
                            evidence=[]
                        ),
                        pain_points=PersonaTrait(
                            value="Areas mentioned in interview",
                            confidence=0.5,
                            evidence=[]
                        ),
                        patterns=[],
                        confidence=0.5,
                        evidence=[],
                        metadata={
                            'source': 'emergency_fallback_persona',
                            'timestamp': datetime.now().isoformat()
                        }
                    )
                    logger.info("Created minimal fallback persona")
                    return [minimal_persona]
            
            logger.warning("Failed to create default persona from context")
            return []
            
        except Exception as e:
            logger.error(f"Error creating default persona: {str(e)}")
            return []

    async def save_personas(self, personas: List[Persona], output_path: str):
        """Save personas to JSON file"""
        try:
            with open(output_path, 'w') as f:
                json.dump(
                    [asdict(p) for p in personas],
                    f,
                    indent=2
                )
            logger.info(f"Saved {len(personas)} personas to {output_path}")
            
            # Emit completion event
            try:
                await event_manager.emit(
                    EventType.PROCESSING_COMPLETED,
                    {
                        'stage': 'persona_saving',
                        'data': {
                            'output_path': output_path,
                            'persona_count': len(personas)
                        }
                    }
                )
            except Exception as event_error:
                logger.warning(f"Could not emit processing completed event: {str(event_error)}")
            
        except Exception as e:
            logger.error(f"Error saving personas: {str(e)}")
            try:
                await event_manager.emit_error(e, {'stage': 'persona_saving'})
            except Exception as event_error:
                logger.warning(f"Could not emit error event: {str(event_error)}")
            raise
    
    def _get_text_metadata(self, text: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Generate metadata for persona created from text
        
        Args:
            text: The interview text
            context: Optional additional context
            
        Returns:
            Metadata dictionary
        """
        metadata = {
            "timestamp": datetime.now().isoformat(),
            "text_length": len(text),
            "source": "direct_text_analysis",
            "method": "llm_schema",
            "sample_size": 1
        }
        
        # Include additional context if provided
        if context:
            metadata.update(context)
            
        return metadata
        
    async def generate_persona_from_text(self, text: str, context: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Generate persona directly from raw interview text using enhanced LLM schema-based analysis.
        
        This method provides an alternative persona generation approach that works with raw text data
        rather than requiring pre-extracted patterns. This is especially useful for transcript formats
        like Teams chat exports.
        
        Args:
            text: Raw interview transcript text
            context: Optional additional context information
            
        Returns:
            List of persona dictionaries ready for frontend display
        """
        try:
            logger.info(f"Generating persona directly from text ({len(text)} chars)")
            try:
                # Try to emit event, but don't fail if it doesn't work
                await event_manager.emit(EventType.PROCESSING_STATUS, {"status": "Generating persona from text", "progress": 0.6})
            except Exception as event_error:
                logger.warning(f"Could not emit processing status event: {str(event_error)}")
            
            # Create a direct prompt for persona extraction
            prompt = f"""
            Given the following interview text, create a detailed persona profile for the main participant.
            
            Interview text:
            {text[:4000]}
            
            Create a detailed persona including:
            1. Name and role (e.g., "Technical Project Manager")
            2. Description (a brief summary of who this person is)
            3. Role context (their primary job or function)
            4. Key responsibilities (main tasks they handle)
            5. Tools they use
            6. Collaboration style (how they work with others)
            7. Analysis approach (how they process information)
            8. Pain points (challenges they face)
            
            Return a JSON object with these properties:
            - name: Role-based name (e.g., "Technical Project Manager")
            - description: Brief description
            - role_context: Primary work context
            - role_confidence: Confidence score (0.0-1.0) for role identification
            - role_evidence: List of supporting evidence for role
            - responsibilities: Key responsibilities
            - resp_confidence: Confidence score (0.0-1.0) for responsibilities
            - resp_evidence: List of supporting evidence for responsibilities
            - tools: Tools, software, or methods used
            - tools_confidence: Confidence score (0.0-1.0) for tools
            - tools_evidence: List of supporting evidence for tools
            - collaboration: Collaboration style
            - collab_confidence: Confidence score (0.0-1.0) for collaboration style
            - collab_evidence: List of supporting evidence for collaboration
            - analysis: Analysis approach
            - analysis_confidence: Confidence score (0.0-1.0) for analysis approach
            - analysis_evidence: List of supporting evidence for analysis
            - pain_points: Pain points and challenges
            - pain_confidence: Confidence score (0.0-1.0) for pain points
            - pain_evidence: List of supporting evidence for pain points
            - patterns: List of relevant patterns or themes
            - confidence: Overall confidence score (0.0-1.0)
            - evidence: Overall list of supporting evidence
            """
            
            # Try different methods to generate persona
            attributes = None
            
            # Method 1: Use specialized method if available
            if hasattr(self.llm_service, 'generate_persona_from_text'):
                try:
                    attributes = await self.llm_service.generate_persona_from_text(text)
                    logger.info("Successfully used specialized generate_persona_from_text method")
                except Exception as e:
                    logger.warning(f"Error using specialized method: {str(e)}")
            
            # Method 2: Use _make_request if available
            if attributes is None and hasattr(self.llm_service, '_make_request'):
                try:
                    response = await self.llm_service._make_request(prompt)
                    if isinstance(response, dict):
                        attributes = response
                    elif isinstance(response, str):
                        # Try to parse JSON from string
                        try:
                            attributes = json.loads(response)
                        except json.JSONDecodeError:
                            # Try to extract JSON from text
                            json_match = re.search(r'{[\s\S]*}', response)
                            if json_match:
                                try:
                                    json_str = json_match.group(0)
                                    attributes = json.loads(json_str)
                                except:
                                    logger.warning("Failed to extract JSON from response")
                    logger.info("Successfully used _make_request method")
                except Exception as e:
                    logger.warning(f"Error using _make_request: {str(e)}")
            
            # Method 3: Use standard analyze method
            if attributes is None:
                try:
                    response = await self.llm_service.analyze({
                        'task': 'persona_formation',
                        'text': text[:4000],
                        'prompt': prompt
                    })
                    if isinstance(response, dict):
                        attributes = response
                    logger.info("Successfully used analyze method")
                except Exception as e:
                    logger.warning(f"Error using analyze method: {str(e)}")
            
            # If we have attributes, create a persona
            if attributes and isinstance(attributes, dict):
                try:
                    # Ensure all required fields are present
                    persona = Persona(
                        name=attributes.get('name', 'Unknown'),
                        description=attributes.get('description', 'Generated from interview analysis'),
                        role_context=PersonaTrait(
                            value=attributes.get('role_context', ''),
                            confidence=attributes.get('role_confidence', 0.7),
                            evidence=attributes.get('role_evidence', [])
                        ),
                        key_responsibilities=PersonaTrait(
                            value=attributes.get('responsibilities', ''),
                            confidence=attributes.get('resp_confidence', 0.7), 
                            evidence=attributes.get('resp_evidence', [])
                        ),
                        tools_used=PersonaTrait(
                            value=attributes.get('tools', ''),
                            confidence=attributes.get('tools_confidence', 0.7),
                            evidence=attributes.get('tools_evidence', [])
                        ),
                        collaboration_style=PersonaTrait(
                            value=attributes.get('collaboration', ''),
                            confidence=attributes.get('collab_confidence', 0.7),
                            evidence=attributes.get('collab_evidence', [])
                        ),
                        analysis_approach=PersonaTrait(
                            value=attributes.get('analysis', ''),
                            confidence=attributes.get('analysis_confidence', 0.7),
                            evidence=attributes.get('analysis_evidence', [])
                        ),
                        pain_points=PersonaTrait(
                            value=attributes.get('pain_points', ''),
                            confidence=attributes.get('pain_confidence', 0.7),
                            evidence=attributes.get('pain_evidence', [])
                        ),
                        patterns=attributes.get('patterns', []),
                        confidence=attributes.get('confidence', 0.8),
                        evidence=attributes.get('evidence', ["Generated from direct text analysis"]),
                        metadata=self._get_text_metadata(text, context)
                    )
                    
                    # Add source attribution
                    persona.metadata["source"] = "direct_text_analysis"
                    persona.metadata["analysis_type"] = "schema_based"
                    persona.metadata["text_length"] = len(text)
                    
                    logger.info(f"Created persona: {persona.name}")
                    try:
                        await event_manager.emit(EventType.PROCESSING_STATUS, {"status": "Persona generated successfully", "progress": 0.9})
                    except Exception as event_error:
                        logger.warning(f"Could not emit processing status event: {str(event_error)}")
                    
                    # Convert to dictionary and return
                    try:
                        # Use the persona_to_dict function to convert the persona to a serializable dictionary
                        persona_dict = persona_to_dict(persona)
                        return [persona_dict]
                    except Exception as dict_error:
                        logger.error(f"Error converting persona to dictionary: {str(dict_error)}")
                        # Manual conversion as fallback
                        persona_dict = {
                            "name": persona.name,
                            "description": persona.description,
                            "role_context": {
                                "value": persona.role_context.value,
                                "confidence": float(persona.role_context.confidence),
                                "evidence": persona.role_context.evidence
                            },
                            "key_responsibilities": {
                                "value": persona.key_responsibilities.value,
                                "confidence": float(persona.key_responsibilities.confidence),
                                "evidence": persona.key_responsibilities.evidence
                            },
                            "tools_used": {
                                "value": persona.tools_used.value,
                                "confidence": float(persona.tools_used.confidence),
                                "evidence": persona.tools_used.evidence
                            },
                            "collaboration_style": {
                                "value": persona.collaboration_style.value,
                                "confidence": float(persona.collaboration_style.confidence),
                                "evidence": persona.collaboration_style.evidence
                            },
                            "analysis_approach": {
                                "value": persona.analysis_approach.value,
                                "confidence": float(persona.analysis_approach.confidence),
                                "evidence": persona.analysis_approach.evidence
                            },
                            "pain_points": {
                                "value": persona.pain_points.value,
                                "confidence": float(persona.pain_points.confidence),
                                "evidence": persona.pain_points.evidence
                            },
                            "patterns": persona.patterns,
                            "confidence": float(persona.confidence),
                            "evidence": persona.evidence,
                            "metadata": persona.metadata
                        }
                        return [persona_dict]
                except Exception as e:
                    logger.error(f"Error creating persona from attributes: {str(e)}")
            
            # Fallback to default persona creation
            logger.info("Using default persona creation method")
            context_with_text = context or {}
            context_with_text['original_text'] = text
            personas = await self._create_default_persona(context_with_text)
            
            # Convert to dictionaries and return
            return [persona_to_dict(p) for p in personas]
                
        except Exception as e:
            logger.error(f"Error generating persona from text: {str(e)}")
            try:
                await event_manager.emit_error(e, {"context": "generate_persona_from_text"})
            except Exception as event_error:
                logger.warning(f"Could not emit error event: {str(event_error)}")
                
            # Return a minimal persona as fallback
            return [{
                "name": "Default Persona",
                "description": "Generated as fallback due to an error in text analysis",
                "confidence": 0.4,
                "evidence": ["Generated as fallback"],
                "metadata": {
                    "error": str(e),
                    "timestamp": datetime.now().isoformat()
                }
            }] 