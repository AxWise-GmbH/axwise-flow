"""
Customer Research Configuration
Centralized configuration for customer research feature to eliminate hardcoded values.
"""

import os
from typing import Dict, List, Any
from dataclasses import dataclass
from enum import Enum

class ResearchStage(Enum):
    """Research conversation stages"""
    INITIAL = "initial"
    BUSINESS_IDEA = "business_idea"
    TARGET_CUSTOMER = "target_customer"
    PROBLEM_VALIDATION = "problem_validation"
    SOLUTION_VALIDATION = "solution_validation"

@dataclass
class ResearchConfig:
    """Configuration for customer research feature"""

    # Confirmation patterns for question generation
    CONFIRMATION_PHRASES: List[str] = None
    USER_CONFIRMATION_PHRASES: List[str] = None
    USER_REJECTION_PHRASES: List[str] = None

    # Conversation thresholds
    MIN_EXCHANGES_FOR_QUESTIONS: int = 16  # 8 user + 8 assistant messages
    MAX_CONVERSATION_LENGTH: int = 100

    # Session configuration
    SESSION_TIMEOUT_MINUTES: int = 60
    MAX_SESSIONS_PER_USER: int = 50

    # API configuration
    REQUEST_TIMEOUT_SECONDS: int = 30
    MAX_RETRIES: int = 3
    RETRY_DELAY_SECONDS: int = 1

    # Question generation limits
    MAX_PROBLEM_DISCOVERY_QUESTIONS: int = 5
    MAX_SOLUTION_VALIDATION_QUESTIONS: int = 5
    MAX_FOLLOW_UP_QUESTIONS: int = 3

    # Rate limiting (per minute)
    CHAT_RATE_LIMIT: int = 30
    QUESTIONS_RATE_LIMIT: int = 20

    def __post_init__(self):
        if self.CONFIRMATION_PHRASES is None:
            self.CONFIRMATION_PHRASES = [
                "yes, that's correct",
                "yes that's correct",
                "that's correct",
                "yes correct",
                "exactly right",
                "that's right",
                "sounds good",
                "perfect",
                "yes, exactly"
            ]

        if self.USER_CONFIRMATION_PHRASES is None:
            self.USER_CONFIRMATION_PHRASES = [
                'yes', 'correct', 'that\'s right', 'exactly', 'sounds good',
                'let\'s do it', 'generate questions', 'create questions', 'ready',
                'proceed', 'continue', 'that works', 'looks good', 'yes, that\'s correct',
                'yes that\'s correct', 'that\'s correct', 'yes correct', 'exactly right',
                'perfect', 'yes, exactly'
            ]

        if self.USER_REJECTION_PHRASES is None:
            self.USER_REJECTION_PHRASES = [
                'no', 'nope', 'not correct', 'not right', 'wrong', 'incorrect',
                'that\'s not right', 'that\'s not correct', 'nope it is not',
                'no it is not', 'not exactly', 'not quite', 'not really',
                'i need to clarify', 'let me clarify', 'let me add something',
                'i want to add', 'but i have more', 'but there\'s more'
            ]

@dataclass
class IndustryGuidance:
    """Industry-specific guidance configuration"""

    GUIDANCE_TEMPLATES: Dict[str, str] = None

    def __post_init__(self):
        if self.GUIDANCE_TEMPLATES is None:
            self.GUIDANCE_TEMPLATES = {
                "saas": """
For SaaS businesses, focus on:
- User adoption and onboarding challenges
- Feature usage and engagement metrics
- Pricing sensitivity and willingness to pay
- Integration needs with existing tools
- Churn reasons and retention factors
""",
                "ecommerce": """
For e-commerce businesses, focus on:
- Purchase decision factors and barriers
- Shopping behavior and preferences
- Price sensitivity and comparison shopping
- Trust and security concerns
- Post-purchase experience and loyalty
""",
                "healthcare": """
For healthcare businesses, focus on:
- Compliance and regulatory requirements
- Patient/provider workflow integration
- Privacy and security concerns
- Clinical outcomes and effectiveness
- Adoption barriers in healthcare settings
""",
                "fintech": """
For fintech businesses, focus on:
- Trust and security perceptions
- Regulatory compliance needs
- Integration with existing financial systems
- User financial behavior and pain points
- Risk tolerance and decision-making factors
""",
                "edtech": """
For education technology, focus on:
- Learning outcomes and effectiveness
- User engagement and motivation
- Integration with existing curricula
- Accessibility and ease of use
- Cost-benefit for educational institutions
""",
                "manufacturing": """
For manufacturing businesses, focus on:
- Operational efficiency improvements
- Integration with existing systems
- ROI and cost-benefit analysis
- Compliance and safety requirements
- Scalability and implementation challenges
""",
                "automotive": """
For automotive businesses, focus on:
- Safety and reliability concerns
- Integration with existing vehicle systems
- User experience while driving
- Maintenance and support needs
- Regulatory and compliance requirements
""",
                "real_estate": """
For real estate businesses, focus on:
- Market timing and decision factors
- Trust and credibility in transactions
- Technology adoption in traditional industry
- Regulatory and legal considerations
- Geographic and local market factors
""",
                "general": """
For this business, focus on:
- Core value proposition validation
- User adoption and engagement
- Competitive landscape and differentiation
- Pricing and business model validation
- Scalability and growth potential
"""
            }

# Environment-based configuration
def get_research_config() -> ResearchConfig:
    """Get research configuration based on environment"""
    is_production = os.getenv("ENVIRONMENT", "development").lower() == "production"

    config = ResearchConfig()

    # Adjust for production
    if is_production:
        config.CHAT_RATE_LIMIT = int(os.getenv("RESEARCH_CHAT_RATE_LIMIT", "30"))
        config.QUESTIONS_RATE_LIMIT = int(os.getenv("RESEARCH_QUESTIONS_RATE_LIMIT", "20"))
        config.REQUEST_TIMEOUT_SECONDS = int(os.getenv("RESEARCH_REQUEST_TIMEOUT", "30"))
    else:
        # More lenient for development
        config.CHAT_RATE_LIMIT = int(os.getenv("RESEARCH_CHAT_RATE_LIMIT", "100"))
        config.QUESTIONS_RATE_LIMIT = int(os.getenv("RESEARCH_QUESTIONS_RATE_LIMIT", "50"))
        config.REQUEST_TIMEOUT_SECONDS = int(os.getenv("RESEARCH_REQUEST_TIMEOUT", "60"))

    return config

def get_industry_guidance() -> IndustryGuidance:
    """Get industry guidance configuration"""
    return IndustryGuidance()

@dataclass
class ValidationConfig:
    """Input validation configuration"""

    # Message validation
    MAX_MESSAGE_LENGTH: int = 2000
    MIN_MESSAGE_LENGTH: int = 1

    # Context validation
    MAX_BUSINESS_IDEA_LENGTH: int = 500
    MAX_TARGET_CUSTOMER_LENGTH: int = 300
    MAX_PROBLEM_LENGTH: int = 500

    # Session validation
    MAX_MESSAGES_PER_SESSION: int = 200

    # Content filtering
    BLOCKED_PATTERNS: List[str] = None

    def __post_init__(self):
        if self.BLOCKED_PATTERNS is None:
            self.BLOCKED_PATTERNS = [
                # Add patterns for inappropriate content
                r'<script.*?>.*?</script>',  # Script tags
                r'javascript:',  # JavaScript URLs
                r'data:text/html',  # Data URLs
            ]

@dataclass
class ErrorConfig:
    """Error handling configuration"""

    # Error messages
    ERROR_MESSAGES: Dict[str, str] = None

    # Retry configuration
    EXPONENTIAL_BACKOFF: bool = True
    MAX_BACKOFF_SECONDS: int = 30

    # Fallback responses
    FALLBACK_RESPONSES: Dict[str, str] = None

    def __post_init__(self):
        if self.ERROR_MESSAGES is None:
            self.ERROR_MESSAGES = {
                "api_timeout": "I'm taking a bit longer to respond than usual. Please try again.",
                "api_error": "I'm having trouble processing your request right now. Please try again in a moment.",
                "validation_error": "I couldn't process your message. Please try rephrasing it.",
                "rate_limit": "You're sending messages too quickly. Please wait a moment before trying again.",
                "session_expired": "Your session has expired. Please start a new conversation.",
                "service_unavailable": "The research assistant is temporarily unavailable. Please try again later."
            }

        if self.FALLBACK_RESPONSES is None:
            self.FALLBACK_RESPONSES = {
                "general": "I'm having trouble understanding. Could you tell me more about your business idea?",
                "business_idea": "Let's start with the basics - what's your business idea?",
                "target_customer": "Who do you think would be most interested in your solution?",
                "problem": "What problem are you trying to solve for your customers?"
            }

def get_validation_config() -> ValidationConfig:
    """Get validation configuration"""
    config = ValidationConfig()

    # Override from environment if needed
    config.MAX_MESSAGE_LENGTH = int(os.getenv("RESEARCH_MAX_MESSAGE_LENGTH", "2000"))
    config.MAX_MESSAGES_PER_SESSION = int(os.getenv("RESEARCH_MAX_MESSAGES_PER_SESSION", "200"))

    return config

def get_error_config() -> ErrorConfig:
    """Get error handling configuration"""
    return ErrorConfig()

# Global instances
RESEARCH_CONFIG = get_research_config()
INDUSTRY_GUIDANCE = get_industry_guidance()
VALIDATION_CONFIG = get_validation_config()
ERROR_CONFIG = get_error_config()
