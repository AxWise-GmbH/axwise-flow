from fastapi import APIRouter, Depends, HTTPException, Request, Form
from sqlalchemy.orm import Session
from typing import Optional
from backend.database import get_db
from backend.models import User
from backend.services.external.export_auth import get_export_user
import logging
from backend.services.export_service import ExportService

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


@router.get("/{result_id}/pdf")
@router.post("/{result_id}/pdf")
async def export_analysis_pdf(
    result_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_export_user),
    auth_token: Optional[str] = Form(None),  # This is handled by get_export_user
):
    """
    Export analysis results as PDF
    """
    try:
        # Create export service
        export_service = ExportService(db, current_user)

        # Generate PDF
        pdf_bytes = await export_service.generate_analysis_pdf(result_id)

        # Return PDF as downloadable file
        from fastapi.responses import Response

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=analysis_report_{result_id}.pdf"
            },
        )
    except Exception as e:
        logger.error(f"Error exporting PDF: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error generating PDF: {str(e)}")


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
        normalized_content = markdown_content.replace('\r\n', '\n')

        return Response(
            content=normalized_content.encode("utf-8"),
            media_type="text/markdown",
            headers={
                "Content-Disposition": f"attachment; filename=analysis_report_{result_id}.md",
                "Content-Type": "text/markdown; charset=utf-8"
            },
        )
    except Exception as e:
        logger.error(f"Error exporting Markdown: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error generating Markdown: {str(e)}"
        )
