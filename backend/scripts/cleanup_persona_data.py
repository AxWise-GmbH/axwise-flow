#!/usr/bin/env python3
"""
Standalone script to clean up incomplete persona records in the database.

This script validates and fixes PersonaTrait structures in the personas table,
ensuring all fields have proper value, confidence, and evidence structure.

Usage:
    python -m backend.scripts.cleanup_persona_data [--dry-run] [--verbose]

Options:
    --dry-run    Show what would be changed without making actual changes
    --verbose    Show detailed logging information
"""

import argparse
import json
import logging
import sys
from typing import Dict, Any, List, Optional

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Set up logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def create_valid_persona_trait(
    value: Optional[str] = None,
    confidence: Optional[float] = None,
    evidence: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Create a valid PersonaTrait structure with fallbacks."""
    return {
        "value": value if value and str(value).strip() else "Not specified",
        "confidence": (
            float(confidence) if confidence and 0 <= float(confidence) <= 1 else 0.3
        ),
        "evidence": (
            evidence
            if isinstance(evidence, list) and evidence
            else ["Inferred from interview data"]
        ),
    }


def validate_and_fix_persona_trait(trait_data: Any, field_name: str) -> Dict[str, Any]:
    """Validate and fix a PersonaTrait JSON object."""
    if not trait_data:
        return create_valid_persona_trait()

    if isinstance(trait_data, str):
        try:
            trait_data = json.loads(trait_data)
        except json.JSONDecodeError:
            logger.warning(f"Invalid JSON in {field_name}, creating default trait")
            return create_valid_persona_trait()

    if not isinstance(trait_data, dict):
        logger.warning(f"Invalid trait format in {field_name}, creating default trait")
        return create_valid_persona_trait()

    # Extract and validate fields
    value = trait_data.get("value", "")
    confidence = trait_data.get("confidence", 0.3)
    evidence = trait_data.get("evidence", [])

    # Fix empty or invalid values
    if (
        not value
        or (isinstance(value, str) and not value.strip())
        or value == "Not specified"
    ):
        value = "Information not available from the analysis"
        confidence = 0.3  # Set to minimum confidence for default values

    # Validate confidence
    try:
        confidence = float(confidence)
        if confidence < 0 or confidence > 1:
            confidence = 0.3
    except (ValueError, TypeError):
        confidence = 0.3

    # Ensure minimum confidence
    if confidence < 0.3:
        confidence = 0.3

    # Validate evidence
    if not isinstance(evidence, list):
        evidence = []

    # Clean evidence list
    cleaned_evidence = []
    for item in evidence:
        if isinstance(item, str) and item.strip():
            cleaned_evidence.append(item.strip())

    if not cleaned_evidence:
        cleaned_evidence = ["Inferred from interview data"]

    return {
        "value": str(value).strip(),
        "confidence": confidence,
        "evidence": cleaned_evidence[:10],  # Limit to 10 items
    }


def get_database_connection():
    """Get database connection using environment variables or defaults."""
    import os

    # Try to get database URL from environment
    DATABASE_URL=***REDACTED***
    if database_url:
        return create_engine(database_url)

    # Fallback to individual components
    db_host = os.getenv("DB_HOST", "localhost")
    db_port = os.getenv("DB_PORT", "5432")
    db_name = os.getenv("DB_NAME", "interview_insights")
    db_user = os.getenv("DB_USER", "postgres")
    DB_PASSWORD=***REMOVED***"DB_PASSWORD", "")

    DATABASE_URL=***REDACTED***
    return create_engine(database_url)


def cleanup_persona_data(dry_run: bool = False, verbose: bool = False) -> None:
    """Clean up incomplete persona records."""
    if verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    logger.info("Starting persona data cleanup...")
    if dry_run:
        logger.info("DRY RUN MODE - No changes will be made")

    try:
        # Get database connection
        engine = get_database_connection()

        with engine.connect() as connection:
            # Define PersonaTrait fields to validate
            persona_trait_fields = [
                "demographics",
                "goals_and_motivations",
                "skills_and_expertise",
                "workflow_and_environment",
                "challenges_and_frustrations",
                "needs_and_desires",
                "technology_and_tools",
                "attitude_towards_research",
                "attitude_towards_ai",
                "key_quotes",
                "role_context",
                "key_responsibilities",
                "tools_used",
                "collaboration_style",
                "analysis_approach",
                "pain_points",
            ]

            # Get all personas
            result = connection.execute(
                text("SELECT persona_id, name FROM personas ORDER BY persona_id")
            )
            personas = result.fetchall()

            logger.info(f"Found {len(personas)} personas to validate and fix")

            updated_count = 0

            for persona_id, persona_name in personas:
                logger.info(f"Processing persona {persona_id}: {persona_name}")

                # Get current persona data
                persona_result = connection.execute(
                    text("SELECT * FROM personas WHERE persona_id = :persona_id"),
                    {"persona_id": persona_id},
                )
                persona_data = persona_result.fetchone()

                if not persona_data:
                    continue

                # Convert to dict for easier access
                persona_dict = dict(persona_data._mapping)

                # Track if any updates are needed
                needs_update = False
                updates = {}

                # Validate and fix each PersonaTrait field
                for field_name in persona_trait_fields:
                    if field_name in persona_dict:
                        original_value = persona_dict[field_name]
                        fixed_value = validate_and_fix_persona_trait(
                            original_value, field_name
                        )

                        # Check if the value changed
                        if original_value != fixed_value:
                            updates[field_name] = json.dumps(fixed_value)
                            needs_update = True
                            if verbose:
                                logger.debug(
                                    f"  Fixed {field_name} for persona {persona_id}"
                                )

                # Validate basic fields
                if (
                    not persona_dict.get("name")
                    or not str(persona_dict["name"]).strip()
                ):
                    updates["name"] = f"Persona {persona_id}"
                    needs_update = True
                    if verbose:
                        logger.debug(f"  Fixed name for persona {persona_id}")

                if not persona_dict.get("description"):
                    updates["description"] = "Generated persona from interview analysis"
                    needs_update = True
                    if verbose:
                        logger.debug(f"  Fixed description for persona {persona_id}")

                # Validate confidence score
                confidence = persona_dict.get("confidence")
                if confidence is None or confidence < 0.3 or confidence > 1.0:
                    updates["confidence"] = 0.3
                    needs_update = True
                    if verbose:
                        logger.debug(f"  Fixed confidence for persona {persona_id}")

                # Apply updates if needed
                if needs_update:
                    if dry_run:
                        logger.info(
                            f"  [DRY RUN] Would update persona {persona_id} with {len(updates)} changes"
                        )
                        if verbose:
                            for field, value in updates.items():
                                logger.debug(f"    {field}: {value}")
                    else:
                        # Build update query
                        set_clauses = []
                        params = {"persona_id": persona_id}

                        for field, value in updates.items():
                            set_clauses.append(f"{field} = :{field}")
                            params[field] = value

                        update_query = f"UPDATE personas SET {', '.join(set_clauses)} WHERE persona_id = :persona_id"

                        try:
                            connection.execute(text(update_query), params)
                            connection.commit()
                            updated_count += 1
                            logger.info(f"  Successfully updated persona {persona_id}")
                        except Exception as e:
                            logger.error(
                                f"  Error updating persona {persona_id}: {str(e)}"
                            )
                            connection.rollback()
                else:
                    if verbose:
                        logger.debug(f"  Persona {persona_id} is already valid")

            if dry_run:
                logger.info(
                    f"Persona data cleanup completed (DRY RUN). Would update {updated_count} out of {len(personas)} personas."
                )
            else:
                logger.info(
                    f"Persona data cleanup completed. Updated {updated_count} out of {len(personas)} personas."
                )

    except Exception as e:
        logger.error(f"Error during persona cleanup: {str(e)}")
        sys.exit(1)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Clean up incomplete persona records in the database"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be changed without making actual changes",
    )
    parser.add_argument(
        "--verbose", action="store_true", help="Show detailed logging information"
    )

    args = parser.parse_args()

    cleanup_persona_data(dry_run=args.dry_run, verbose=args.verbose)


if __name__ == "__main__":
    main()
