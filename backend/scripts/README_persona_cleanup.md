# Persona Data Cleanup Tools

This directory contains tools to fix incomplete persona field population issues in the database.

## Problem Description

The persona field population issues were caused by:
1. PersonaTrait objects with empty `value` fields
2. Missing or invalid `confidence` scores
3. Empty or missing `evidence` arrays
4. Inconsistent data formats between object and dictionary representations

## Available Tools

### 1. Database Migration (Recommended)

**File**: `backend/migrations/versions/20250812_1400_cleanup_persona_data.py`

This Alembic migration automatically fixes all incomplete persona records during database upgrade.

**Usage**:
```bash
# Run the migration
alembic upgrade head
```

**What it does**:
- Validates all PersonaTrait fields in the personas table
- Fixes empty values with meaningful defaults
- Ensures confidence scores are between 0.3 and 1.0
- Adds default evidence for fields without supporting data
- Updates persona names and descriptions if missing

### 2. Standalone Cleanup Script

**File**: `backend/scripts/cleanup_persona_data.py`

A standalone Python script that can be run independently of migrations.

**Usage**:
```bash
# Dry run (shows what would be changed)
python -m backend.scripts.cleanup_persona_data --dry-run --verbose

# Actually perform the cleanup
python -m backend.scripts.cleanup_persona_data

# With verbose logging
python -m backend.scripts.cleanup_persona_data --verbose
```

**Options**:
- `--dry-run`: Preview changes without modifying the database
- `--verbose`: Show detailed logging information

## What Gets Fixed

### PersonaTrait Structure Validation
- **Empty values**: Replaced with "Not specified"
- **Invalid confidence**: Set to minimum 0.3 or clamped to 0.0-1.0 range
- **Missing evidence**: Added default "Inferred from interview data"
- **Invalid JSON**: Recreated with default structure

### Basic Field Validation
- **Missing names**: Set to "Persona {ID}"
- **Missing descriptions**: Set to "Generated persona from interview analysis"
- **Invalid confidence scores**: Set to 0.3

### Fields Processed
The following PersonaTrait fields are validated and fixed:
- `demographics`
- `goals_and_motivations`
- `skills_and_expertise`
- `workflow_and_environment`
- `challenges_and_frustrations`
- `needs_and_desires`
- `technology_and_tools`
- `attitude_towards_research`
- `attitude_towards_ai`
- `key_quotes`
- `role_context` (legacy)
- `key_responsibilities` (legacy)
- `tools_used` (legacy)
- `collaboration_style` (legacy)
- `analysis_approach` (legacy)
- `pain_points` (legacy)

## Environment Variables

The standalone script uses these environment variables for database connection:

```bash
# Option 1: Full database URL
DATABASE_URL=***REDACTED***

# Option 2: Individual components (fallback)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=interview_insights
DB_USER=postgres
DB_PASSWORD=***REMOVED***
```

## Verification

After running the cleanup, you can verify the results by:

1. **Check the logs**: Both tools provide detailed logging of what was fixed
2. **Query the database**: Check that PersonaTrait fields have proper structure
3. **Test the frontend**: Verify that personas display correctly in the unified dashboard

```sql
-- Example query to check PersonaTrait structure
SELECT 
    persona_id, 
    name,
    demographics->>'value' as demographics_value,
    demographics->>'confidence' as demographics_confidence,
    json_array_length(demographics->'evidence') as demographics_evidence_count
FROM personas 
WHERE demographics IS NOT NULL;
```

## Rollback

The migration cannot be easily rolled back as it fixes data integrity issues. However, you can:

1. **Restore from backup**: If you have a database backup before the cleanup
2. **Re-run analysis**: Regenerate personas from original interview data
3. **Manual fixes**: Manually update specific records if needed

## Integration with Fixes

This cleanup works in conjunction with other fixes implemented:

1. **Backend validation**: PersonaTrait validation in `persona_builder.py`
2. **Frontend robustness**: Improved error handling in `PersonaList.tsx`
3. **Stakeholder intelligence**: Fixed object access bugs in `stakeholder_analysis_service.py`

## Monitoring

After cleanup, monitor the application logs for:
- Reduced "Empty value" warnings in persona formation
- Elimination of "'Persona' object is not subscriptable" errors
- Improved persona display in the frontend
- Successful stakeholder intelligence processing
