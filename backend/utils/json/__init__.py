"""
JSON utilities package.

This package contains utilities for working with JSON data, including parsing,
validation, and repair.
"""

# Import from existing modules for backward compatibility
from .json_parser import (
    parse_llm_json_response,
    normalize_persona_response,
    extract_themes_from_text
)

from .json_repair import (
    repair_json,
    parse_json_safely,
    parse_json_array_safely,
    repair_enhanced_themes_json
)

# Import new unified utilities
from .json_processor import JSONProcessor
from .json_validator import JSONValidator
from .schema_registry import SchemaRegistry

# Import new Instructor-based utilities
from .instructor_parser import (
    instructor_parser,
    parse_json_with_instructor,
    parse_llm_json_response_with_instructor,
    parse_with_model_instructor
)

__all__ = [
    # Legacy functions for backward compatibility
    'parse_llm_json_response',
    'normalize_persona_response',
    'extract_themes_from_text',
    'repair_json',
    'parse_json_safely',
    'parse_json_array_safely',
    'repair_enhanced_themes_json',

    # New unified classes
    'JSONProcessor',
    'JSONValidator',
    'SchemaRegistry',

    # New Instructor-based utilities
    'instructor_parser',
    'parse_json_with_instructor',
    'parse_llm_json_response_with_instructor',
    'parse_with_model_instructor'
]
