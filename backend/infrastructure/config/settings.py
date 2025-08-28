"""Application settings and configuration

Last Updated: 2025-03-24
"""

import os
import logging
from typing import Dict, Any, Optional, List
import json

# Import constants for LLM configuration
from backend.infrastructure.constants.llm_constants import (
    GEMINI_MODEL_NAME,
    GEMINI_TEMPERATURE,
    GEMINI_MAX_TOKENS,
    GEMINI_CONTEXT_WINDOW,
    GEMINI_TOP_P,
    GEMINI_TOP_K,
    OPENAI_MODEL_NAME,
    OPENAI_TEMPERATURE,
    OPENAI_MAX_TOKENS,
    OPENAI_CONTEXT_WINDOW,
    ENV_GEMINI_API_KEY,
    ENV_GEMINI_MODEL,
    ENV_GEMINI_TEMPERATURE,
    ENV_GEMINI_MAX_TOKENS,
    ENV_GEMINI_CONTEXT_WINDOW,
    ENV_GEMINI_TOP_P,
    ENV_GEMINI_TOP_K,
    ENV_OPENAI_API_KEY,
    ENV_OPENAI_MODEL,
    ENV_OPENAI_TEMPERATURE,
    ENV_OPENAI_MAX_TOKENS,
    ENV_OPENAI_CONTEXT_WINDOW,
    DEFAULT_TEMPERATURE,
    DEFAULT_TOP_P,
    DEFAULT_TOP_K,
)
from dataclasses import asdict

from backend.infrastructure.data.config import (
    SystemConfig,
    LLMConfig,
    ProcessingConfig,
    ValidationConfig,
)


class Settings:
    """Manages application settings and configuration"""

    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self._config: Optional[SystemConfig] = None
        self._env_vars = {}
        self._secrets = {}

        ***REMOVED*** configuration
        self.DATABASE_URL=***REDACTED***
            "DATABASE_URL", "postgresql://postgres@localhost:5432/interview_insights"
        )
        self.db_user = os.getenv("DB_USER", "postgres")
        self.DB_PASSWORD=***REMOVED***"DB_PASSWORD", "")
        self.db_host = os.getenv("DB_HOST", "localhost")
        self.db_port = int(os.getenv("DB_PORT", "5432"))
        self.db_name = os.getenv("DB_NAME", "interview_insights")
        self.db_pool_size = int(os.getenv("DB_POOL_SIZE", "5"))
        self.db_max_overflow = int(os.getenv("DB_MAX_OVERFLOW", "10"))
        self.db_pool_timeout = int(os.getenv("DB_POOL_TIMEOUT", "30"))

        # LLM Provider Configurations
        self.llm_providers = {
            "openai": {
                "api_key": os.getenv(ENV_OPENAI_API_KEY),
                "model": os.getenv(ENV_OPENAI_MODEL, OPENAI_MODEL_NAME),
                "temperature": OPENAI_TEMPERATURE,  # Explicitly set to constant value
                "max_tokens": int(
                    os.getenv(ENV_OPENAI_MAX_TOKENS, str(OPENAI_MAX_TOKENS))
                ),
                "context_window": int(
                    os.getenv(ENV_OPENAI_CONTEXT_WINDOW, str(OPENAI_CONTEXT_WINDOW))
                ),
                "top_p": DEFAULT_TOP_P,
                "top_k": DEFAULT_TOP_K,
            },
            "gemini": {
                "api_key": os.getenv(ENV_GEMINI_API_KEY),
                "model": os.getenv(ENV_GEMINI_MODEL, GEMINI_MODEL_NAME),
                "temperature": float(
                    os.getenv(ENV_GEMINI_TEMPERATURE, str(GEMINI_TEMPERATURE))
                ),
                "max_tokens": int(
                    os.getenv(ENV_GEMINI_MAX_TOKENS, str(GEMINI_MAX_TOKENS))
                ),
                "context_window": int(
                    os.getenv(ENV_GEMINI_CONTEXT_WINDOW, str(GEMINI_CONTEXT_WINDOW))
                ),
                "top_p": float(os.getenv(ENV_GEMINI_TOP_P, str(GEMINI_TOP_P))),
                "top_k": int(os.getenv(ENV_GEMINI_TOP_K, str(GEMINI_TOP_K))),
            },
            "enhanced_gemini": {
                "api_key": os.getenv(ENV_GEMINI_API_KEY),
                "model": os.getenv(ENV_GEMINI_MODEL, GEMINI_MODEL_NAME),
                "temperature": float(
                    os.getenv(ENV_GEMINI_TEMPERATURE, str(GEMINI_TEMPERATURE))
                ),
                "max_tokens": int(
                    os.getenv(ENV_GEMINI_MAX_TOKENS, str(GEMINI_MAX_TOKENS))
                ),
                "context_window": int(
                    os.getenv(ENV_GEMINI_CONTEXT_WINDOW, str(GEMINI_CONTEXT_WINDOW))
                ),
                "top_p": float(os.getenv(ENV_GEMINI_TOP_P, str(GEMINI_TOP_P))),
                "top_k": int(os.getenv(ENV_GEMINI_TOP_K, str(GEMINI_TOP_K))),
            },
        }

        # LLM Provider Service Class Mappings
        self.llm_provider_classes = {
            "openai": "backend.services.llm.openai_service.OpenAIService",
            "gemini": "backend.services.llm.gemini_llm_service.GeminiLLMService",  # Standard implementation
            "enhanced_gemini": "backend.services.llm.enhanced_gemini_llm_service.EnhancedGeminiLLMService",  # Enhanced implementation
        }

        # Default LLM provider
        self.default_llm_provider = "enhanced_gemini"

        # CORS settings - Allow Firebase App Hosting and local development
        default_origins = [
            "http://localhost:3000",  # Local Next.js dev
            "http://localhost:3001",  # Local Next.js dev (alternative port)
            "https://axwise-flow--axwise-73425.europe-west4.hosted.app",  ***REMOVED*** App Hosting
            "https://axwise.de",  # Custom domain
            "*",  # Allow all for development (remove in production)
        ]
        self.cors_origins = os.getenv("CORS_ORIGINS", ",".join(default_origins)).split(
            ","
        )
        self.cors_methods = os.getenv(
            "CORS_METHODS", "GET,POST,PUT,DELETE,OPTIONS"
        ).split(",")
        self.cors_headers = os.getenv("CORS_HEADERS", "*").split(",")

        # Authentication settings
        self.enable_CLERK_...=***REMOVED***
            os.getenv("ENABLE_CLERK_VALIDATION", "false").lower() == "true"
        )

        # Uvicorn server settings (for run_backend_api.py)
        self.uvicorn_host = os.getenv("UVICORN_HOST", "0.0.0.0")
        self.uvicorn_port = int(os.getenv("UVICORN_PORT", "8000"))
        # Default reload to False as start_app.py manages the process lifecycle (see memory d5b81941-dd81-40ad-a77c-d62414e193b8)
        self.uvicorn_reload = os.getenv("UVICORN_RELOAD", "false").lower() == "true"

        # Set default log level for httpx and httpcore to reduce debug noise
        logging.getLogger("httpx").setLevel(logging.INFO)
        logging.getLogger("httpcore").setLevel(logging.INFO)

    def load_config(self) -> SystemConfig:
        """Load system configuration"""
        try:
            # Load environment variables
            self._load_env_vars()

            # Load secrets
            self._load_secrets()

            # Create config
            self._config = SystemConfig(
                llm=self._create_llm_config(),
                processing=self._create_processing_config(),
                validation=self._create_validation_config(),
                debug_mode=self._get_bool("DEBUG_MODE", False),
                log_level=self._get_str("LOG_LEVEL", "INFO"),
            )

            return self._config

        except Exception as e:
            error_msg = f"Error loading config: {str(e)}"
            self.logger.error(error_msg)
            raise ValueError(error_msg)

    def get_config(self) -> SystemConfig:
        """Get current configuration"""
        if not self._config:
            return self.load_config()
        return self._config

    def _load_env_vars(self):
        """Load environment variables"""
        try:
            # Load from .env file if exists
            if os.path.exists(".env"):
                with open(".env") as f:
                    for line in f:
                        if line.strip() and not line.startswith("#"):
                            key, value = line.strip().split("=", 1)
                            self._env_vars[key] = value

            # Override with actual environment variables
            self._env_vars.update(os.environ)

        except Exception as e:
            self.logger.warning(f"Error loading environment variables: {str(e)}")

    def _load_secrets(self):
        """Load secrets from environment variables"""
        # We don't use streamlit, so we'll just use environment variables
        self._secrets = {}

    def _get_str(self, key: str, default: Optional[str] = None) -> Optional[str]:
        """Get string value from environment or secrets"""
        # Try secrets first
        if hasattr(self._secrets, key):
            return str(self._secrets[key])

        # Then environment variables
        return self._env_vars.get(key, default)

    def _get_int(self, key: str, default: Optional[int] = None) -> Optional[int]:
        """Get integer value from environment or secrets"""
        value = self._get_str(key)
        if value is None:
            return default
        try:
            return int(value)
        except ValueError:
            return default

    def _get_float(self, key: str, default: Optional[float] = None) -> Optional[float]:
        """Get float value from environment or secrets"""
        value = self._get_str(key)
        if value is None:
            return default
        try:
            return float(value)
        except ValueError:
            return default

    def _get_bool(self, key: str, default: Optional[bool] = None) -> Optional[bool]:
        """Get boolean value from environment or secrets"""
        value = self._get_str(key)
        if value is None:
            return default
        return value.lower() in ("true", "1", "yes", "on")

    def _get_list(self, key: str, default: Optional[list] = None) -> Optional[list]:
        """Get list value from environment or secrets"""
        value = self._get_str(key)
        if value is None:
            return default
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value.split(",")

    def _create_llm_config(self) -> LLMConfig:
        """Create LLM configuration"""
        # Determine which provider to use for default config
        provider = self._get_str("LLM_PROVIDER", "gemini").lower()

        if provider == "gemini":
            default_model = GEMINI_MODEL_NAME
            default_temperature = GEMINI_TEMPERATURE
            default_max_tokens = GEMINI_MAX_TOKENS
            api_key = self._get_str(ENV_GEMINI_API_KEY)
        else:  # Default to OpenAI
            default_model = OPENAI_MODEL_NAME
            default_temperature = OPENAI_TEMPERATURE
            default_max_tokens = OPENAI_MAX_TOKENS
            api_key = self._get_str(ENV_OPENAI_API_KEY)

        return LLMConfig(
            model=self._get_str("LLM_MODEL", default_model),
            temperature=self._get_float("LLM_TEMPERATURE", default_temperature),
            max_tokens=self._get_int("LLM_MAX_TOKENS", default_max_tokens),
            api_key=api_key,
            timeout=self._get_int("LLM_TIMEOUT", 30),
            retry_attempts=self._get_int("LLM_RETRY_ATTEMPTS", 3),
            fallback_models=self._get_list(
                "LLM_FALLBACK_MODELS", ["gpt-4o-2024-11-20", "gpt-4o-mini-2024-07-18"]
            ),
        )

    def _create_processing_config(self) -> ProcessingConfig:
        """Create processing configuration"""
        return ProcessingConfig(
            batch_size=self._get_int("PROCESSING_BATCH_SIZE", 50),
            parallel_processing=self._get_bool("PARALLEL_PROCESSING", True),
            error_handling=self._get_str("ERROR_HANDLING", "strict"),
            timeout=self._get_int("PROCESSING_TIMEOUT", 60),
        )

    def _create_validation_config(self) -> ValidationConfig:
        """Create validation configuration"""
        return ValidationConfig(
            min_confidence=self._get_float("MIN_CONFIDENCE", 0.7),
            cross_validation=self._get_bool("CROSS_VALIDATION", True),
            statistical_validation=self._get_bool("STATISTICAL_VALIDATION", True),
            semantic_validation=self._get_bool("SEMANTIC_VALIDATION", True),
        )

    def get_llm_config(self, provider: str = "openai") -> Dict[str, Any]:
        """Get LLM configuration for specific provider"""
        if provider not in self.llm_providers:
            self.logger.warning(
                f"Unknown LLM provider: {provider}, falling back to OpenAI"
            )
            provider = "openai"
        return self.llm_providers[provider].copy()

    def get_llm_provider_class(self, provider: str) -> str:
        """Get service class path for LLM provider"""
        if provider not in self.llm_provider_classes:
            raise ValueError(f"Unknown LLM provider: {provider}")
        return self.llm_provider_classes[provider]

    def validate_llm_config(self, provider: str = None) -> bool:
        """Validate LLM configuration"""
        providers_to_check = [provider] if provider else list(self.llm_providers.keys())

        for provider_name in providers_to_check:
            if provider_name not in self.llm_providers:
                self.logger.warning(f"Unknown LLM provider: {provider_name}")
                continue

            config = self.llm_providers[provider_name]

            # Debug log to see what's happening with the API key
            self.logger.debug(
                f"Validating {provider_name} config: API key present = {bool(config.get('api_key'))}"
            )

            # Always try to reload the API key from environment to ensure it's the latest
            # This helps with platform-specific environment variable handling differences
            env_var_name = f"{provider_name.upper()}_API_KEY"
            direct_key = os.getenv(env_var_name)
            if direct_key:
                self.logger.info(
                    f"Loading {provider_name} API key directly from environment variable {env_var_name}"
                )
                config["api_key"] = direct_key
                self.llm_providers[provider_name]["api_key"] = direct_key
                self.logger.debug(
                    f"API key for {provider_name} is now set: {bool(config.get('api_key'))}"
                )

            # Check API key
            if not config.get("api_key"):
                if (
                    provider == provider_name
                ):  # Only error if specifically requesting this provider
                    raise ValueError(
                        f"{provider_name.capitalize()} API key is required"
                    )
                else:
                    self.logger.warning(
                        f"{provider_name.capitalize()} API key not found. Provider will not be available."
                    )
                    continue

            # Check model name
            if not config.get("model"):
                raise ValueError(f"{provider_name.capitalize()} model name is required")

            # Check numeric parameters
            if provider_name == "openai":
                if not (0 <= config.get("temperature", 0) <= 2):
                    raise ValueError(f"OpenAI temperature must be between 0 and 2")

            elif provider_name == "gemini":
                if not (0 <= config.get("temperature", 0) <= 1):
                    raise ValueError(f"Gemini temperature must be between 0 and 1")
                if not (0 < config.get("top_p", 0.95) <= 1):
                    raise ValueError(f"Gemini top_p must be between 0 and 1")

            self.logger.info(f"Validated configuration for {provider_name}")

        return True

    def get_settings_summary(self) -> Dict[str, Any]:
        """Get summary of current settings"""
        if not self._config:
            return {}

        return {
            "config": asdict(self._config),
            "env_vars": {
                k: "***" if "key" in k.lower() or "secret" in k.lower() else v
                for k, v in self._env_vars.items()
            },
        }


# Global instance
settings = Settings()
