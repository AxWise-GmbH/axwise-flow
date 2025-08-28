"""
Schema registry for JSON schemas.

This module provides a registry for JSON schemas used throughout the application,
allowing for centralized management of schemas and response formats.
"""

import logging
from typing import Dict, Any, Optional, Type
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class SchemaRegistry:
    """
    Registry for JSON schemas.

    This class provides a centralized registry for JSON schemas used throughout
    the application, with methods for registering, retrieving, and generating
    schemas from Pydantic models.
    """

    # Class-level storage for schemas
    _schemas: Dict[str, Dict[str, Any]] = {}

    @classmethod
    def register_schema(cls, name: str, schema: Dict[str, Any]) -> None:
        """
        Register a schema with the registry.

        Args:
            name: The name to register the schema under
            schema: The JSON schema to register
        """
        cls._schemas[name] = schema
        logger.info(f"Registered schema: {name}")

    @classmethod
    def get_schema(cls, name: str) -> Optional[Dict[str, Any]]:
        """
        Get a schema from the registry.

        Args:
            name: The name of the schema to retrieve

        Returns:
            The JSON schema, or None if not found
        """
        schema = cls._schemas.get(name)
        if schema is None:
            logger.warning(f"Schema not found: {name}")
        return schema

    @classmethod
    def register_model(cls, name: str, model_class: Type[BaseModel]) -> None:
        """
        Register a Pydantic model as a schema.

        Args:
            name: The name to register the schema under
            model_class: The Pydantic model class to generate a schema from
        """
        schema = model_class.schema()
        cls.register_schema(name, schema)

    @classmethod
    def has_schema(cls, name: str) -> bool:
        """
        Check if a schema exists in the registry.

        Args:
            name: The name of the schema to check

        Returns:
            True if the schema exists, False otherwise
        """
        return name in cls._schemas

    @classmethod
    def list_schemas(cls) -> Dict[str, Dict[str, Any]]:
        """
        Get all registered schemas.

        Returns:
            Dictionary of all registered schemas
        """
        return cls._schemas.copy()

    @classmethod
    def clear(cls) -> None:
        """
        Clear all registered schemas.
        """
        cls._schemas.clear()
        logger.info("Cleared all registered schemas")

    @classmethod
    def initialize_default_schemas(cls) -> None:
        """
        Initialize default schemas from domain models.

        This method registers schemas for all the domain models in the application.
        """
        # Import domain models here to avoid circular imports
        from backend.models.transcript import (
            TranscriptSegment,
            TranscriptMetadata,
            StructuredTranscript,
        )

        # Register transcript schemas
        cls.register_model("transcript_segment", TranscriptSegment)
        cls.register_model("transcript_metadata", TranscriptMetadata)
        cls.register_model("structured_transcript", StructuredTranscript)

        # Additional schemas will be registered as more domain models are created

        logger.info("Initialized default schemas from domain models")
