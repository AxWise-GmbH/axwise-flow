from fastapi import APIRouter, Depends, HTTPException, Request, Form, Body
from sqlalchemy.orm import Session
from typing import Optional
from backend.database import get_db
from backend.models import User
from backend.models.jira_export import (
    JiraCredentials,
    JiraExportRequest,
    JiraExportResponse,
    JiraConnectionTestRequest,
    JiraConnectionTestResponse,
)
from backend.services.external.export_auth import get_export_user
import logging
from backend.services.export_service import ExportService
from backend.services.export.jira_exporter import JiraExporter

# Create router
router = APIRouter(prefix="/api/export", tags=["Export"])
logger = logging.getLogger(__name__)


# Add OPTIONS handler for CORS preflight requests
@router.options("/{result_id}/{format}")
async def options_export(result_id: int, format: str):
    """Handle OPTIONS preflight request for export endpoints"""
    from fastapi.responses import JSONResponse

    return JSONResponse(
        content={"status": "ok"},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
            "Access-Control-Allow-Credentials": "true",
        },
    )


# PDF export functionality removed as requested


@router.get("/{result_id}/markdown")
@router.post("/{result_id}/markdown")
async def export_analysis_markdown(
    result_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_export_user),
    auth_token: Optional[str] = Form(None),  # This is handled by get_export_user
):
    """
    Export analysis results as Markdown
    """
    try:
        # Create export service
        export_service = ExportService(db, current_user)

        # Generate Markdown
        markdown_content = await export_service.generate_analysis_markdown(result_id)

        # Return Markdown as downloadable file
        from fastapi.responses import Response

        # Ensure proper encoding and line endings for better compatibility
        # First normalize line endings to LF
        normalized_content = markdown_content.replace("\r\n", "\n")

        return Response(
            content=normalized_content.encode("utf-8"),
            media_type="text/markdown",
            headers={
                "Content-Disposition": f"attachment; filename=analysis_report_{result_id}.md",
                "Content-Type": "text/markdown; charset=utf-8",
            },
        )
    except Exception as e:
        logger.error(f"Error exporting Markdown: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error generating Markdown: {str(e)}"
        )


@router.post("/jira/test-connection")
async def test_jira_connection(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_export_user),
) -> JiraConnectionTestResponse:
    """
    Test connection to Jira.

    Accepts either of the following JSON shapes:
    - Flat credentials object: { "jira_url": "...", "email": "...", "api_token": "...", "project_key": "..." }
    - Wrapped: { "credentials": { ... } }
    """
    try:
        logger.info(f"Testing Jira connection for user {current_user.user_id}")

        # Read and normalize payload
        payload = await request.json()
        if isinstance(payload, dict) and "credentials" in payload:
            cred_data = payload.get("credentials") or {}
        else:
            cred_data = payload if isinstance(payload, dict) else {}

        # Validate into model
        credentials = JiraCredentials(**cred_data)
        logger.info(
            f"Credentials received: jira_url={credentials.jira_url}, email={credentials.email}, project_key={credentials.project_key}"
        )

        # Create Jira exporter and test connection
        jira_exporter = JiraExporter(db, current_user)
        result = jira_exporter.test_connection(credentials)
        return result

    except Exception as e:
        logger.error(f"Error testing Jira connection: {str(e)}", exc_info=True)
        return JiraConnectionTestResponse(
            success=False,
            message=f"Connection test failed: {str(e)}"
        )


@router.post("/jira")
async def export_to_jira(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_export_user),
) -> JiraExportResponse:
    """
    Export PRD data to Jira.

    Accepts either of the following JSON shapes:
    - Flat: { "result_id": 123, "credentials": { ... }, ... }
    - Wrapped: { "export_request": { ... } }
    """
    try:
        # Normalize payload
        payload = await request.json()
        if isinstance(payload, dict) and "export_request" in payload:
            data = payload.get("export_request") or {}
        else:
            data = payload if isinstance(payload, dict) else {}

        # Validate into model
        export_request = JiraExportRequest(**data)
        logger.info(f"Exporting to Jira for result_id: {export_request.result_id}")

        # Create Jira exporter
        jira_exporter = JiraExporter(db, current_user)

        # Export to Jira
        result = await jira_exporter.export_prd_to_jira(export_request)

        if not result.success:
            logger.warning(f"Jira export failed: {result.message}")
        else:
            logger.info(f"Jira export successful: {result.total_issues_created} issues created")

        return result

    except Exception as e:
        logger.error(f"Error exporting to Jira: {str(e)}", exc_info=True)
        return JiraExportResponse(
            success=False,
            message=f"Export failed: {str(e)}",
            errors=[str(e)]
        )
