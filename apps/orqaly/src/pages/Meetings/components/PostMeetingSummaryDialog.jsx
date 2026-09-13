import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
  Chip,
  TextField,
  IconButton,
  Alert,
  alpha,
  useTheme,
  Checkbox,
} from '@mui/material';
import FormDialog from '../../../components/Common/FormDialog';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import TopicIcon from '@mui/icons-material/Topic';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import PublicIcon from '@mui/icons-material/Public';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import LinkIcon from '@mui/icons-material/Link';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AssignmentIcon from '@mui/icons-material/Assignment';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import { partnerService } from '../../../services/partnerService';
import { meetingService } from '../../../services/meetingService';
import { addEntry } from '../../../services/partnerHistoryService';
import { logAction } from '../../../services/auditLogBackend';
import { createWorkflow } from '../../../services/workflowService';
import { createProject } from '../../../services/projectService';
import { GROUP_SUBTYPES } from '../../../utils/constants';

import AppIcon from '../../../components/icons/AppIcon';

function getApplyPayload(field, suggestedValue) {
  if (field === 'trafficSources') {
    const str = typeof suggestedValue === 'string' ? suggestedValue : '';
    return str
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return suggestedValue;
}

/**
 * Shown after a meeting is processed. Displays summary (editable), key topics,
 * suggested tasks (review/edit/approve before creating), and suggested partner updates.
 * Logs "Meeting Recorded" to partner history; supports View Transcript | View Tasks.
 */
export default function PostMeetingSummaryDialog({
  open,
  onClose,
  meeting,
  partnerId,
  partnerName,
  onRefetch,
  onViewTranscript,
  onViewTasks,
}) {
  const theme = useTheme();
  const [applying, setApplying] = useState(false);
  const [appliedCount, setAppliedCount] = useState(0);
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState('');
  const [tasksCreatedCount, setTasksCreatedCount] = useState(0);
  const [creatingTasks, setCreatingTasks] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);
  // Suggested tasks: { ...actionItem, checked, id for key }
  const [suggestedTasks, setSuggestedTasks] = useState([]);
  const [extractedRequests, setExtractedRequests] = useState([]);
  const [materialsToProvide, setMaterialsToProvide] = useState([]);
  // Recommended actions from transcript: converted to tasks through existing task service.
  const [recommendedActions, setRecommendedActions] = useState([]);
  const [partnerUpdates, setPartnerUpdates] = useState([]);
  const [approvingAll, setApprovingAll] = useState(false);
  const [systemActionsCreated, setSystemActionsCreated] = useState({
    workflows: 0,
    projects: 0,
    partners: 0,
  });

  const structured = meeting?.transcriptStructured || {};
  const summary = summaryDraft || structured.summary;
  const topics = structured.topics || [];
  const geographicFocus = structured.geographic_focus || [];
  const campaigns = structured.campaigns || [];
  const materialsRequested = structured.materials_requested || [];
  const trafficDiscussion = structured.traffic_discussion || [];
  const keyDiscussionPoints = structured.key_discussion_points || [];
  const decisions = structured.decisions || [];
  const agreements = structured.agreements || [];
  const risksOrConcerns = structured.risks_or_concerns || [];
  const nextSteps = structured.next_steps || [];
  const meetingTopic = structured.meeting_topic || meeting?.title;
  const suggested = partnerUpdates.filter((s) => !s.applied);

  useEffect(() => {
    if (!open) return;
    const actionItems = Array.isArray(meeting?.transcriptStructured?.action_items)
      ? meeting.transcriptStructured.action_items
      : [];
    const items = actionItems.map((a, i) => ({
      ...(typeof a === 'object' ? a : { task: a, assignee: '', deadline: null }),
      id: `sug-${i}-${meeting?.id || 'meeting'}`,
      checked: true,
    }));
    setSuggestedTasks(items);

    const reqs = Array.isArray(meeting?.transcriptStructured?.extracted_requests)
      ? meeting.transcriptStructured.extracted_requests
      : [];
    setExtractedRequests(
      reqs.map((r, i) => ({
        ...(typeof r === 'object'
          ? r
          : { title: String(r || ''), description: '', owner: '', priority: 'medium' }),
        id: `req-${i}-${meeting?.id || 'meeting'}`,
        checked: true,
      }))
    );

    const mats = Array.isArray(meeting?.transcriptStructured?.materials_requested)
      ? meeting.transcriptStructured.materials_requested
      : [];
    setMaterialsToProvide(
      mats
        .map((m, i) => ({
          value: String(m || '').trim(),
          id: `mat-${i}-${meeting?.id || 'meeting'}`,
          checked: true,
        }))
        .filter((m) => m.value)
    );

    const actions = Array.isArray(meeting?.transcriptStructured?.recommended_actions)
      ? meeting.transcriptStructured.recommended_actions
      : [];
    setRecommendedActions(
      actions.map((a, i) => ({
        ...(typeof a === 'object' ? a : { title: String(a || ''), description: '' }),
        id: `rec-${i}-${meeting?.id || 'meeting'}`,
        checked: true,
      }))
    );

    setPartnerUpdates(
      Array.isArray(meeting?.suggestedPartnerUpdates) ? meeting.suggestedPartnerUpdates : []
    );
    setSummaryDraft(meeting?.transcriptStructured?.summary || '');
    setTasksCreatedCount(0);
    setAppliedCount(0);
    setCopiedShare(false);
    setSystemActionsCreated({ workflows: 0, projects: 0, partners: 0 });
  }, [
    meeting?.id,
    meeting?.transcriptStructured?.action_items,
    meeting?.transcriptStructured?.extracted_requests,
    meeting?.transcriptStructured?.materials_requested,
    meeting?.transcriptStructured?.recommended_actions,
    meeting?.transcriptStructured?.summary,
    meeting?.suggestedPartnerUpdates,
    open,
  ]);

  const handleApplyAll = async () => {
    if (!partnerId || applying || suggested.length === 0) return;
    setApplying(true);
    try {
      let updatedUpdates = partnerUpdates;
      for (const s of suggested) {
        const value = getApplyPayload(s.field, s.suggestedValue);
        const payload = { [s.field]: value };
        if (s.field === 'group' && value) payload.groupSubtype = GROUP_SUBTYPES[value] || '';
        await partnerService.update(partnerId, payload);
        await addEntry(partnerId, {
          type: 'interaction',
          title: 'Profile updated from meeting',
          detail: `${s.label}: ${String(s.suggestedValue)}`,
          meta: { meetingId: meeting?.id, meetingTitle: meeting?.title },
        });
        updatedUpdates = updatedUpdates.map((item) =>
          item.id === s.id ? { ...item, applied: true } : item
        );
      }
      setPartnerUpdates(updatedUpdates);
      await meetingService
        .update(meeting.id, { suggestedPartnerUpdates: updatedUpdates })
        .catch(() => {});
      setAppliedCount(suggested.length);
      onRefetch?.();
    } finally {
      setApplying(false);
    }
  };

  const handleSaveSummary = async () => {
    if (!meeting || editingSummary === false) return;
    const nextStructured = { ...structured, summary: summaryDraft };
    const existingHistory = Array.isArray(meeting.analysisLogHistory)
      ? meeting.analysisLogHistory
      : [];
    const historyEntry = {
      id: `analysis-${Date.now()}`,
      createdAt: new Date().toISOString(),
      source: 'summary-edit',
      summary: nextStructured.summary || '',
      meeting_topic: nextStructured.meeting_topic || meeting?.title || '',
      extracted_requests: Array.isArray(nextStructured.extracted_requests)
        ? nextStructured.extracted_requests
        : [],
      recommended_actions: Array.isArray(nextStructured.recommended_actions)
        ? nextStructured.recommended_actions
        : [],
      workflow_actions: Array.isArray(nextStructured.workflow_actions)
        ? nextStructured.workflow_actions
        : [],
      permission_actions: Array.isArray(nextStructured.permission_actions)
        ? nextStructured.permission_actions
        : [],
      communication_mentions: nextStructured.communication_mentions || { telegram: [], email: [] },
      partner_community_updates: Array.isArray(nextStructured.partner_community_updates)
        ? nextStructured.partner_community_updates
        : [],
    };
    await meetingService
      .update(meeting.id, {
        transcriptStructured: nextStructured,
        analysisLogHistory: [...existingHistory, historyEntry],
      })
      .catch(() => {});
    setEditingSummary(false);
    onRefetch?.();
  };

  const handleSuggestedTaskChange = (id, field, value) => {
    setSuggestedTasks((prev) => prev.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
  };

  const handleToggleTask = (id) => {
    setSuggestedTasks((prev) => prev.map((t) => (t.id === id ? { ...t, checked: !t.checked } : t)));
  };

  const handleRemoveTask = (id) => {
    setSuggestedTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const selectedTasks = suggestedTasks.filter((t) => t.checked);
  const selectedRequests = extractedRequests.filter((r) => r.checked);
  const selectedMaterials = materialsToProvide.filter((m) => m.checked);
  const selectedRecommendedActions = recommendedActions.filter((a) => a.checked);
  const selectedTotalCount =
    selectedTasks.length +
    selectedRequests.length +
    selectedMaterials.length +
    selectedRecommendedActions.length;

  const normalizeActionType = (value) =>
    String(value || '')
      .trim()
      .toLowerCase();
  const SYSTEM_ACTION_TYPES = new Set([
    'create_workflow',
    'launch_project',
    'create_partner',
    'add_partner',
  ]);
  const selectedSystemRecommendedActions = selectedRecommendedActions.filter((a) =>
    SYSTEM_ACTION_TYPES.has(normalizeActionType(a.action_type))
  );
  const selectedTaskRecommendedActions = selectedRecommendedActions.filter(
    (a) => !SYSTEM_ACTION_TYPES.has(normalizeActionType(a.action_type))
  );

  const handleToggleRecommendedAction = (id) => {
    setRecommendedActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, checked: !a.checked } : a))
    );
  };
  const handleRecommendedActionChange = (id, field, value) => {
    setRecommendedActions((prev) => prev.map((a) => (a.id === id ? { ...a, [field]: value } : a)));
  };
  const handleRemoveRecommendedAction = (id) => {
    setRecommendedActions((prev) => prev.filter((a) => a.id !== id));
  };

  const handleToggleExtractedRequest = (id) => {
    setExtractedRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, checked: !r.checked } : r))
    );
  };
  const handleExtractedRequestChange = (id, field, value) => {
    setExtractedRequests((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };
  const handleRemoveExtractedRequest = (id) => {
    setExtractedRequests((prev) => prev.filter((r) => r.id !== id));
  };

  const handleToggleMaterial = (id) => {
    setMaterialsToProvide((prev) =>
      prev.map((m) => (m.id === id ? { ...m, checked: !m.checked } : m))
    );
  };
  const handleMaterialChange = (id, value) => {
    setMaterialsToProvide((prev) => prev.map((m) => (m.id === id ? { ...m, value } : m)));
  };
  const handleRemoveMaterial = (id) => {
    setMaterialsToProvide((prev) => prev.filter((m) => m.id !== id));
  };

  const handleCreateTasks = async () => {
    if (!partnerId || !meeting || selectedTotalCount === 0 || creatingTasks) return;
    setCreatingTasks(true);
    try {
      const actionItems = selectedTasks.map(({ task, assignee, deadline }) => ({
        task: task || 'Task',
        assignee: assignee || '',
        deadline: deadline || null,
      }));
      const approvedRequests = selectedRequests
        .map((r) => ({
          request_type: r.request_type || 'general',
          title: (r.title || '').trim(),
          description: r.description || '',
          priority: r.priority || 'medium',
          owner: r.owner || '',
          required_resources: Array.isArray(r.required_resources) ? r.required_resources : [],
          context: r.context || '',
          deadline: r.deadline || r.due || null,
        }))
        .filter((r) => r.title || r.description);
      const approvedMaterials = selectedMaterials
        .map((m) => String(m.value || '').trim())
        .filter(Boolean);
      const approvedRecommendedActions = selectedRecommendedActions.map((a) => ({
        title: a.title || 'Recommended action',
        description: a.description || '',
        action_type: a.action_type || 'create_task',
        one_click: a.one_click !== false,
        context: a.context || '',
        payload: a.payload || {},
      }));
      const meetingWithApprovedTasks = {
        ...meeting,
        transcriptStructured: {
          ...structured,
          action_items: actionItems,
          extracted_requests: approvedRequests,
          materials_requested: approvedMaterials,
          recommended_actions: approvedRecommendedActions,
          decisions: [], // avoid duplicate "decisions" task when we only want action items
        },
      };
      await partnerService.createTasksFromMeeting(partnerId, meetingWithApprovedTasks);
      setTasksCreatedCount(selectedTotalCount);
      setSuggestedTasks((prev) => prev.filter((t) => !t.checked)); // remove created from list
      setExtractedRequests((prev) => prev.filter((r) => !r.checked));
      setMaterialsToProvide((prev) => prev.filter((m) => !m.checked));
      setRecommendedActions((prev) => prev.filter((a) => !a.checked));
      onRefetch?.();
    } finally {
      setCreatingTasks(false);
    }
  };

  const handleApproveAllActions = async () => {
    if (!partnerId || !meeting || approvingAll) return;
    const tasksToCreateCount =
      selectedTasks.length +
      selectedRequests.length +
      selectedMaterials.length +
      selectedTaskRecommendedActions.length;
    const hasAnythingToDo =
      tasksToCreateCount > 0 || selectedSystemRecommendedActions.length > 0 || suggested.length > 0;
    if (!hasAnythingToDo) return;

    setApprovingAll(true);
    try {
      let workflowsCreated = 0;
      let projectsCreated = 0;
      let partnersCreated = 0;
      const createdEntities = { workflows: [], projects: [], partners: [] };

      for (const action of selectedSystemRecommendedActions) {
        const actionType = normalizeActionType(action.action_type);
        const payload = action?.payload && typeof action.payload === 'object' ? action.payload : {};

        if (actionType === 'create_workflow') {
          const name = String(
            payload.workflow_name || action.title || action.description || 'New Workflow'
          ).trim();
          const description = String(action.description || action.context || '').trim();
          const workflow = await createWorkflow({ name: name || 'New Workflow', description });
          workflowsCreated += 1;
          createdEntities.workflows.push({ id: workflow.id, name: workflow.name });
        } else if (actionType === 'launch_project') {
          const name = String(
            payload.project_name || action.title || action.description || 'New Project'
          ).trim();
          const description = String(action.description || action.context || '').trim();
          const workflowName = String(payload.workflow_name || '').trim();
          const project = await createProject({
            name: name || 'New Project',
            description,
            partnerId,
            partnerName: partnerName || '',
            ...(workflowName ? { workflowName } : {}),
          });
          projectsCreated += 1;
          createdEntities.projects.push({ id: project.id, name: project.name });
        } else if (actionType === 'create_partner' || actionType === 'add_partner') {
          // Safety: only auto-create partners when the action is explicitly marked as one-click.
          if (action.one_click === false) continue;
          const name = String(payload.partner_name || action.title || '').trim();
          if (!name) continue;
          const partner = await partnerService.create({ name });
          partnersCreated += 1;
          createdEntities.partners.push({ id: partner.id, name: partner.name || name });
        }
      }

      if (tasksToCreateCount > 0) {
        const actionItems = selectedTasks.map(({ task, assignee, deadline }) => ({
          task: task || 'Task',
          assignee: assignee || '',
          deadline: deadline || null,
        }));
        const approvedRequests = selectedRequests
          .map((r) => ({
            request_type: r.request_type || 'general',
            title: (r.title || '').trim(),
            description: r.description || '',
            priority: r.priority || 'medium',
            owner: r.owner || '',
            required_resources: Array.isArray(r.required_resources) ? r.required_resources : [],
            context: r.context || '',
            deadline: r.deadline || r.due || null,
          }))
          .filter((r) => r.title || r.description);
        const approvedMaterials = selectedMaterials
          .map((m) => String(m.value || '').trim())
          .filter(Boolean);
        const approvedRecommended = selectedTaskRecommendedActions.map((a) => ({
          title: a.title || 'Recommended action',
          description: a.description || '',
          action_type: a.action_type || 'create_task',
          one_click: a.one_click !== false,
          context: a.context || '',
          payload: a.payload || {},
        }));

        const meetingWithApprovedTasks = {
          ...meeting,
          transcriptStructured: {
            ...structured,
            action_items: actionItems,
            extracted_requests: approvedRequests,
            materials_requested: approvedMaterials,
            recommended_actions: approvedRecommended,
            decisions: [],
          },
        };
        await partnerService.createTasksFromMeeting(partnerId, meetingWithApprovedTasks);
        setTasksCreatedCount(tasksToCreateCount);
      }

      let partnerUpdatesApplied = 0;
      if (suggested.length > 0) {
        setApplying(true);
        try {
          let updatedUpdates = partnerUpdates;
          for (const s of suggested) {
            const value = getApplyPayload(s.field, s.suggestedValue);
            const payload = { [s.field]: value };
            if (s.field === 'group' && value) payload.groupSubtype = GROUP_SUBTYPES[value] || '';
            await partnerService.update(partnerId, payload);
            await addEntry(partnerId, {
              type: 'interaction',
              title: 'Profile updated from meeting',
              detail: `${s.label}: ${String(s.suggestedValue)}`,
              meta: { meetingId: meeting?.id, meetingTitle: meeting?.title },
            }).catch(() => {});
            updatedUpdates = updatedUpdates.map((item) =>
              item.id === s.id ? { ...item, applied: true } : item
            );
          }
          setPartnerUpdates(updatedUpdates);
          partnerUpdatesApplied = suggested.length;
          setAppliedCount(partnerUpdatesApplied);
          await meetingService
            .update(meeting.id, { suggestedPartnerUpdates: updatedUpdates })
            .catch(() => {});
        } finally {
          setApplying(false);
        }
      }

      // Clear processed selections.
      setSuggestedTasks((prev) => prev.filter((t) => !t.checked));
      setExtractedRequests((prev) => prev.filter((r) => !r.checked));
      setMaterialsToProvide((prev) => prev.filter((m) => !m.checked));
      setRecommendedActions((prev) => prev.filter((a) => !a.checked));

      setSystemActionsCreated({
        workflows: workflowsCreated,
        projects: projectsCreated,
        partners: partnersCreated,
      });

      const detailParts = [];
      if (tasksToCreateCount > 0) detailParts.push(`Tasks created: ${tasksToCreateCount}`);
      if (workflowsCreated > 0) detailParts.push(`Workflows created: ${workflowsCreated}`);
      if (projectsCreated > 0) detailParts.push(`Projects created: ${projectsCreated}`);
      if (partnersCreated > 0) detailParts.push(`Partners created: ${partnersCreated}`);
      if (partnerUpdatesApplied > 0)
        detailParts.push(`Partner updates applied: ${partnerUpdatesApplied}`);
      const detail = detailParts.length > 0 ? detailParts.join('. ') : 'No actions selected.';

      await addEntry(partnerId, {
        type: 'interaction',
        title: 'Meeting actions approved',
        detail,
        meta: {
          meetingId: meeting.id,
          meetingTitle: meeting.title,
          tasksRequested: tasksToCreateCount,
          workflowsCreated,
          projectsCreated,
          partnersCreated,
          partnerUpdatesApplied,
          createdEntities,
        },
      }).catch(() => {});

      await logAction({
        action: 'Meeting actions approved',
        entity: 'Meeting',
        entityId: meeting.id,
        details: detail,
        meta: {
          source: 'PostMeetingSummaryDialog',
          importance: 'medium',
          tags: ['meeting', 'approve', 'actions'],
          partnerId,
          meetingTitle: meeting.title || '',
          tasksRequested: tasksToCreateCount,
          workflowsCreated,
          projectsCreated,
          partnersCreated,
          partnerUpdatesApplied,
          createdEntities,
        },
      }).catch(() => {});

      const existingHistory = Array.isArray(meeting.analysisLogHistory)
        ? meeting.analysisLogHistory
        : [];
      const approvalEntry = {
        id: `approval-${Date.now()}`,
        createdAt: new Date().toISOString(),
        source: 'actions-approved',
        meeting_topic: 'Actions approved',
        summary: detail,
        extracted_requests: [],
        recommended_actions: [],
        workflow_actions: [],
        permission_actions: [],
      };
      await meetingService
        .update(meeting.id, { analysisLogHistory: [...existingHistory, approvalEntry] })
        .catch(() => {});

      onRefetch?.();
    } finally {
      setApprovingAll(false);
    }
  };

  const buildPartnerShareText = () => {
    const lines = [];
    lines.push(`Meeting Summary${partnerName ? ` - ${partnerName}` : ''}`);
    lines.push('');
    if (meetingTopic) lines.push(`Topic: ${meetingTopic}`);
    if (summary) {
      lines.push('');
      lines.push('Executive Summary');
      lines.push(summary);
    }
    if (topics.length > 0) {
      lines.push('');
      lines.push('Key Topics');
      topics.slice(0, 8).forEach((t) => lines.push(`- ${t}`));
    }
    if (decisions.length > 0) {
      lines.push('');
      lines.push('Decisions');
      decisions.forEach((d) => lines.push(`- ${d}`));
    }
    if (agreements.length > 0) {
      lines.push('');
      lines.push('Agreements');
      agreements.forEach((a) => lines.push(`- ${a}`));
    }
    if (nextSteps.length > 0) {
      lines.push('');
      lines.push('Next Steps');
      nextSteps.forEach((s) => lines.push(`- ${s}`));
    }
    const extracted = Array.isArray(structured.extracted_requests)
      ? structured.extracted_requests
      : [];
    if (extracted.length > 0) {
      lines.push('');
      lines.push('Requests');
      extracted.slice(0, 10).forEach((r) => {
        const title = String(r?.title || r?.description || '').trim();
        if (title) lines.push(`- ${title}`);
      });
    }
    if (suggestedTasks.length > 0) {
      lines.push('');
      lines.push('Action Items');
      suggestedTasks.forEach((t) => {
        let row = `- ${t.task || 'Task'}`;
        if (t.assignee) row += ` (${t.assignee})`;
        if (t.deadline) row += ` - due ${t.deadline}`;
        lines.push(row);
      });
    }
    if (recommendedActions.length > 0) {
      lines.push('');
      lines.push('Recommended Actions');
      recommendedActions.forEach((a) => {
        const title = a.title || a.description || 'Recommended action';
        lines.push(`- ${title}`);
      });
    }
    return lines.join('\n');
  };

  const handleCopyShare = async () => {
    const shareText = buildPartnerShareText();
    try {
      await navigator.clipboard.writeText(shareText);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 1800);
    } catch {
      setCopiedShare(false);
    }
  };

  if (!meeting) return null;

  const isSampleTranscript = meeting?.transcriptSource === 'sample';

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Meeting processed"
      icon={EventAvailableOutlinedIcon}
      iconVariant="success"
      actions={
        <>
          <Button
            onClick={onClose}
            variant="outlined"
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Done
          </Button>
          <Button
            onClick={handleApproveAllActions}
            variant="contained"
            disableElevation
            startIcon={<AppIcon name="CheckCircleOutline" fallback={CheckCircleOutlineIcon} />}
            disabled={
              approvingAll ||
              (!selectedTotalCount &&
                suggested.length === 0 &&
                selectedSystemRecommendedActions.length === 0)
            }
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            {approvingAll
              ? 'Approving…'
              : `Approve all actions (${selectedTotalCount + suggested.length})`}
          </Button>
        </>
      }
    >
      <Stack spacing={2}>
        {isSampleTranscript && (
          <Alert severity="warning" sx={{ borderRadius: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Sample data shown - your recording was not transcribed.
            </Typography>
            {meeting?.transcriptError && (
              <Typography variant="body2" sx={{ mt: 0.5, color: 'error.dark' }}>
                {meeting.transcriptError}
              </Typography>
            )}
            <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
              Add <strong>ASSEMBLYAI_API_KEY</strong> + <strong>GROQ_API_KEY</strong> (free) in
              Vercel → Settings → Environment Variables → Production, then Redeploy.
            </Typography>
          </Alert>
        )}
        {meetingTopic && (
          <Box>
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}
            >
              Meeting topic
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 600 }}>
              {meetingTopic}
            </Typography>
          </Box>
        )}
        {geographicFocus.length > 0 && (
          <Box>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                color: 'text.secondary',
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
              }}
            >
              <AppIcon name="Public" fallback={PublicIcon} sx={{ fontSize: 14 }} />
              Geographic focus
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 0.5 }}>
              {geographicFocus.map((g, i) => (
                <Chip key={i} label={g} size="small" sx={{ borderRadius: 1.5 }} />
              ))}
            </Stack>
          </Box>
        )}
        {campaigns.length > 0 && (
          <Box>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                color: 'text.secondary',
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
              }}
            >
              <AppIcon
                name="CampaignOutlined"
                fallback={CampaignOutlinedIcon}
                sx={{ fontSize: 14 }}
              />
              Campaigns
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 0.5 }}>
              {campaigns.map((c, i) => (
                <Chip key={i} label={c} size="small" sx={{ borderRadius: 1.5 }} />
              ))}
            </Stack>
          </Box>
        )}
        {materialsRequested.length > 0 && (
          <Box>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                color: 'text.secondary',
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
              }}
            >
              <AppIcon name="Link" fallback={LinkIcon} sx={{ fontSize: 14 }} />
              Materials requested
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 0.5 }}>
              {materialsRequested.map((m, i) => (
                <Chip key={i} label={m} size="small" sx={{ borderRadius: 1.5 }} />
              ))}
            </Stack>
          </Box>
        )}
        {trafficDiscussion.length > 0 && (
          <Box>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                color: 'text.secondary',
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
              }}
            >
              <AppIcon name="TrendingUp" fallback={TrendingUpIcon} sx={{ fontSize: 14 }} />
              Traffic & performance
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 0.5 }}>
              {trafficDiscussion.map((t, i) => (
                <Chip key={i} label={t} size="small" sx={{ borderRadius: 1.5 }} />
              ))}
            </Stack>
          </Box>
        )}
        <Box>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 0.5,
            }}
          >
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}
            >
              Summary
            </Typography>
            {!editingSummary ? (
              <IconButton
                size="small"
                onClick={() => setEditingSummary(true)}
                aria-label="Edit summary"
              >
                <AppIcon name="EditOutlined" fallback={EditOutlinedIcon} fontSize="small" />
              </IconButton>
            ) : (
              <Button size="small" onClick={handleSaveSummary} sx={{ textTransform: 'none' }}>
                Save
              </Button>
            )}
          </Box>
          {editingSummary ? (
            <TextField
              fullWidth
              multiline
              minRows={3}
              value={summaryDraft}
              onChange={(e) => setSummaryDraft(e.target.value)}
              onBlur={handleSaveSummary}
              size="small"
              sx={{ mt: 0.5 }}
            />
          ) : (
            <Typography variant="body2" sx={{ mt: 0.5, lineHeight: 1.6, color: 'text.secondary' }}>
              {summary || '-'}
            </Typography>
          )}
        </Box>
        {topics.length > 0 && (
          <Box>
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}
            >
              Key topics
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 0.5 }}>
              {topics.slice(0, 8).map((t, i) => (
                <Chip key={i} label={t} size="small" sx={{ borderRadius: 1.5 }} />
              ))}
            </Stack>
          </Box>
        )}
        {keyDiscussionPoints.length > 0 && (
          <Box>
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}
            >
              Key discussion points
            </Typography>
            <Stack component="ul" sx={{ m: 0, pl: 2, mt: 0.5 }} spacing={0.25}>
              {keyDiscussionPoints.map((p, i) => (
                <Typography key={i} component="li" variant="body2" sx={{ color: 'text.secondary' }}>
                  {p}
                </Typography>
              ))}
            </Stack>
          </Box>
        )}
        {risksOrConcerns.length > 0 && (
          <Box>
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, color: 'error.main', textTransform: 'uppercase' }}
            >
              Risks or concerns
            </Typography>
            <Stack component="ul" sx={{ m: 0, pl: 2, mt: 0.5 }} spacing={0.25}>
              {risksOrConcerns.map((r, i) => (
                <Typography key={i} component="li" variant="body2" color="text.secondary">
                  {r}
                </Typography>
              ))}
            </Stack>
          </Box>
        )}
        {nextSteps.length > 0 && (
          <Box>
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}
            >
              Next steps
            </Typography>
            <Stack component="ul" sx={{ m: 0, pl: 2, mt: 0.5 }} spacing={0.25}>
              {nextSteps.map((s, i) => (
                <Typography key={i} component="li" variant="body2" sx={{ color: 'text.secondary' }}>
                  {s}
                </Typography>
              ))}
            </Stack>
          </Box>
        )}
        {agreements.length > 0 && (
          <Box>
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}
            >
              Agreements
            </Typography>
            <Stack component="ul" sx={{ m: 0, pl: 2, mt: 0.5 }} spacing={0.25}>
              {agreements.map((a, i) => (
                <Typography key={i} component="li" variant="body2" sx={{ color: 'text.secondary' }}>
                  {a}
                </Typography>
              ))}
            </Stack>
          </Box>
        )}
        <Box>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 0.5,
            }}
          >
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}
            >
              Partner-ready share view
            </Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={
                copiedShare ? (
                  <AppIcon name="Check" fallback={CheckIcon} fontSize="small" />
                ) : (
                  <AppIcon name="ContentCopy" fallback={ContentCopyIcon} fontSize="small" />
                )
              }
              onClick={handleCopyShare}
              sx={{ textTransform: 'none' }}
            >
              {copiedShare ? 'Copied' : 'Copy'}
            </Button>
          </Box>
          <TextField
            fullWidth
            multiline
            minRows={8}
            value={buildPartnerShareText()}
            InputProps={{ readOnly: true }}
            sx={{ mt: 0.5 }}
          />
        </Box>

        {/* Suggested tasks/actions - review, approve, then create */}
        {(suggestedTasks.length > 0 ||
          extractedRequests.length > 0 ||
          materialsToProvide.length > 0 ||
          recommendedActions.length > 0) && (
          <Box>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                color: 'text.secondary',
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
              }}
            >
              <AppIcon name="Assignment" fallback={AssignmentIcon} sx={{ fontSize: 14 }} />
              Suggested actions - review and create
            </Typography>
            {suggestedTasks.length > 0 && (
              <>
                <Typography
                  variant="caption"
                  sx={{ mt: 1, display: 'block', color: 'text.secondary' }}
                >
                  Action items
                </Typography>
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {suggestedTasks.map((t) => (
                    <Box
                      key={t.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 1,
                        p: 1,
                        borderRadius: 1.5,
                        bgcolor: alpha(theme.palette.primary.main, 0.04),
                        border: '1px solid',
                        borderColor: alpha(theme.palette.primary.main, 0.15),
                      }}
                    >
                      <Checkbox
                        size="small"
                        checked={!!t.checked}
                        onChange={() => handleToggleTask(t.id)}
                        sx={{ pt: 0.5 }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <TextField
                          size="small"
                          fullWidth
                          placeholder="Task title"
                          value={t.task || ''}
                          onChange={(e) => handleSuggestedTaskChange(t.id, 'task', e.target.value)}
                          sx={{ mb: 0.5, '& .MuiInput-root': { fontSize: '0.875rem' } }}
                        />
                        <Stack direction="row" spacing={1} flexWrap="wrap">
                          <TextField
                            size="small"
                            placeholder="Assignee"
                            value={t.assignee || ''}
                            onChange={(e) =>
                              handleSuggestedTaskChange(t.id, 'assignee', e.target.value)
                            }
                            sx={{ width: 120, '& .MuiInput-root': { fontSize: '0.8rem' } }}
                          />
                          <TextField
                            size="small"
                            placeholder="Deadline"
                            value={t.deadline || ''}
                            onChange={(e) =>
                              handleSuggestedTaskChange(t.id, 'deadline', e.target.value)
                            }
                            sx={{ width: 130, '& .MuiInput-root': { fontSize: '0.8rem' } }}
                          />
                        </Stack>
                      </Box>
                      <IconButton
                        size="small"
                        onClick={() => handleRemoveTask(t.id)}
                        color="error"
                        aria-label="Remove task"
                      >
                        <AppIcon
                          name="DeleteOutline"
                          fallback={DeleteOutlineIcon}
                          fontSize="small"
                        />
                      </IconButton>
                    </Box>
                  ))}
                </Stack>
              </>
            )}
            {extractedRequests.length > 0 && (
              <>
                <Typography
                  variant="caption"
                  sx={{ mt: 1.5, display: 'block', color: 'text.secondary' }}
                >
                  Extracted requests
                </Typography>
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {extractedRequests.map((r) => (
                    <Box
                      key={r.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 1,
                        p: 1,
                        borderRadius: 1.5,
                        bgcolor: alpha(theme.palette.primary.main, 0.05),
                        border: '1px solid',
                        borderColor: alpha(theme.palette.primary.main, 0.18),
                      }}
                    >
                      <Checkbox
                        size="small"
                        checked={!!r.checked}
                        onChange={() => handleToggleExtractedRequest(r.id)}
                        sx={{ pt: 0.5 }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <TextField
                          size="small"
                          fullWidth
                          placeholder="Request title"
                          value={r.title || ''}
                          onChange={(e) =>
                            handleExtractedRequestChange(r.id, 'title', e.target.value)
                          }
                          sx={{ mb: 0.5, '& .MuiInput-root': { fontSize: '0.875rem' } }}
                        />
                        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 0.5 }}>
                          <TextField
                            size="small"
                            placeholder="Owner"
                            value={r.owner || ''}
                            onChange={(e) =>
                              handleExtractedRequestChange(r.id, 'owner', e.target.value)
                            }
                            sx={{ width: 140, '& .MuiInput-root': { fontSize: '0.8rem' } }}
                          />
                          <TextField
                            size="small"
                            placeholder="Deadline"
                            value={r.deadline || r.due || ''}
                            onChange={(e) =>
                              handleExtractedRequestChange(r.id, 'deadline', e.target.value)
                            }
                            sx={{ width: 140, '& .MuiInput-root': { fontSize: '0.8rem' } }}
                          />
                        </Stack>
                        <TextField
                          size="small"
                          fullWidth
                          multiline
                          minRows={2}
                          placeholder="Request details"
                          value={r.description || ''}
                          onChange={(e) =>
                            handleExtractedRequestChange(r.id, 'description', e.target.value)
                          }
                          sx={{ '& .MuiInput-root': { fontSize: '0.8rem' } }}
                        />
                        <Stack direction="row" spacing={0.75} sx={{ mt: 0.75 }} flexWrap="wrap">
                          {r.request_type && (
                            <Chip
                              size="small"
                              label={r.request_type}
                              variant="outlined"
                              sx={{ height: 20 }}
                            />
                          )}
                          {r.priority && (
                            <Chip
                              size="small"
                              label={`Priority: ${r.priority}`}
                              variant="outlined"
                              sx={{ height: 20 }}
                            />
                          )}
                        </Stack>
                      </Box>
                      <IconButton
                        size="small"
                        onClick={() => handleRemoveExtractedRequest(r.id)}
                        color="error"
                        aria-label="Remove request"
                      >
                        <AppIcon
                          name="DeleteOutline"
                          fallback={DeleteOutlineIcon}
                          fontSize="small"
                        />
                      </IconButton>
                    </Box>
                  ))}
                </Stack>
              </>
            )}
            {materialsToProvide.length > 0 && (
              <>
                <Typography
                  variant="caption"
                  sx={{ mt: 1.5, display: 'block', color: 'text.secondary' }}
                >
                  Provide materials / details
                </Typography>
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {materialsToProvide.map((m) => (
                    <Box
                      key={m.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 1,
                        p: 1,
                        borderRadius: 1.5,
                        bgcolor: alpha(theme.palette.primary.main, 0.05),
                        border: '1px solid',
                        borderColor: alpha(theme.palette.primary.main, 0.18),
                      }}
                    >
                      <Checkbox
                        size="small"
                        checked={!!m.checked}
                        onChange={() => handleToggleMaterial(m.id)}
                        sx={{ pt: 0.5 }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <TextField
                          size="small"
                          fullWidth
                          placeholder="Materials / details to provide"
                          value={m.value || ''}
                          onChange={(e) => handleMaterialChange(m.id, e.target.value)}
                          sx={{ '& .MuiInput-root': { fontSize: '0.875rem' } }}
                        />
                      </Box>
                      <IconButton
                        size="small"
                        onClick={() => handleRemoveMaterial(m.id)}
                        color="error"
                        aria-label="Remove material item"
                      >
                        <AppIcon
                          name="DeleteOutline"
                          fallback={DeleteOutlineIcon}
                          fontSize="small"
                        />
                      </IconButton>
                    </Box>
                  ))}
                </Stack>
              </>
            )}
            {recommendedActions.length > 0 && (
              <>
                <Typography
                  variant="caption"
                  sx={{ mt: 1.5, display: 'block', color: 'text.secondary' }}
                >
                  Recommended one-click actions
                </Typography>
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {recommendedActions.map((a) => (
                    <Box
                      key={a.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 1,
                        p: 1,
                        borderRadius: 1.5,
                        bgcolor: alpha(theme.palette.warning.main, 0.06),
                        border: '1px solid',
                        borderColor: alpha(theme.palette.warning.main, 0.2),
                      }}
                    >
                      <Checkbox
                        size="small"
                        checked={!!a.checked}
                        onChange={() => handleToggleRecommendedAction(a.id)}
                        sx={{ pt: 0.5 }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <TextField
                          size="small"
                          fullWidth
                          placeholder="Action title"
                          value={a.title || ''}
                          onChange={(e) =>
                            handleRecommendedActionChange(a.id, 'title', e.target.value)
                          }
                          sx={{ mb: 0.5, '& .MuiInput-root': { fontSize: '0.875rem' } }}
                        />
                        <TextField
                          size="small"
                          fullWidth
                          multiline
                          minRows={2}
                          placeholder="Action details"
                          value={a.description || ''}
                          onChange={(e) =>
                            handleRecommendedActionChange(a.id, 'description', e.target.value)
                          }
                          sx={{ '& .MuiInput-root': { fontSize: '0.8rem' } }}
                        />
                        <Stack direction="row" spacing={0.75} sx={{ mt: 0.75 }} flexWrap="wrap">
                          {a.action_type && (
                            <Chip
                              size="small"
                              label={a.action_type}
                              variant="outlined"
                              sx={{ height: 20 }}
                            />
                          )}
                          {SYSTEM_ACTION_TYPES.has(normalizeActionType(a.action_type)) && (
                            <Chip
                              size="small"
                              label="System action"
                              color="primary"
                              sx={{ height: 20 }}
                            />
                          )}
                          {a.one_click === false && (
                            <Chip
                              size="small"
                              label="Needs review"
                              color="warning"
                              sx={{ height: 20 }}
                            />
                          )}
                        </Stack>
                      </Box>
                      <IconButton
                        size="small"
                        onClick={() => handleRemoveRecommendedAction(a.id)}
                        color="error"
                        aria-label="Remove recommended action"
                      >
                        <AppIcon
                          name="DeleteOutline"
                          fallback={DeleteOutlineIcon}
                          fontSize="small"
                        />
                      </IconButton>
                    </Box>
                  ))}
                </Stack>
              </>
            )}
            <Button
              size="small"
              variant="contained"
              startIcon={<AppIcon name="TaskAlt" fallback={TaskAltIcon} />}
              onClick={handleCreateTasks}
              disabled={creatingTasks || approvingAll || selectedTotalCount === 0}
              sx={{ mt: 1.5, textTransform: 'none', fontWeight: 600 }}
            >
              {creatingTasks
                ? 'Creating…'
                : `Create ${selectedTotalCount} task${selectedTotalCount !== 1 ? 's' : ''} in Task Manager`}
            </Button>
          </Box>
        )}

        {tasksCreatedCount > 0 && (
          <Box
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.success.main, 0.1),
              border: '1px solid',
              borderColor: alpha(theme.palette.success.main, 0.3),
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <AppIcon
              name="TaskAlt"
              fallback={TaskAltIcon}
              sx={{ color: 'success.main', fontSize: 22 }}
            />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {tasksCreatedCount} task{tasksCreatedCount !== 1 ? 's' : ''} added to Task Manager
              {partnerName && ` for ${partnerName}`}.
            </Typography>
          </Box>
        )}
        {(systemActionsCreated.workflows > 0 ||
          systemActionsCreated.projects > 0 ||
          systemActionsCreated.partners > 0) && (
          <Alert severity="success" sx={{ borderRadius: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              System actions executed.
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {[
                systemActionsCreated.workflows
                  ? `${systemActionsCreated.workflows} workflow(s)`
                  : '',
                systemActionsCreated.projects ? `${systemActionsCreated.projects} project(s)` : '',
                systemActionsCreated.partners ? `${systemActionsCreated.partners} partner(s)` : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </Typography>
          </Alert>
        )}
        {suggested.length > 0 && (
          <Box>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                color: 'text.secondary',
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
              }}
            >
              <AppIcon name="PersonOutline" fallback={PersonOutlineIcon} sx={{ fontSize: 14 }} />
              Suggested partner updates
            </Typography>
            <Stack spacing={1} sx={{ mt: 1 }}>
              {suggested.map((s) => (
                <Box
                  key={s.id}
                  sx={{
                    py: 1,
                    px: 1.5,
                    borderRadius: 1.5,
                    bgcolor: alpha(theme.palette.divider, 0.08),
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {s.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {String(s.currentValue || '-')} → {String(s.suggestedValue || '-')}
                  </Typography>
                </Box>
              ))}
            </Stack>
            <Button
              size="small"
              variant="contained"
              startIcon={<AppIcon name="CheckCircleOutline" fallback={CheckCircleOutlineIcon} />}
              onClick={handleApplyAll}
              disabled={applying || approvingAll}
              sx={{ mt: 1.5, textTransform: 'none', fontWeight: 600 }}
            >
              {applying ? 'Applying…' : `Apply all (${suggested.length}) and add to History`}
            </Button>
            {appliedCount > 0 && (
              <Typography variant="caption" color="success.main" sx={{ display: 'block', mt: 0.5 }}>
                {appliedCount} change{appliedCount !== 1 ? 's' : ''} applied and logged in History.
              </Typography>
            )}
          </Box>
        )}

        {/* View Transcript | View Tasks */}
        {(onViewTranscript || onViewTasks) && (
          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ pt: 1 }}>
            {onViewTranscript && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<AppIcon name="OpenInNew" fallback={OpenInNewIcon} />}
                onClick={() => {
                  onViewTranscript(meeting.id);
                  onClose?.();
                }}
                sx={{ textTransform: 'none' }}
              >
                View transcript
              </Button>
            )}
            {onViewTasks && partnerId && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<AppIcon name="Assignment" fallback={AssignmentIcon} />}
                onClick={() => {
                  onViewTasks(partnerId);
                  onClose?.();
                }}
                sx={{ textTransform: 'none' }}
              >
                View tasks
              </Button>
            )}
          </Stack>
        )}
      </Stack>
    </FormDialog>
  );
}
