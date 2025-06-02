"""
Research Input Validation Utilities
Provides validation functions for customer research inputs to improve security and robustness.
"""

import re
import logging
from typing import Dict, List, Optional, Tuple
from backend.config.research_config import VALIDATION_CONFIG, ERROR_CONFIG

logger = logging.getLogger(__name__)

class ValidationError(Exception):
    """Custom exception for validation errors"""
    def __init__(self, message: str, error_code: str = "validation_error"):
        self.message = message
        self.error_code = error_code
        super().__init__(self.message)

class ResearchValidator:
    """Validator for customer research inputs"""

    @staticmethod
    def validate_message(message: str) -> Tuple[bool, Optional[str]]:
        """
        Validate a chat message

        Args:
            message: The message to validate

        Returns:
            Tuple of (is_valid, error_message)
        """
        if not message or not message.strip():
            return False, "Message cannot be empty"

        if len(message) < VALIDATION_CONFIG.MIN_MESSAGE_LENGTH:
            return False, f"Message must be at least {VALIDATION_CONFIG.MIN_MESSAGE_LENGTH} character(s)"

        if len(message) > VALIDATION_CONFIG.MAX_MESSAGE_LENGTH:
            return False, f"Message must be less than {VALIDATION_CONFIG.MAX_MESSAGE_LENGTH} characters"

        # Check for blocked patterns
        for pattern in VALIDATION_CONFIG.BLOCKED_PATTERNS:
            if re.search(pattern, message, re.IGNORECASE):
                return False, "Message contains invalid content"

        return True, None

    @staticmethod
    def validate_business_idea(business_idea: str) -> Tuple[bool, Optional[str]]:
        """Validate business idea input"""
        if not business_idea or not business_idea.strip():
            return False, "Business idea cannot be empty"

        if len(business_idea) > VALIDATION_CONFIG.MAX_BUSINESS_IDEA_LENGTH:
            return False, f"Business idea must be less than {VALIDATION_CONFIG.MAX_BUSINESS_IDEA_LENGTH} characters"

        return True, None

    @staticmethod
    def validate_target_customer(target_customer: str) -> Tuple[bool, Optional[str]]:
        """Validate target customer input"""
        if not target_customer or not target_customer.strip():
            return False, "Target customer cannot be empty"

        if len(target_customer) > VALIDATION_CONFIG.MAX_TARGET_CUSTOMER_LENGTH:
            return False, f"Target customer must be less than {VALIDATION_CONFIG.MAX_TARGET_CUSTOMER_LENGTH} characters"

        return True, None

    @staticmethod
    def validate_problem(problem: str) -> Tuple[bool, Optional[str]]:
        """Validate problem description input"""
        if not problem or not problem.strip():
            return False, "Problem description cannot be empty"

        if len(problem) > VALIDATION_CONFIG.MAX_PROBLEM_LENGTH:
            return False, f"Problem description must be less than {VALIDATION_CONFIG.MAX_PROBLEM_LENGTH} characters"

        return True, None

    @staticmethod
    def validate_session_messages(messages: List[Dict]) -> Tuple[bool, Optional[str]]:
        """Validate session message count"""
        if len(messages) > VALIDATION_CONFIG.MAX_MESSAGES_PER_SESSION:
            return False, f"Session has too many messages (max: {VALIDATION_CONFIG.MAX_MESSAGES_PER_SESSION})"

        return True, None

    @staticmethod
    def sanitize_input(text: str) -> str:
        """
        Sanitize user input by removing potentially harmful content

        Args:
            text: The text to sanitize

        Returns:
            Sanitized text
        """
        if not text:
            return ""

        # Remove HTML tags
        text = re.sub(r'<[^>]+>', '', text)

        # Remove script content
        text = re.sub(r'<script.*?>.*?</script>', '', text, flags=re.IGNORECASE | re.DOTALL)

        # Remove javascript: URLs
        text = re.sub(r'javascript:', '', text, flags=re.IGNORECASE)

        # Remove data URLs
        text = re.sub(r'data:text/html', '', text, flags=re.IGNORECASE)

        # Normalize whitespace
        text = re.sub(r'\s+', ' ', text).strip()

        return text

    @staticmethod
    def validate_session_id(session_id: str) -> Tuple[bool, Optional[str]]:
        """Validate session ID format"""
        if not session_id:
            return False, "Session ID cannot be empty"

        # Check for valid session ID patterns
        if not (session_id.startswith('local_') or
                re.match(r'^[a-f0-9-]{36}$', session_id) or  # UUID format
                re.match(r'^[a-zA-Z0-9_-]+$', session_id)):  # Safe characters only
            return False, "Invalid session ID format"

        return True, None

    @staticmethod
    def validate_user_id(user_id: str) -> Tuple[bool, Optional[str]]:
        """Validate user ID format"""
        if not user_id:
            return False, "User ID cannot be empty"

        # Check for valid user ID patterns - be more lenient for anonymous users
        if not (user_id.startswith('anon_') or
                user_id.startswith('user_') or
                user_id.startswith('local_') or  # Allow local session IDs
                re.match(r'^[a-zA-Z0-9_-]+$', user_id)):  # Safe characters only
            return False, "Invalid user ID format"

        return True, None

def validate_research_request(request_data: Dict) -> Dict:
    """
    Validate a complete research request

    Args:
        request_data: The request data to validate

    Returns:
        Dictionary with validation results and sanitized data

    Raises:
        ValidationError: If validation fails
    """
    validator = ResearchValidator()
    errors = []
    sanitized_data = {}

    # Validate message
    if 'input' in request_data:
        is_valid, error = validator.validate_message(request_data['input'])
        if not is_valid:
            errors.append(f"Input message: {error}")
        else:
            sanitized_data['input'] = validator.sanitize_input(request_data['input'])

    # Validate session ID
    if 'session_id' in request_data and request_data['session_id']:
        is_valid, error = validator.validate_session_id(request_data['session_id'])
        if not is_valid:
            errors.append(f"Session ID: {error}")
        else:
            sanitized_data['session_id'] = request_data['session_id']

    # Validate user ID - be lenient for anonymous users
    if 'user_id' in request_data and request_data['user_id']:
        is_valid, error = validator.validate_user_id(request_data['user_id'])
        if not is_valid:
            # For research chat, create a safe anonymous user ID instead of failing
            logger.warning(f"Invalid user ID format, creating anonymous ID: {error}")
            sanitized_data['user_id'] = f"anon_{request_data['user_id']}"
        else:
            sanitized_data['user_id'] = request_data['user_id']

    # Validate context if present
    if 'context' in request_data and request_data['context']:
        context = request_data['context']

        if 'businessIdea' in context and context['businessIdea']:
            is_valid, error = validator.validate_business_idea(context['businessIdea'])
            if not is_valid:
                errors.append(f"Business idea: {error}")
            else:
                sanitized_data.setdefault('context', {})['businessIdea'] = validator.sanitize_input(context['businessIdea'])

        if 'targetCustomer' in context and context['targetCustomer']:
            is_valid, error = validator.validate_target_customer(context['targetCustomer'])
            if not is_valid:
                errors.append(f"Target customer: {error}")
            else:
                sanitized_data.setdefault('context', {})['targetCustomer'] = validator.sanitize_input(context['targetCustomer'])

        if 'problem' in context and context['problem']:
            is_valid, error = validator.validate_problem(context['problem'])
            if not is_valid:
                errors.append(f"Problem: {error}")
            else:
                sanitized_data.setdefault('context', {})['problem'] = validator.sanitize_input(context['problem'])

    # Validate messages if present
    if 'messages' in request_data and request_data['messages']:
        is_valid, error = validator.validate_session_messages(request_data['messages'])
        if not is_valid:
            errors.append(f"Messages: {error}")

    if errors:
        error_message = "; ".join(errors)
        logger.warning(f"Validation failed: {error_message}")
        raise ValidationError(error_message)

    return sanitized_data
