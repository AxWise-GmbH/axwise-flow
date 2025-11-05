"""
Pydantic models for Jira export functionality.
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, HttpUrl


class JiraCredentials(BaseModel):
    """Jira authentication credentials."""
    
    jira_url: str = Field(..., description="Jira instance URL (e.g., https://your-domain.atlassian.net)")
    email: str = Field(..., description="Jira user email")
    api_token: str = Field(..., description="Jira API token")
    project_key: str = Field(..., description="Jira project key (e.g., PROJ)")


class JiraExportRequest(BaseModel):
    """Request model for Jira export."""
    
    result_id: int = Field(..., description="Analysis result ID to export")
    credentials: JiraCredentials = Field(..., description="Jira credentials")
    epic_name: Optional[str] = Field(None, description="Custom epic name (defaults to PRD title)")
    include_technical: bool = Field(True, description="Include technical requirements as tasks")
    include_acceptance_criteria: bool = Field(True, description="Include acceptance criteria in stories")
    update_existing: bool = Field(False, description="Update existing issues if they already exist (match by summary)")

    model_config = {
        "json_schema_extra": {
            "example": {
                "result_id": 123,
                "credentials": {
                    "jira_url": "https://your-domain.atlassian.net",
                    "email": "user@example.com",
                    "api_token": "your-api-token",
                    "project_key": "PROJ"
                },
                "epic_name": "Customer Research PRD",
                "include_technical": True,
                "include_acceptance_criteria": True,
                "update_existing": True
            }
        }
    }


class JiraIssue(BaseModel):
    """Jira issue details."""
    
    key: str = Field(..., description="Jira issue key (e.g., PROJ-123)")
    id: str = Field(..., description="Jira issue ID")
    url: str = Field(..., description="URL to the Jira issue")
    summary: str = Field(..., description="Issue summary/title")
    issue_type: str = Field(..., description="Issue type (Epic, Story, Task)")


class JiraExportResponse(BaseModel):
    """Response model for Jira export."""

    success: bool = Field(..., description="Whether the export was successful")
    epic: Optional[JiraIssue] = Field(None, description="Created epic details")
    stories: List[JiraIssue] = Field(default_factory=list, description="Created stories")
    tasks: List[JiraIssue] = Field(default_factory=list, description="Created tasks/subtasks")
    total_issues_created: int = Field(0, description="Total number of issues created")
    stories_created: int = Field(0, description="Number of stories created")
    tasks_created: int = Field(0, description="Number of tasks created")
    message: str = Field(..., description="Success or error message")
    errors: List[str] = Field(default_factory=list, description="List of errors if any")
    
    model_config = {
        "json_schema_extra": {
            "example": {
                "success": True,
                "epic": {
                    "key": "PROJ-100",
                    "id": "10001",
                    "url": "https://your-domain.atlassian.net/browse/PROJ-100",
                    "summary": "Customer Research PRD",
                    "issue_type": "Epic"
                },
                "stories": [
                    {
                        "key": "PROJ-101",
                        "id": "10002",
                        "url": "https://your-domain.atlassian.net/browse/PROJ-101",
                        "summary": "As a user, I want to...",
                        "issue_type": "Story"
                    }
                ],
                "tasks": [],
                "total_issues_created": 2,
                "message": "Successfully exported to Jira",
                "errors": []
            }
        }
    }


class JiraConnectionTestRequest(BaseModel):
    """Request model for testing Jira connection."""
    
    credentials: JiraCredentials = Field(..., description="Jira credentials to test")


class JiraConnectionTestResponse(BaseModel):
    """Response model for Jira connection test."""
    
    success: bool = Field(..., description="Whether the connection was successful")
    message: str = Field(..., description="Success or error message")
    project_name: Optional[str] = Field(None, description="Project name if connection successful")
    user_name: Optional[str] = Field(None, description="Authenticated user name")

