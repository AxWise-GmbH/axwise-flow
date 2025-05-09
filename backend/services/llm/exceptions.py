class LLMServiceError(Exception):
    """Base exception for LLM services."""
    pass

class LLMAPIError(LLMServiceError):
    """Exception for errors during LLM API calls."""
    pass

class LLMResponseParseError(LLMServiceError):
    """Exception for errors when parsing LLM responses."""
    pass
