from dataclasses import dataclass
from typing import Dict, Any, Optional, List
from enum import Enum
import logging
import os

logger = logging.getLogger(__name__)

class ConfigurationError(Exception):
    """Base class for configuration related errors"""
    pass

class ModelValidationError(ConfigurationError):
    """Raised when model configuration is invalid"""
    pass

class APIKeyValidationError(ConfigurationError):
    """Raised when API key is missing or invalid"""
    pass

class ProcessingConfigError(ConfigurationError):
    """Raised when processing configuration is invalid"""
    pass

class ValidationConfigError(ConfigurationError):
    """Raised when validation configuration is invalid"""
    pass

class ModelCapability:
    def __init__(self, context_window: int, max_output_tokens: int):
        self.context_window = context_window
        self.max_output_tokens = max_output_tokens

class ModelType(Enum):
    GPT4O = "gpt-4o"
    GPT4O_MINI = "gpt-4o-mini"

# Supported models with their capabilities
MODEL_CAPABILITIES = {
    "gpt-4o-2024-08-06": ModelCapability(128000, 16384),
    "gpt-4o-mini-2024-07-18": ModelCapability(128000, 16384),
    "gpt-4o-2024-05-13": ModelCapability(128000, 4096),
}

@dataclass
class LLMConfig:
    model: str = "gpt-4o-2024-08-06"
    temperature: float = 0.3
    max_tokens: int = 16384
    api_key: Optional[str] = None
    timeout: int = 300
    retry_attempts: int = 3
    fallback_models: List[str] = None

    def __post_init__(self):
        self.validate()
        if self.fallback_models is None:
            self.fallback_models = [
                "gpt-4o-mini-2024-07-18",
                "gpt-4o-2024-05-13",
            ]

    def validate(self, strict: bool = False):
        """Validate LLM configuration"""
        if strict:
            if not self.api_key:
                raise APIKeyValidationError("OpenAI API key is required")
            if self.api_key == "your-api-key-here":
                raise APIKeyValidationError("OpenAI API key must be configured in .streamlit/secrets.toml")

        if self.model not in MODEL_CAPABILITIES:
            supported_models = list(MODEL_CAPABILITIES.keys())
            raise ModelValidationError(
                f"Unsupported model: {self.model}. "
                f"Supported models are: {', '.join(supported_models)}"
            )

        if not (0.0 <= self.temperature <= 1.0):
            raise ModelValidationError("Temperature must be between 0.0 and 1.0")

        if self.max_tokens <= 0:
            raise ModelValidationError("max_tokens must be positive")

        if self.timeout < 30:
            raise ModelValidationError("timeout must be at least 30 seconds")

        if self.retry_attempts < 0:
            raise ModelValidationError("retry_attempts must be non-negative")

        capability = self.get_model_capability()
        if self.max_tokens > capability.max_output_tokens:
            raise ModelValidationError(
                f"max_tokens ({self.max_tokens}) exceeds model capability "
                f"({capability.max_output_tokens})"
            )

    def get_model_capability(self, model_name: str = None) -> Optional[ModelCapability]:
        """Get capabilities for specified model or current model"""
        model = model_name or self.model
        capability = MODEL_CAPABILITIES.get(model)
        if not capability:
            logger.warning(f"No capability information for model: {model}")
        return capability

    def validate_token_limit(self, token_count: int, model_name: str = None) -> bool:
        """Check if token count is within model's capabilities"""
        capability = self.get_model_capability(model_name)
        if not capability:
            return False
        return token_count <= capability.context_window

    def get_batch_size(self, token_count: int) -> int:
        """Calculate optimal batch size based on token count"""
        capability = self.get_model_capability()
        if not capability:
            return 1

        max_tokens = capability.context_window
        # Leave room for response tokens
        available_tokens = max_tokens - self.max_tokens

        # Calculate how many items we can fit
        items_per_batch = max(1, available_tokens // token_count)
        return min(items_per_batch, 50)  # Cap at 50 items per batch

@dataclass
class ProcessingConfig:
    batch_size: int = 50
    parallel_processing: bool = True
    error_handling: str = "strict"
    timeout: int = 300
    chunk_size: int = 32000
    overlap: int = 1000

    def __post_init__(self):
        self.validate()

    def validate(self):
        """Validate processing configuration"""
        if self.batch_size <= 0:
            raise ProcessingConfigError("batch_size must be positive")

        if self.timeout <= 0:
            raise ProcessingConfigError("timeout must be positive")

        if self.chunk_size <= 0:
            raise ProcessingConfigError("chunk_size must be positive")

        if self.overlap < 0:
            raise ProcessingConfigError("overlap must be non-negative")

        if self.overlap >= self.chunk_size:
            raise ProcessingConfigError("overlap must be less than chunk_size")

        if self.error_handling not in ["strict", "lenient"]:
            raise ProcessingConfigError('error_handling must be "strict" or "lenient"')

@dataclass
class ValidationConfig:
    min_confidence: float = 0.85
    cross_validation: bool = True
    statistical_validation: bool = True
    semantic_validation: bool = True
    quality_threshold: float = 0.9

    def __post_init__(self):
        self.validate()

    def validate(self):
        """Validate validation configuration"""
        if not (0.0 <= self.min_confidence <= 1.0):
            raise ValidationConfigError("min_confidence must be between 0.0 and 1.0")

        if not (0.0 <= self.quality_threshold <= 1.0):
            raise ValidationConfigError("quality_threshold must be between 0.0 and 1.0")

@dataclass
class SystemConfig:
    llm: LLMConfig
    processing: ProcessingConfig
    validation: ValidationConfig
    debug_mode: bool = False
    log_level: str = "INFO"

    def __post_init__(self):
        self.validate()

    def validate(self, strict: bool = False):
        """Validate complete system configuration"""
        try:
            self.llm.validate(strict=strict)
            self.processing.validate()
            self.validation.validate()

            if self.log_level not in ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]:
                raise ConfigurationError(f"Invalid log_level: {self.log_level}")

        except ConfigurationError as e:
            if strict:
                logger.error(f"Configuration validation failed: {str(e)}")
                raise
            else:
                logger.warning(f"Configuration validation issue (non-strict mode): {str(e)}")

    @classmethod
    def from_env(cls) -> 'SystemConfig':
        """Create configuration from environment variables"""
        try:
            # Load and validate LLM config
            llm_config = LLMConfig(
                model=os.getenv("MODEL_NAME", "gpt-4o-2024-08-06"),
                temperature=float(os.getenv("TEMPERATURE", "0.3")),
                max_tokens=int(os.getenv("MAX_TOKENS", "16384")),
                api_key=os.getenv("OPENAI_API_KEY"),
                timeout=int(os.getenv("TIMEOUT", "300")),
                retry_attempts=int(os.getenv("RETRY_ATTEMPTS", "3"))
            )

            # Load and validate processing config
            processing_config = ProcessingConfig(
                batch_size=int(os.getenv("BATCH_SIZE", "50")),
                parallel_processing=bool(int(os.getenv("PARALLEL_PROCESSING", "1"))),
                error_handling=os.getenv("ERROR_HANDLING", "strict"),
                timeout=int(os.getenv("PROCESSING_TIMEOUT", "300")),
                chunk_size=int(os.getenv("CHUNK_SIZE", "32000")),
                overlap=int(os.getenv("OVERLAP", "1000"))
            )

            # Load and validate validation config
            validation_config = ValidationConfig(
                min_confidence=float(os.getenv("MIN_CONFIDENCE", "0.85")),
                cross_validation=bool(int(os.getenv("CROSS_VALIDATION", "1"))),
                statistical_validation=bool(int(os.getenv("STATISTICAL_VALIDATION", "1"))),
                semantic_validation=bool(int(os.getenv("SEMANTIC_VALIDATION", "1"))),
                quality_threshold=float(os.getenv("QUALITY_THRESHOLD", "0.9"))
            )

            config = cls(
                llm=llm_config,
                processing=processing_config,
                validation=validation_config,
                debug_mode=bool(int(os.getenv("DEBUG_MODE", "0"))),
                log_level=os.getenv("LOG_LEVEL", "INFO")
            )

            # Validate complete configuration with non-strict mode
            config.validate(strict=False)

            return config

        except Exception as e:
            logger.error(f"Error loading configuration from environment: {str(e)}")
            # Fallback to default configuration
            logger.info("Falling back to default configuration")
            return cls.default()

    @classmethod
    def default(cls) -> 'SystemConfig':
        """Create default configuration with hardcoded defaults"""
        try:
            # Load and validate LLM config with hardcoded defaults
            llm_config = LLMConfig(
                model="gpt-4o-2024-08-06",
                temperature=0.3,
                max_tokens=16384,
                api_key=os.getenv("OPENAI_API_KEY"),
                timeout=300,
                retry_attempts=3
            )

            # Load and validate processing config
            processing_config = ProcessingConfig(
                batch_size=50,
                parallel_processing=True,
                error_handling="strict",
                timeout=300,
                chunk_size=32000,
                overlap=1000
            )

            # Load and validate validation config
            validation_config = ValidationConfig(
                min_confidence=0.85,
                cross_validation=True,
                statistical_validation=True,
                semantic_validation=True,
                quality_threshold=0.9
            )

            config = cls(
                llm=llm_config,
                processing=processing_config,
                validation=validation_config,
                debug_mode=False,
                log_level="INFO"
            )

            # Validate complete configuration with non-strict mode
            config.validate(strict=False)

            return config

        except Exception as e:
            logger.error(f"Error loading configuration: {str(e)}")
            raise ConfigurationError(f"Failed to load configuration: {str(e)}")

    def to_dict(self) -> Dict[str, Any]:
        """Convert configuration to dictionary"""
        return {
            'llm': {
                'model': self.llm.model,
                'temperature': self.llm.temperature,
                'max_tokens': self.llm.max_tokens,
                'timeout': self.llm.timeout,
                'retry_attempts': self.llm.retry_attempts,
                'fallback_models': self.llm.fallback_models,
                'api_key_configured': bool(self.llm.api_key)
            },
            'processing': {
                'batch_size': self.processing.batch_size,
                'parallel_processing': self.processing.parallel_processing,
                'error_handling': self.processing.error_handling,
                'timeout': self.processing.timeout,
                'chunk_size': self.processing.chunk_size,
                'overlap': self.processing.overlap
            },
            'validation': {
                'min_confidence': self.validation.min_confidence,
                'cross_validation': self.validation.cross_validation,
                'statistical_validation': self.validation.statistical_validation,
                'semantic_validation': self.validation.semantic_validation,
                'quality_threshold': self.validation.quality_threshold
            },
            'debug_mode': self.debug_mode,
            'log_level': self.log_level
        }
