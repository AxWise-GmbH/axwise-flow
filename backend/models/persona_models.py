"""
Pydantic models for persona analysis following the Instructor implementation guide.
These models ensure structured output from LLM-based persona generation.
"""

from pydantic import BaseModel, Field, validator
from typing import List, Dict, Any, Optional
from enum import Enum


class PersonaType(str, Enum):
    """Enum for different persona types"""
    BUSINESS = "business"
    CUSTOMER = "customer"
    HYBRID = "hybrid"


class PatternItem(BaseModel):
    """Individual pattern item with frequency and examples"""
    pattern: str = Field(..., description="The identified pattern or theme")
    frequency: int = Field(ge=0, description="How often this pattern appears")
    examples: List[str] = Field(default_factory=list, description="Example quotes or evidence")
    
    @validator('pattern')
    def pattern_must_not_be_empty(cls, v):
        if not v or not v.strip():
            raise ValueError('Pattern cannot be empty')
        return v.strip()
    
    @validator('examples', pre=True)
    def filter_empty_examples(cls, v):
        """Filter out empty examples"""
        if not isinstance(v, list):
            return []
        return [item.strip() for item in v if item and str(item).strip()]


class SentimentAnalysis(BaseModel):
    """Sentiment analysis results"""
    average_polarity: float = Field(ge=-1.0, le=1.0, default=0.0, description="Average sentiment polarity")
    average_subjectivity: float = Field(ge=0.0, le=1.0, default=0.0, description="Average sentiment subjectivity")
    
    @validator('average_polarity', 'average_subjectivity')
    def clamp_values(cls, v):
        """Ensure values are within valid ranges"""
        return max(-1.0, min(1.0, v))


class BusinessAttributes(BaseModel):
    """Business workflow persona attributes"""
    tools_used: List[PatternItem] = Field(default_factory=list, description="Tools and methods used")
    planning_patterns: List[PatternItem] = Field(default_factory=list, description="Planning and frequency patterns")
    key_responsibilities: List[PatternItem] = Field(default_factory=list, description="Key responsibilities and tasks")


class CustomerAttributes(BaseModel):
    """Customer experience persona attributes"""
    behaviors: List[PatternItem] = Field(default_factory=list, description="Customer behavior patterns")
    preferences: List[PatternItem] = Field(default_factory=list, description="Customer preferences and likes")
    motivations: List[PatternItem] = Field(default_factory=list, description="Customer motivations and drivers")
    contexts: List[PatternItem] = Field(default_factory=list, description="Usage contexts and environments")


class PainPoints(BaseModel):
    """Pain points and challenges analysis"""
    key_challenges: List[str] = Field(default_factory=list, description="Main challenges identified")
    key_frustrations: List[str] = Field(default_factory=list, description="Main frustrations (customer-specific)")
    key_problems: List[str] = Field(default_factory=list, description="Main problems (customer-specific)")
    automation_needs: List[PatternItem] = Field(default_factory=list, description="Automation and improvement needs")
    improvement_desires: List[PatternItem] = Field(default_factory=list, description="Improvement desires (customer-specific)")
    challenge_sentiment: SentimentAnalysis = Field(default_factory=SentimentAnalysis, description="Sentiment of challenges")
    pain_sentiment: SentimentAnalysis = Field(default_factory=SentimentAnalysis, description="Sentiment of pain points")


class CollaborationPatterns(BaseModel):
    """Collaboration and interaction patterns"""
    collaboration_patterns: Dict[str, Any] = Field(default_factory=dict, description="Collaboration theme summaries")
    representative_quotes: Dict[str, Any] = Field(default_factory=dict, description="Representative collaboration quotes")


class CustomerJourney(BaseModel):
    """Customer journey and touchpoint analysis"""
    journey_patterns: Dict[str, Any] = Field(default_factory=dict, description="Customer journey theme summaries")
    representative_quotes: Dict[str, Any] = Field(default_factory=dict, description="Representative journey quotes")


class SupportingQuotes(BaseModel):
    """Supporting quotes categorized by topic"""
    positive_experiences: List[Dict[str, Any]] = Field(default_factory=list, description="Positive experience quotes")
    negative_experiences: List[Dict[str, Any]] = Field(default_factory=list, description="Negative experience quotes")
    challenges: List[str] = Field(default_factory=list, description="Challenge-related quotes")
    frustrations: List[str] = Field(default_factory=list, description="Frustration-related quotes")
    preferences: List[str] = Field(default_factory=list, description="Preference-related quotes")
    behaviors: List[str] = Field(default_factory=list, description="Behavior-related quotes")
    collaboration: List[str] = Field(default_factory=list, description="Collaboration-related quotes")
    automation: List[str] = Field(default_factory=list, description="Automation-related quotes")
    flexibility: List[str] = Field(default_factory=list, description="Flexibility-related quotes")


class PersonaMetadata(BaseModel):
    """Metadata about the persona analysis"""
    num_respondents: int = Field(ge=0, default=0, description="Number of respondents analyzed")
    total_responses: int = Field(ge=0, default=0, description="Total number of responses analyzed")
    analysis_type: PersonaType = Field(default=PersonaType.BUSINESS, description="Type of analysis performed")
    timestamp: Optional[str] = Field(None, description="Analysis timestamp")
    confidence_score: float = Field(ge=0.0, le=1.0, default=0.0, description="Overall confidence in analysis")


class RoutingMetadata(BaseModel):
    """Metadata about routing decisions"""
    analysis_type: str = Field(..., description="Type of analysis used")
    confidence: float = Field(ge=0.0, le=1.0, default=0.0, description="Confidence in routing decision")
    analyzer_used: str = Field(..., description="Which analyzer was used")
    business_success: Optional[bool] = Field(None, description="Whether business analysis succeeded")
    customer_success: Optional[bool] = Field(None, description="Whether customer analysis succeeded")


class BusinessPersona(BaseModel):
    """Complete business persona profile"""
    persona_type: str = Field(..., description="Type of persona")
    core_attributes: BusinessAttributes = Field(default_factory=BusinessAttributes, description="Core business attributes")
    pain_points: PainPoints = Field(default_factory=PainPoints, description="Pain points and challenges")
    collaboration_patterns: CollaborationPatterns = Field(default_factory=CollaborationPatterns, description="Collaboration patterns")
    supporting_quotes: SupportingQuotes = Field(default_factory=SupportingQuotes, description="Supporting quotes")
    metadata: PersonaMetadata = Field(default_factory=PersonaMetadata, description="Analysis metadata")
    routing_metadata: Optional[RoutingMetadata] = Field(None, description="Routing decision metadata")
    
    @validator('persona_type')
    def persona_type_must_not_be_empty(cls, v):
        if not v or not v.strip():
            raise ValueError('Persona type cannot be empty')
        return v.strip()


class CustomerPersona(BaseModel):
    """Complete customer persona profile"""
    persona_type: str = Field(..., description="Type of persona")
    customer_attributes: CustomerAttributes = Field(default_factory=CustomerAttributes, description="Customer-specific attributes")
    pain_points: PainPoints = Field(default_factory=PainPoints, description="Customer pain points")
    customer_journey: CustomerJourney = Field(default_factory=CustomerJourney, description="Customer journey patterns")
    supporting_quotes: SupportingQuotes = Field(default_factory=SupportingQuotes, description="Supporting quotes")
    metadata: PersonaMetadata = Field(default_factory=PersonaMetadata, description="Analysis metadata")
    routing_metadata: Optional[RoutingMetadata] = Field(None, description="Routing decision metadata")
    
    @validator('persona_type')
    def persona_type_must_not_be_empty(cls, v):
        if not v or not v.strip():
            raise ValueError('Persona type cannot be empty')
        return v.strip()


class HybridPersona(BaseModel):
    """Hybrid persona combining business and customer analysis"""
    persona_type: str = Field(..., description="Type of persona")
    business_attributes: BusinessAttributes = Field(default_factory=BusinessAttributes, description="Business workflow attributes")
    customer_attributes: CustomerAttributes = Field(default_factory=CustomerAttributes, description="Customer experience attributes")
    business_pain_points: PainPoints = Field(default_factory=PainPoints, description="Business-related pain points")
    customer_pain_points: PainPoints = Field(default_factory=PainPoints, description="Customer-related pain points")
    collaboration_patterns: CollaborationPatterns = Field(default_factory=CollaborationPatterns, description="Collaboration patterns")
    customer_journey: CustomerJourney = Field(default_factory=CustomerJourney, description="Customer journey patterns")
    supporting_quotes: Dict[str, SupportingQuotes] = Field(default_factory=dict, description="Supporting quotes by analysis type")
    metadata: Dict[str, PersonaMetadata] = Field(default_factory=dict, description="Metadata by analysis type")
    routing_metadata: Optional[RoutingMetadata] = Field(None, description="Routing decision metadata")
    
    @validator('persona_type')
    def persona_type_must_not_be_empty(cls, v):
        if not v or not v.strip():
            raise ValueError('Persona type cannot be empty')
        return v.strip()


class PersonaAnalysisResult(BaseModel):
    """Complete persona analysis result with multiple personas"""
    personas: List[Dict[str, Any]] = Field(default_factory=list, description="Generated personas")
    analysis_summary: Dict[str, Any] = Field(default_factory=dict, description="Overall analysis summary")
    routing_decisions: List[RoutingMetadata] = Field(default_factory=list, description="Routing decisions made")
    total_personas: int = Field(ge=0, default=0, description="Total number of personas generated")
    success_rate: float = Field(ge=0.0, le=1.0, default=0.0, description="Success rate of persona generation")
    
    @validator('total_personas')
    def validate_total_personas(cls, v, values):
        """Ensure total_personas matches the length of personas list"""
        personas = values.get('personas', [])
        return len(personas)
