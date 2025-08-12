"""cleanup persona data - fix incomplete PersonaTrait structures

Revision ID: 20250812_1400
Revises: 20250408_1200
Create Date: 2025-08-12 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import json
import logging

# revision identifiers, used by Alembic.
revision = '20250812_1400'
down_revision = '20250408_1200'
branch_labels = None
depends_on = None

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def create_valid_persona_trait(value=None, confidence=None, evidence=None):
    """Create a valid PersonaTrait structure with fallbacks."""
    return {
        "value": value if value and str(value).strip() else "Not specified",
        "confidence": float(confidence) if confidence and 0 <= float(confidence) <= 1 else 0.3,
        "evidence": evidence if isinstance(evidence, list) and evidence else ["Inferred from interview data"]
    }

def validate_and_fix_persona_trait(trait_data, field_name):
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
    if not value or (isinstance(value, str) and not value.strip()):
        value = "Not specified"
        confidence = max(0.3, float(confidence) * 0.5)  # Reduce confidence for default values
    
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
        "evidence": cleaned_evidence[:10]  # Limit to 10 items
    }

def upgrade():
    """Clean up incomplete persona records."""
    logger.info("Starting persona data cleanup migration...")
    
    # Get database connection
    connection = op.get_bind()
    
    # Define PersonaTrait fields to validate
    persona_trait_fields = [
        'demographics', 'goals_and_motivations', 'skills_and_expertise',
        'workflow_and_environment', 'challenges_and_frustrations', 'needs_and_desires',
        'technology_and_tools', 'attitude_towards_research', 'attitude_towards_ai',
        'key_quotes', 'role_context', 'key_responsibilities', 'tools_used',
        'collaboration_style', 'analysis_approach', 'pain_points'
    ]
    
    # Get all personas
    result = connection.execute(sa.text("SELECT persona_id, name FROM personas"))
    personas = result.fetchall()
    
    logger.info(f"Found {len(personas)} personas to validate and fix")
    
    updated_count = 0
    
    for persona_id, persona_name in personas:
        logger.info(f"Processing persona {persona_id}: {persona_name}")
        
        # Get current persona data
        persona_result = connection.execute(
            sa.text("SELECT * FROM personas WHERE persona_id = :persona_id"),
            {"persona_id": persona_id}
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
                fixed_value = validate_and_fix_persona_trait(original_value, field_name)
                
                # Check if the value changed
                if original_value != fixed_value:
                    updates[field_name] = json.dumps(fixed_value)
                    needs_update = True
                    logger.info(f"  Fixed {field_name} for persona {persona_id}")
        
        # Validate basic fields
        if not persona_dict.get('name') or not str(persona_dict['name']).strip():
            updates['name'] = f"Persona {persona_id}"
            needs_update = True
            logger.info(f"  Fixed name for persona {persona_id}")
        
        if not persona_dict.get('description'):
            updates['description'] = "Generated persona from interview analysis"
            needs_update = True
            logger.info(f"  Fixed description for persona {persona_id}")
        
        # Validate confidence score
        confidence = persona_dict.get('confidence')
        if confidence is None or confidence < 0.3 or confidence > 1.0:
            updates['confidence'] = 0.3
            needs_update = True
            logger.info(f"  Fixed confidence for persona {persona_id}")
        
        # Apply updates if needed
        if needs_update:
            # Build update query
            set_clauses = []
            params = {"persona_id": persona_id}
            
            for field, value in updates.items():
                set_clauses.append(f"{field} = :{field}")
                params[field] = value
            
            update_query = f"UPDATE personas SET {', '.join(set_clauses)} WHERE persona_id = :persona_id"
            
            try:
                connection.execute(sa.text(update_query), params)
                updated_count += 1
                logger.info(f"  Successfully updated persona {persona_id}")
            except Exception as e:
                logger.error(f"  Error updating persona {persona_id}: {str(e)}")
    
    logger.info(f"Persona data cleanup completed. Updated {updated_count} out of {len(personas)} personas.")

def downgrade():
    """This migration cannot be easily reversed as it fixes data integrity issues."""
    logger.warning("Downgrade not implemented - this migration fixes data integrity and cannot be easily reversed")
    pass
