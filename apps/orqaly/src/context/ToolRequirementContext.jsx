/**
 * ToolRequirementContext — surfaces tool credential requirements after pipeline assigns an agent.
 *
 * When a request goes through the pipeline and an agent is assigned, this context
 * checks which of the agent's tools are unconfigured and, if any, opens a floating
 * popup so the user can input API keys or trigger OAuth connections.
 *
 * Consilium governance:
 * - Auto mode: tools configured directly, every action logged to audit_log
 * - Manual mode: every tool configuration requires explicit user approval
 * - Per-agent override via consiliumMode field in predefinedAgents.js
 */
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from 'react';
import { PREDEFINED_AGENTS } from '../config/predefinedAgents';
import { getToolById } from '../config/predefinedTools';
import { getAllTools, getToolWhitelist } from '../services/toolService';
import { fetchComposioConnections } from '../services/composioService';
import { logAction } from '../services/auditLogBackend';

const ToolRequirementContext = createContext({
  isOpen: false,
  isMinimized: false,
  agentRole: '',
  teamName: '',
  jobId: null,
  toolRequirements: [],
  approvalMode: 'auto',
  rejectedTools: [],
  showToolRequirements: () => {},
  dismissToolRequirements: () => {},
  toggleMinimize: () => {},
  markToolConfigured: () => {},
  rejectToolConfiguration: () => {},
});

/** Resolve an agent's tool IDs from PREDEFINED_AGENTS by role name. */
function getToolIdsForRole(role) {
  const agentDef = PREDEFINED_AGENTS.find(
    (a) => a.role === role || a.role?.toLowerCase() === role?.toLowerCase()
  );
  return agentDef?.tools || [];
}

/** Determine if a tool is configured based on its type and DB record. */
function checkToolConfigured(toolDef, dbRecord, composioConnections) {
  if (!toolDef) return true;
  if (toolDef.connectionType === 'internal') return true;
  if (toolDef.connectionType === 'composio') {
    return composioConnections.some(
      (c) => c.appName?.toLowerCase() === toolDef.composioApp?.toLowerCase()
    );
  }
  // API / webhook / SDK tools — check for apiKey in the DB record's data
  return !!dbRecord?.credentialConfigured;
}

/** Resolve approval mode: per-agent override → global localStorage setting → 'auto'. */
function resolveApprovalMode(role) {
  const agentDef = PREDEFINED_AGENTS.find(
    (a) => a.role === role || a.role?.toLowerCase() === role?.toLowerCase()
  );
  if (agentDef?.consiliumMode) return agentDef.consiliumMode;
  try {
    return localStorage.getItem('orch_consilium_tool_mode') || 'auto';
  } catch {
    return 'auto';
  }
}

export function ToolRequirementProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [agentRole, setAgentRole] = useState('');
  const [teamName, setTeamName] = useState('');
  const [jobId, setJobId] = useState(null);
  const [toolRequirements, setToolRequirements] = useState([]);
  const [approvalMode, setApprovalMode] = useState('auto');
  const [rejectedTools, setRejectedTools] = useState([]);

  // Refs for audit logging inside callbacks that capture stale closures
  const stateRef = useRef({
    agentRole: '',
    teamName: '',
    jobId: null,
    approvalMode: 'auto',
    toolRequirements: [],
  });
  useEffect(() => {
    stateRef.current = { agentRole, teamName, jobId, approvalMode, toolRequirements };
  }, [agentRole, teamName, jobId, approvalMode, toolRequirements]);

  const showToolRequirements = useCallback(async ({ agent, teamName: team, jobId: jid }) => {
    const role = agent?.role || agent?.name || '';
    if (!role) return;

    const toolIds = getToolIdsForRole(role);
    if (toolIds.length === 0) return;

    // Load current tool records + composio connections + whitelist in parallel
    let dbTools = [];
    let connections = [];
    let whitelist = [];
    try {
      [dbTools, connections, whitelist] = await Promise.all([
        getAllTools(),
        fetchComposioConnections().catch(() => []),
        getToolWhitelist().catch(() => []),
      ]);
    } catch {
      dbTools = [];
    }

    const dbMap = new Map(dbTools.map((t) => [t.id, t]));
    const whitelistMap = new Map(whitelist.map((w) => [w.tool_id, w]));

    const requirements = toolIds
      .map((id) => {
        const def = getToolById(id);
        if (!def) return null;
        const dbRecord = dbMap.get(id);
        const wlEntry = whitelistMap.get(id);
        return {
          id: def.id,
          name: def.name,
          description: def.description || '',
          connectionType: def.connectionType,
          composioApp: def.composioApp || null,
          credentials: def.credentials || [],
          configured: checkToolConfigured(def, dbRecord, connections),
          riskLevel: wlEntry?.risk_level || 'low',
          requiresApproval: wlEntry?.requires_approval || false,
        };
      })
      .filter(Boolean);

    // If all tools are already configured, skip the popup
    if (requirements.every((t) => t.configured)) return;

    const mode = resolveApprovalMode(role);

    setAgentRole(role);
    setTeamName(team || agent?.category || '');
    setJobId(jid || null);
    setToolRequirements(requirements);
    setApprovalMode(mode);
    setRejectedTools([]);
    setIsMinimized(false);
    setIsOpen(true);

    // Audit: log that tool requirements were surfaced
    const unconfigured = requirements.filter((t) => !t.configured);
    logAction({
      action: 'Tool requirements surfaced',
      entity: 'Tool',
      entityId: jid || null,
      details: `${unconfigured.length} unconfigured tool(s) for agent ${role}`,
      meta: {
        source: 'toolRequirementPopup',
        importance: 'medium',
        tags: ['tool', 'requirement', 'consilium'],
        agentRole: role,
        teamName: team || '',
        jobId: jid || null,
        approvalMode: mode,
        tools: unconfigured.map((t) => t.id),
      },
    }).catch(() => {});
  }, []);

  const dismissToolRequirements = useCallback(() => {
    setIsOpen(false);
    setToolRequirements([]);
    setRejectedTools([]);
  }, []);

  const toggleMinimize = useCallback(() => {
    setIsMinimized((prev) => !prev);
  }, []);

  const markToolConfigured = useCallback((toolId) => {
    // Audit log before state update
    const {
      agentRole: role,
      teamName: team,
      jobId: jid,
      approvalMode: mode,
      toolRequirements: reqs,
    } = stateRef.current;
    const tool = reqs.find((t) => t.id === toolId);
    logAction({
      action: mode === 'manual' ? 'Tool configuration approved' : 'Tool credential configured',
      entity: 'Tool',
      entityId: toolId,
      details: `${tool?.name || toolId} configured for agent ${role}`,
      meta: {
        source: 'toolRequirementPopup',
        importance: 'high',
        tags: ['tool', 'credential', 'configure', 'consilium'],
        agentRole: role,
        teamName: team,
        jobId: jid,
        approvalMode: mode,
      },
    }).catch(() => {});

    setToolRequirements((prev) => {
      const next = prev.map((t) => (t.id === toolId ? { ...t, configured: true } : t));
      // Auto-dismiss after short delay if all configured
      if (next.every((t) => t.configured)) {
        setTimeout(() => {
          setIsOpen(false);
          setToolRequirements([]);
        }, 3000);
      }
      return next;
    });
  }, []);

  const rejectToolConfiguration = useCallback((toolId) => {
    const {
      agentRole: role,
      teamName: team,
      jobId: jid,
      toolRequirements: reqs,
    } = stateRef.current;
    const tool = reqs.find((t) => t.id === toolId);
    setRejectedTools((prev) => [...prev, toolId]);
    logAction({
      action: 'Tool configuration rejected',
      entity: 'Tool',
      entityId: toolId,
      details: `Rejected ${tool?.name || toolId} for agent ${role}`,
      meta: {
        source: 'toolRequirementPopup',
        importance: 'high',
        tags: ['tool', 'credential', 'reject', 'consilium'],
        agentRole: role,
        teamName: team,
        jobId: jid,
        approvalMode: 'manual',
      },
    }).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      isMinimized,
      agentRole,
      teamName,
      jobId,
      toolRequirements,
      approvalMode,
      rejectedTools,
      showToolRequirements,
      dismissToolRequirements,
      toggleMinimize,
      markToolConfigured,
      rejectToolConfiguration,
    }),
    [
      isOpen,
      isMinimized,
      agentRole,
      teamName,
      jobId,
      toolRequirements,
      approvalMode,
      rejectedTools,
      showToolRequirements,
      dismissToolRequirements,
      toggleMinimize,
      markToolConfigured,
      rejectToolConfiguration,
    ]
  );

  return (
    <ToolRequirementContext.Provider value={value}>{children}</ToolRequirementContext.Provider>
  );
}

export function useToolRequirements() {
  const ctx = useContext(ToolRequirementContext);
  if (!ctx) throw new Error('useToolRequirements must be inside ToolRequirementProvider');
  return ctx;
}

export default ToolRequirementContext;
