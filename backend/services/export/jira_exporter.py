"""
Jira exporter service for exporting PRD data to Jira.
"""

import logging
import requests
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from backend.models import User
from backend.models.jira_export import (
    JiraCredentials,
    JiraExportRequest,
    JiraExportResponse,
    JiraIssue,
    JiraConnectionTestResponse,
)
from backend.services.processing.prd_generation_service import PRDGenerationService
from backend.services.llm import LLMServiceFactory

logger = logging.getLogger(__name__)


class JiraExporter:
    """
    Service for exporting PRD data to Jira.

    This service handles:
    - Connection validation
    - Epic creation
    - Story/task generation from PRD data
    """

    def __init__(self, db: Session, user: User):
        """
        Initialize the Jira exporter.

        Args:
            db: Database session
            user: User object
        """
        self.db = db
        self.user = user

    def _get_auth_headers(self, credentials: JiraCredentials) -> Dict[str, str]:
        """
        Get authentication headers for Jira API.

        Args:
            credentials: Jira credentials

        Returns:
            Dict with authentication headers
        """
        import base64

        auth_string = f"{credentials.email}:{credentials.api_token}"
        auth_bytes = auth_string.encode('ascii')
        base64_bytes = base64.b64encode(auth_bytes)
        base64_string = base64_bytes.decode('ascii')

        return {
            "Authorization": f"Basic {base64_string}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
    # --- ADF helpers -------------------------------------------------------
    def _adf_paragraph(self, text: str) -> Dict[str, Any]:
        return {
            "type": "paragraph",
            "content": ([{"type": "text", "text": text}] if text else [])
        }

    def _adf_heading(self, text: str, level: int = 2) -> Dict[str, Any]:
        return {
            "type": "heading",
            "attrs": {"level": level},
            "content": ([{"type": "text", "text": text}] if text else [])
        }

    def _adf_bullet_list(self, items: List[str]) -> Dict[str, Any]:
        return {
            "type": "bulletList",
            "content": [
                {
                    "type": "listItem",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [{"type": "text", "text": item}]
                        }
                    ]
                }
                for item in items
            ]
        }

    def _adf_doc(self, blocks: List[Dict[str, Any]]) -> Dict[str, Any]:
        return {"type": "doc", "version": 1, "content": blocks}

    # --- Search/Update helpers ---------------------------------------------
    def _escape_jql_string(self, s: str) -> str:
        return (s or "").replace('"', '\\"')

    def _search_issues(self, credentials: JiraCredentials, jql: str, max_results: int = 50) -> Optional[Dict[str, Any]]:
        try:
            headers = self._get_auth_headers(credentials)
            url = f"{credentials.jira_url}/rest/api/3/search"
            params = {"jql": jql, "maxResults": max_results}
            resp = requests.get(url, headers=headers, params=params, timeout=30)
            if resp.status_code == 200:
                return resp.json()
            logger.error(f"Jira search failed: {resp.status_code} - {resp.text}")
            return None
        except Exception as e:
            logger.error(f"Error searching issues: {e}")
            return None

    def _to_jira_issue(self, credentials: JiraCredentials, issue: Dict[str, Any]) -> JiraIssue:
        return JiraIssue(
            key=issue.get("key"),
            id=issue.get("id"),
            url=f"{credentials.jira_url}/browse/{issue.get('key')}",
            summary=((issue.get("fields") or {}).get("summary") or ""),
            issue_type=((issue.get("fields") or {}).get("issuetype") or {}).get("name", "")
        )

    def _find_epic_by_summary(self, credentials: JiraCredentials, epic_name: str) -> Optional[JiraIssue]:
        escaped = self._escape_jql_string(epic_name)
        jql = f'project = {credentials.project_key} AND issuetype = Epic AND summary ~ "{escaped}" ORDER BY created DESC'
        data = self._search_issues(credentials, jql, max_results=5)
        if data and data.get("issues"):
            return self._to_jira_issue(credentials, data["issues"][0])
        return None

    def _find_issue_by_summary(self, credentials: JiraCredentials, summary: str, issue_type: str) -> Optional[JiraIssue]:
        escaped = self._escape_jql_string(summary)
        jql = f'project = {credentials.project_key} AND issuetype = "{issue_type}" AND summary ~ "{escaped}" ORDER BY created DESC'
        data = self._search_issues(credentials, jql, max_results=5)
        if data and data.get("issues"):
            return self._to_jira_issue(credentials, data["issues"][0])
        return None

    def _update_issue_description(self, credentials: JiraCredentials, issue_id: str, description_doc: Dict[str, Any]) -> bool:
        try:
            headers = self._get_auth_headers(credentials)
            url = f"{credentials.jira_url}/rest/api/3/issue/{issue_id}"
            payload = {"fields": {"description": description_doc}}
            resp = requests.put(url, json=payload, headers=headers, timeout=30)
            if resp.status_code in [200, 204]:
                return True
            logger.error(f"Failed to update issue {issue_id}: {resp.status_code} - {resp.text}")
            return False
        except Exception as e:
            logger.error(f"Error updating issue {issue_id}: {e}")
            return False


    def test_connection(self, credentials: JiraCredentials) -> JiraConnectionTestResponse:
        """
        Test connection to Jira.

        Args:
            credentials: Jira credentials

        Returns:
            JiraConnectionTestResponse with connection status
        """
        try:
            headers = self._get_auth_headers(credentials)

            # Test authentication by getting current user
            user_url = f"{credentials.jira_url}/rest/api/3/myself"
            user_response = requests.get(user_url, headers=headers, timeout=10)

            if user_response.status_code != 200:
                return JiraConnectionTestResponse(
                    success=False,
                    message=f"Authentication failed: {user_response.text}"
                )

            user_data = user_response.json()
            user_name = user_data.get("displayName", "Unknown")

            # Test project access
            project_url = f"{credentials.jira_url}/rest/api/3/project/{credentials.project_key}"
            project_response = requests.get(project_url, headers=headers, timeout=10)

            if project_response.status_code != 200:
                return JiraConnectionTestResponse(
                    success=False,
                    message=f"Project access failed: {project_response.text}"
                )

            project_data = project_response.json()
            project_name = project_data.get("name", "Unknown")

            return JiraConnectionTestResponse(
                success=True,
                message="Connection successful",
                project_name=project_name,
                user_name=user_name
            )

        except requests.exceptions.RequestException as e:
            logger.error(f"Jira connection test failed: {str(e)}")
            return JiraConnectionTestResponse(
                success=False,
                message=f"Connection error: {str(e)}"
            )
        except Exception as e:
            logger.error(f"Unexpected error during Jira connection test: {str(e)}")
            return JiraConnectionTestResponse(
                success=False,
                message=f"Unexpected error: {str(e)}"
            )

    def _create_epic(
        self,
        credentials: JiraCredentials,
        epic_name: str,
        description_doc: Dict[str, Any]
    ) -> Optional[JiraIssue]:
        """
        Create an epic in Jira.

        Args:
            credentials: Jira credentials
            epic_name: Name of the epic
            description: Epic description

        Returns:
            JiraIssue object or None if creation failed
        """
        try:
            headers = self._get_auth_headers(credentials)
            url = f"{credentials.jira_url}/rest/api/3/issue"

            payload = {
                "fields": {
                    "project": {
                        "key": credentials.project_key
                    },
                    "summary": epic_name,
                    "description": description_doc,
                    "issuetype": {
                        "name": "Epic"
                    }
                }
            }

            response = requests.post(url, json=payload, headers=headers, timeout=30)

            if response.status_code in [200, 201]:
                data = response.json()
                return JiraIssue(
                    key=data["key"],
                    id=data["id"],
                    url=f"{credentials.jira_url}/browse/{data['key']}",
                    summary=epic_name,
                    issue_type="Epic"
                )
            else:
                logger.error(f"Failed to create epic: {response.status_code} - {response.text}")
                return None

        except Exception as e:
            logger.error(f"Error creating epic: {str(e)}")
            return None

    def _create_story(
        self,
        credentials: JiraCredentials,
        summary: str,
        description_doc: Dict[str, Any],
        epic_key: Optional[str] = None,
        priority: str = "Medium"
    ) -> Optional[JiraIssue]:
        """
        Create a story in Jira.

        Args:
            credentials: Jira credentials
            summary: Story summary
            description: Story description
            epic_key: Epic key to link to (optional)
            priority: Story priority

        Returns:
            JiraIssue object or None if creation failed
        """
        try:
            headers = self._get_auth_headers(credentials)
            url = f"{credentials.jira_url}/rest/api/3/issue"

            fields = {
                "project": {
                    "key": credentials.project_key
                },
                "summary": summary,
                "description": description_doc,
                "issuetype": {
                    "name": "Story"
                }
            }

            # Add epic link if provided
            if epic_key:
                fields["parent"] = {"key": epic_key}

            payload = {"fields": fields}

            response = requests.post(url, json=payload, headers=headers, timeout=30)

            if response.status_code in [200, 201]:
                data = response.json()
                return JiraIssue(
                    key=data["key"],
                    id=data["id"],
                    url=f"{credentials.jira_url}/browse/{data['key']}",
                    summary=summary,
                    issue_type="Story"
                )
            else:
                logger.error(f"Failed to create story: {response.status_code} - {response.text}")
                return None

        except Exception as e:
            logger.error(f"Error creating story: {str(e)}")
            return None

    def _create_task(
        self,
        credentials: JiraCredentials,
        summary: str,
        description_doc: Dict[str, Any],
        parent_key: Optional[str] = None
    ) -> Optional[JiraIssue]:
        """
        Create a task/subtask in Jira.

        Args:
            credentials: Jira credentials
            summary: Task summary
            description: Task description
            parent_key: Parent issue key (for subtasks)

        Returns:
            JiraIssue object or None if creation failed
        """
        try:
            headers = self._get_auth_headers(credentials)
            url = f"{credentials.jira_url}/rest/api/3/issue"

            fields = {
                "project": {
                    "key": credentials.project_key
                },
                "summary": summary,
                "description": description_doc,
                "issuetype": {
                    "name": "Task"
                }
            }

            # Add parent link if provided
            if parent_key:
                fields["parent"] = {"key": parent_key}

            payload = {"fields": fields}

            response = requests.post(url, json=payload, headers=headers, timeout=30)

            if response.status_code in [200, 201]:
                data = response.json()
                return JiraIssue(
                    key=data["key"],
                    id=data["id"],
                    url=f"{credentials.jira_url}/browse/{data['key']}",
                    summary=summary,
                    issue_type="Task" if not parent_key else "Sub-task"
                )
            else:
                logger.error(f"Failed to create task: {response.status_code} - {response.text}")
                return None

        except Exception as e:
            logger.error(f"Error creating task: {str(e)}")
            return None

    async def export_prd_to_jira(
        self,
        request: JiraExportRequest
    ) -> JiraExportResponse:
        """
        Export PRD data to Jira.

        Args:
            request: Jira export request

        Returns:
            JiraExportResponse with export results
        """
        errors = []
        stories_created = []
        tasks_created = []

        updated_count = 0
        epic_created = False

        try:
            # Test connection first
            connection_test = self.test_connection(request.credentials)
            if not connection_test.success:
                return JiraExportResponse(
                    success=False,
                    message=f"Connection test failed: {connection_test.message}",
                    errors=[connection_test.message]
                )

            # Get PRD data
            logger.info(f"Fetching PRD data for result_id: {request.result_id}")

            # Resolve ResultsService via DI container
            from backend.api.dependencies import get_container
            container = get_container()
            factory = container.get_results_service()
            results_service = factory(self.db, self.user)
            analysis_results = results_service.get_analysis_result(request.result_id)

            if analysis_results.get("status") != "completed":
                return JiraExportResponse(
                    success=False,
                    message="Analysis is not yet complete",
                    errors=["Analysis is not yet complete"]
                )

            results_data = analysis_results.get("results", {})

            # Generate PRD if not already cached
            llm_service = LLMServiceFactory.create("enhanced_gemini")
            prd_service = PRDGenerationService(db=self.db, llm_service=llm_service, user=self.user)

            industry = results_data.get("industry")
            prd_data = await prd_service.generate_prd(
                analysis_results=results_data,
                prd_type="both",
                industry=industry,
                result_id=request.result_id,
                force_regenerate=False
            )

            # Create or update Epic
            epic_name = request.epic_name or "Product Requirements Document"

            # Build Epic description (ADF) with WHAT/WHY/HOW
            op_brd = prd_data.get("operational_prd", {}).get("brd", {}) if isinstance(prd_data.get("operational_prd"), dict) else {}
            objectives = op_brd.get("objectives") or []
            obj_desc = objectives[0].get("description") or "" if objectives else ""

            tech_bp = prd_data.get("technical_prd", {}).get("implementation_blueprint", {}) if isinstance(prd_data.get("technical_prd"), dict) else {}
            solution_overview = tech_bp.get("solution_overview") or ""

            epic_blocks: List[Dict[str, Any]] = [
                self._adf_heading("WHAT", level=2),
                self._adf_paragraph(epic_name),
            ]
            if obj_desc:
                epic_blocks.append(self._adf_paragraph(f"Objective: {obj_desc}"))
            epic_blocks += [
                self._adf_heading("WHY", level=2),
                self._adf_paragraph("Based on customer research objectives and themes."),
                self._adf_heading("HOW", level=2),
                self._adf_paragraph(solution_overview or "Delivered via linked Stories and Tasks in this Epic."),
            ]
            epic_doc = self._adf_doc(epic_blocks)

            epic = None
            if getattr(request, "update_existing", False):
                logger.info(f"Update-existing enabled. Searching for existing epic: {epic_name}")
                existing_epic = self._find_epic_by_summary(request.credentials, epic_name)
                if existing_epic:
                    logger.info(f"Found existing epic {existing_epic.key}. Updating description.")
                    self._update_issue_description(request.credentials, existing_epic.id, epic_doc)
                    updated_count += 1
                    epic = existing_epic
                else:
                    logger.info(f"No existing epic found. Creating new epic: {epic_name}")
                    epic = self._create_epic(request.credentials, epic_name, epic_doc)
            else:
                logger.info(f"Creating epic: {epic_name}")
                epic = self._create_epic(request.credentials, epic_name, epic_doc)

            if not epic:
                return JiraExportResponse(
                    success=False,
                    message="Failed to create epic",
                    errors=["Failed to create epic in Jira"]
                )

            # Create stories from stakeholder scenarios (BRD)
            operational_prd = prd_data.get("operational_prd", {})
            brd = operational_prd.get("brd", {})

            stakeholder_scenarios = brd.get("stakeholder_scenarios", [])
            if not stakeholder_scenarios:
                # Fallback to legacy user_stories
                stakeholder_scenarios = operational_prd.get("user_stories", [])

            logger.info(f"Creating {len(stakeholder_scenarios)} stories")

            for scenario in stakeholder_scenarios:
                # Extract story details
                if isinstance(scenario, dict):
                    story_summary = scenario.get("scenario", scenario.get("story", "User Story"))

                    # Build ADF description with WHAT/WHY/HOW + acceptance criteria
                    justification = scenario.get("justification", {})
                    linked_theme = (justification or {}).get("linked_theme") or ""
                    impact = (justification or {}).get("impact_score") or ""
                    frequency = (justification or {}).get("frequency") or ""
                    why_items: List[str] = []
                    if linked_theme:
                        why_items.append(f"Theme: {linked_theme}")
                    if impact:
                        why_items.append(f"Impact: {impact}")
                    if frequency:
                        why_items.append(f"Frequency: {frequency}")

                    story_blocks: List[Dict[str, Any]] = [
                        self._adf_heading("WHAT", level=2),
                        self._adf_paragraph(story_summary),
                        self._adf_heading("WHY", level=2),
                        (self._adf_bullet_list(why_items) if why_items else self._adf_paragraph("Not specified")),
                        self._adf_heading("HOW", level=2),
                        self._adf_paragraph("Delivered via technical tasks linked to this epic."),
                    ]

                    if request.include_acceptance_criteria:
                        acceptance_criteria = scenario.get("acceptance_criteria", [])
                        if acceptance_criteria:
                            story_blocks.append(self._adf_heading("Acceptance Criteria", level=3))
                            story_blocks.append(self._adf_bullet_list([str(c) for c in acceptance_criteria]))

                    story_doc = self._adf_doc(story_blocks)

                    # Determine priority
                    priority = "Medium"
                    if justification.get("impact_score") == "High":
                        priority = "High"
                    elif justification.get("impact_score") == "Low":
                        priority = "Low"

                    # Create or update story
                    story: Optional[JiraIssue] = None
                    if getattr(request, "update_existing", False):
                        existing_story = self._find_issue_by_summary(request.credentials, story_summary, "Story")
                        if existing_story:
                            logger.info(f"Updating existing story {existing_story.key}")
                            self._update_issue_description(request.credentials, existing_story.id, story_doc)
                            updated_count += 1
                            story = existing_story
                        else:
                            story = self._create_story(
                                request.credentials,
                                story_summary,
                                story_doc,
                                epic_key=epic.key,
                                priority=priority
                            )
                    else:
                        story = self._create_story(
                            request.credentials,
                            story_summary,
                            story_doc,
                            epic_key=epic.key,
                            priority=priority
                        )

                    if story:
                        stories_created.append(story)
                    else:
                        errors.append(f"Failed to create story: {story_summary}")

            # Create tasks from technical requirements if requested
            if request.include_technical:
                technical_prd = prd_data.get("technical_prd", {})
                impl_requirements = technical_prd.get("implementation_requirements", [])

                logger.info(f"Creating {len(impl_requirements)} technical tasks")

                for req in impl_requirements:
                    if isinstance(req, dict):
                        task_summary = req.get("title", "Technical Task")
                        task_desc_main = req.get("description", "")
                        dependencies = req.get("dependencies", [])

                        # Build task description (ADF) with WHAT/HOW (+ dependencies)
                        task_blocks: List[Dict[str, Any]] = [
                            self._adf_heading("WHAT", level=2),
                            self._adf_paragraph(task_summary),
                            self._adf_heading("HOW", level=2),
                            self._adf_paragraph(task_desc_main or "See linked design/requirements."),
                        ]
                        if dependencies:
                            task_blocks.append(self._adf_heading("Dependencies", level=3))
                            task_blocks.append(self._adf_bullet_list([str(d) for d in dependencies]))

                        task_doc = self._adf_doc(task_blocks)

                        # Create or update task
                        task: Optional[JiraIssue] = None
                        if getattr(request, "update_existing", False):
                            existing_task = self._find_issue_by_summary(request.credentials, task_summary, "Task")
                            if existing_task:
                                logger.info(f"Updating existing task {existing_task.key}")
                                self._update_issue_description(request.credentials, existing_task.id, task_doc)
                                updated_count += 1
                                task = existing_task
                            else:
                                task = self._create_task(
                                    request.credentials,
                                    task_summary,
                                    task_doc,
                                    parent_key=epic.key
                                )
                        else:
                            task = self._create_task(
                                request.credentials,
                                task_summary,
                                task_doc,
                                parent_key=epic.key
                            )

                        if task:
                            tasks_created.append(task)
                        else:
                            errors.append(f"Failed to create task: {task_summary}")

            # Build response
            total_created = 1 + len(stories_created) + len(tasks_created)  # +1 for epic
            msg = f"Successfully exported to Jira: {total_created} issues created"
            if getattr(request, "update_existing", False):
                msg += f", {updated_count} updated"

            return JiraExportResponse(
                success=True,
                epic=epic,
                stories=stories_created,
                tasks=tasks_created,
                total_issues_created=total_created,
                stories_created=len(stories_created),
                tasks_created=len(tasks_created),
                message=msg,
                errors=errors
            )

        except Exception as e:
            logger.error(f"Error exporting to Jira: {str(e)}", exc_info=True)
            return JiraExportResponse(
                success=False,
                message=f"Export failed: {str(e)}",
                errors=[str(e)] + errors
            )

