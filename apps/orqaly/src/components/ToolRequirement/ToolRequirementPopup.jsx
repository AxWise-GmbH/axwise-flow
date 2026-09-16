/**
 * ToolRequirementPopup — fixed bottom-right chat-widget showing required tools
 * after the pipeline assigns an agent.
 *
 * Renders a floating panel with:
 *  - Gradient header with agent/team info + progress + mode badge
 *  - Scrollable tool list with status indicators + risk badges
 *  - Inline API-key input for platform tools
 *  - OAuth connect button for Composio/MCP tools
 *  - Manual mode: Approve / Reject per tool with audit logging
 *  - Minimize / dismiss controls
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Button,
  TextField,
  InputAdornment,
  Collapse,
  Slide,
  Chip,
  LinearProgress,
  Tooltip,
  useTheme,
  alpha,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import BlockIcon from '@mui/icons-material/Block';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import CloseIcon from '@mui/icons-material/Close';
import RemoveIcon from '@mui/icons-material/Remove';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import LinkIcon from '@mui/icons-material/Link';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ThumbUpOutlinedIcon from '@mui/icons-material/ThumbUpOutlined';
import ThumbDownOutlinedIcon from '@mui/icons-material/ThumbDownOutlined';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { useToolRequirements } from '../../context/ToolRequirementContext';
import { updateTool } from '../../services/toolService';
import { initiateComposioConnection } from '../../services/composioService';
import { logAction } from '../../services/auditLogBackend';
import { useNotifications } from '../../context/NotificationContext';

import AppIcon from '../icons/AppIcon';

export default function ToolRequirementPopup() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const {
    isOpen,
    isMinimized,
    agentRole,
    teamName,
    toolRequirements,
    approvalMode,
    rejectedTools,
    dismissToolRequirements,
    toggleMinimize,
    markToolConfigured,
    rejectToolConfiguration,
  } = useToolRequirements();

  let pushNotification = null;
  try {
    const notif = useNotifications();
    pushNotification = notif?.pushNotification || null;
  } catch {
    // NotificationProvider may not be available in tests
  }

  const [activeToolId, setActiveToolId] = useState(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const notifiedRef = useRef(false);

  const configuredCount = toolRequirements.filter((t) => t.configured).length;
  const totalCount = toolRequirements.length;
  const allConfigured = totalCount > 0 && configuredCount === totalCount;
  const progress = totalCount > 0 ? (configuredCount / totalCount) * 100 : 0;
  const isManual = approvalMode === 'manual';

  // Fire notification once when popup opens in Manual mode
  useEffect(() => {
    if (isOpen && !isMinimized && isManual && pushNotification && !notifiedRef.current) {
      const unconfigured = toolRequirements.filter((t) => !t.configured).length;
      if (unconfigured > 0) {
        pushNotification(
          'Tool Approval Required',
          `Agent ${agentRole} requests ${unconfigured} tool${unconfigured !== 1 ? 's' : ''}`,
          { severity: 'warning' }
        );
        notifiedRef.current = true;
      }
    }
    if (!isOpen) notifiedRef.current = false;
  }, [isOpen, isMinimized, isManual, pushNotification, agentRole, toolRequirements]);

  const handleSaveApiKey = useCallback(
    async (tool) => {
      if (!apiKeyInput.trim()) return;
      setSaving(true);
      setSaveMsg(null);
      try {
        await updateTool(tool.id, { apiKey: apiKeyInput.trim() });
        markToolConfigured(tool.id);
        setSaveMsg({ success: true, text: isManual ? 'Approved & saved!' : 'Saved!' });
        setApiKeyInput('');
        setActiveToolId(null);
      } catch (e) {
        setSaveMsg({ success: false, text: e.message || 'Failed to save' });
      } finally {
        setSaving(false);
      }
    },
    [apiKeyInput, markToolConfigured, isManual]
  );

  const handleOAuthConnect = useCallback(
    async (tool) => {
      try {
        const res = await initiateComposioConnection(tool.composioApp);
        if (res?.redirectUrl) {
          globalThis.open(res.redirectUrl, '_blank', 'width=600,height=700');
        }
        markToolConfigured(tool.id);
        // Audit: OAuth connect logged by markToolConfigured; add composio-specific detail
        logAction({
          action: isManual ? 'Tool OAuth approved & connected' : 'Tool OAuth connected',
          entity: 'Tool',
          entityId: tool.id,
          details: `OAuth connected for ${tool.name} (${tool.composioApp})`,
          meta: {
            source: 'toolRequirementPopup',
            importance: 'high',
            tags: ['tool', 'oauth', 'composio', 'consilium'],
            agentRole,
            teamName,
            approvalMode,
          },
        }).catch(() => {});
      } catch (e) {
        console.warn('[ToolRequirementPopup] OAuth failed:', e.message);
      }
    },
    [markToolConfigured, isManual, agentRole, teamName, approvalMode]
  );

  if (!isOpen || totalCount === 0) return null;

  // ── Helper: is this tool rejected? ──────────────────────────
  const isRejected = (toolId) => rejectedTools.includes(toolId);

  // ── Helper: render risk badge ───────────────────────────────
  const riskBadge = (tool) => {
    if (tool.riskLevel === 'high') {
      return (
        <Chip
          label="High Risk"
          size="small"
          color="error"
          sx={{ ml: 0.5, height: 18, fontSize: '0.65rem' }}
        />
      );
    }
    if (tool.riskLevel === 'medium') {
      return (
        <Chip
          label="Medium"
          size="small"
          color="warning"
          sx={{ ml: 0.5, height: 18, fontSize: '0.65rem' }}
        />
      );
    }
    return null;
  };

  // ── Helper: render secondary action per tool ────────────────
  const renderSecondaryAction = (tool) => {
    if (tool.configured) return null;
    if (isRejected(tool.id)) {
      return (
        <Chip
          label="Rejected"
          size="small"
          color="error"
          variant="outlined"
          sx={{ fontSize: '0.7rem', height: 24 }}
        />
      );
    }

    // Manual mode: approve + reject buttons
    if (isManual) {
      if (tool.connectionType === 'composio') {
        return (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Button
              size="small"
              variant="outlined"
              color="success"
              startIcon={
                <AppIcon
                  name="ThumbUpOutlined"
                  fallback={ThumbUpOutlinedIcon}
                  sx={{ fontSize: 14 }}
                />
              }
              onClick={() => handleOAuthConnect(tool)}
              sx={{ fontSize: '0.7rem', textTransform: 'none', borderRadius: 2 }}
            >
              Approve
            </Button>
            <IconButton size="small" color="error" onClick={() => rejectToolConfiguration(tool.id)}>
              <AppIcon
                name="ThumbDownOutlined"
                fallback={ThumbDownOutlinedIcon}
                sx={{ fontSize: 16 }}
              />
            </IconButton>
          </Box>
        );
      }
      if (tool.connectionType !== 'internal') {
        return (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <IconButton
              size="small"
              color="success"
              onClick={() => {
                setActiveToolId(activeToolId === tool.id ? null : tool.id);
                setApiKeyInput('');
                setSaveMsg(null);
              }}
            >
              <AppIcon
                name="ThumbUpOutlined"
                fallback={ThumbUpOutlinedIcon}
                sx={{ fontSize: 16 }}
              />
            </IconButton>
            <IconButton size="small" color="error" onClick={() => rejectToolConfiguration(tool.id)}>
              <AppIcon
                name="ThumbDownOutlined"
                fallback={ThumbDownOutlinedIcon}
                sx={{ fontSize: 16 }}
              />
            </IconButton>
          </Box>
        );
      }
      return null;
    }

    // Auto mode: existing Setup / Connect buttons
    if (tool.connectionType === 'composio') {
      return (
        <Button
          size="small"
          variant="outlined"
          startIcon={<AppIcon name="Link" fallback={LinkIcon} sx={{ fontSize: 14 }} />}
          onClick={() => handleOAuthConnect(tool)}
          sx={{ fontSize: '0.75rem', textTransform: 'none', borderRadius: 2 }}
        >
          Connect
        </Button>
      );
    }
    if (tool.connectionType !== 'internal') {
      return (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setActiveToolId(activeToolId === tool.id ? null : tool.id);
              setApiKeyInput('');
              setSaveMsg(null);
            }}
            sx={{ fontSize: '0.75rem', textTransform: 'none', borderRadius: 2 }}
          >
            {activeToolId === tool.id ? 'Cancel' : 'Setup'}
          </Button>
          {tool.credentials?.[0]?.helpUrl && (
            <Tooltip title="Auto-provisioning is temporarily unavailable. Add the key manually.">
              <span>
                <Button
                  size="small"
                  variant="contained"
                  color="secondary"
                  startIcon={
                    <AppIcon name="AutoFixHigh" fallback={AutoFixHighIcon} sx={{ fontSize: 14 }} />
                  }
                  disabled
                  aria-label="Auto-provisioning is temporarily unavailable; add the key manually"
                  data-testid={`auto-provision-${tool.id}`}
                  sx={{
                    fontSize: '0.65rem',
                    textTransform: 'none',
                    borderRadius: 2,
                    minWidth: 'auto',
                    px: 1,
                  }}
                >
                  Auto unavailable
                </Button>
              </span>
            </Tooltip>
          )}
        </Box>
      );
    }
    return null;
  };

  // ── Minimized badge ─────────────────────────────────────────
  if (isMinimized) {
    const unconfigured = totalCount - configuredCount;
    return (
      <Slide direction="up" in mountOnEnter unmountOnExit>
        <Chip
          icon={<AppIcon name="BuildOutlined" fallback={BuildOutlinedIcon} sx={{ fontSize: 18 }} />}
          label={
            allConfigured
              ? 'All tools ready'
              : `${unconfigured} tool${unconfigured !== 1 ? 's' : ''} needed`
          }
          onClick={toggleMinimize}
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: theme.zIndex.speedDial - 1,
            bgcolor: allConfigured
              ? alpha(theme.palette.success.main, 0.15)
              : alpha(theme.palette.primary.main, 0.15),
            color: allConfigured ? theme.palette.success.main : theme.palette.primary.main,
            fontWeight: 600,
            fontSize: '0.85rem',
            height: 40,
            px: 1,
            cursor: 'pointer',
            border: '1px solid',
            borderColor: allConfigured
              ? alpha(theme.palette.success.main, 0.3)
              : alpha(theme.palette.primary.main, 0.3),
            '&:hover': {
              bgcolor: allConfigured
                ? alpha(theme.palette.success.main, 0.25)
                : alpha(theme.palette.primary.main, 0.25),
            },
          }}
        />
      </Slide>
    );
  }

  // ── Expanded panel ──────────────────────────────────────────
  return (
    <Slide direction="up" in mountOnEnter unmountOnExit>
      <Paper
        elevation={0}
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: theme.zIndex.speedDial - 1,
          width: { xs: 'calc(100vw - 40px)', sm: 380 },
          maxHeight: { xs: '70vh', sm: 520 },
          borderRadius: 3,
          border: '1px solid',
          borderColor: isDark
            ? alpha(theme.palette.common.white, 0.1)
            : alpha(theme.palette.divider, 0.8),
          borderTop: isManual ? `2px solid ${theme.palette.warning.main}` : undefined,
          background: isDark
            ? `linear-gradient(180deg, ${alpha(theme.palette.background.paper, 0.92)} 0%, ${alpha(theme.palette.background.paper, 0.85)} 100%)`
            : `linear-gradient(180deg, #FFFFFF 0%, ${alpha('#F8FAFC', 0.95)} 100%)`,
          backdropFilter: 'blur(16px)',
          boxShadow: isDark
            ? '0 16px 48px rgba(0,0,0,0.5), 0 6px 20px rgba(0,0,0,0.35)'
            : '0 16px 48px rgba(0,0,0,0.12), 0 6px 20px rgba(0,0,0,0.06)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* ── Header ─────────────────────────────────────── */}
        <Box
          sx={{
            background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
            color: '#fff',
            px: 2,
            py: 1.5,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AppIcon name="BuildOutlined" fallback={BuildOutlinedIcon} sx={{ fontSize: 20 }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Tools Required
              </Typography>
              <Chip
                label={isManual ? 'Manual' : 'Auto'}
                size="small"
                sx={{
                  bgcolor: isManual ? alpha('#FFA726', 0.25) : alpha('#66BB6A', 0.25),
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.7rem',
                  height: 22,
                }}
              />
            </Box>
            <Box>
              <IconButton size="small" onClick={toggleMinimize} sx={{ color: 'inherit' }}>
                <AppIcon name="Remove" fallback={RemoveIcon} sx={{ fontSize: 18 }} />
              </IconButton>
              <IconButton size="small" onClick={dismissToolRequirements} sx={{ color: 'inherit' }}>
                <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 18 }} />
              </IconButton>
            </Box>
          </Box>
          <Typography variant="caption" sx={{ opacity: 0.85, display: 'block', mt: 0.25 }}>
            {agentRole}
            {teamName ? ` · ${teamName}` : ''}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                bgcolor: alpha('#fff', 0.2),
                '& .MuiLinearProgress-bar': { bgcolor: '#fff', borderRadius: 2 },
              }}
            />
            <Typography variant="caption" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
              {configuredCount}/{totalCount}
            </Typography>
          </Box>
        </Box>

        {/* ── Tool List ──────────────────────────────────── */}
        <Box sx={{ flex: 1, overflowY: 'auto', maxHeight: 340 }}>
          {allConfigured && (
            <Box sx={{ textAlign: 'center', py: 3, px: 2 }}>
              <AppIcon
                name="CheckCircle"
                fallback={CheckCircleIcon}
                sx={{ fontSize: 40, color: 'success.main', mb: 1 }}
              />
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'success.main' }}>
                All tools ready!
              </Typography>
              <Typography variant="caption" color="text.secondary">
                The agent can now execute with full tool access.
              </Typography>
            </Box>
          )}

          <List dense disablePadding>
            {toolRequirements.map((tool) => (
              <Box key={tool.id}>
                <ListItem
                  sx={{
                    px: 2,
                    py: 0.75,
                    '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                    ...(isRejected(tool.id) && { opacity: 0.5 }),
                  }}
                  secondaryAction={renderSecondaryAction(tool)}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    {isRejected(tool.id) ? (
                      <AppIcon
                        name="Block"
                        fallback={BlockIcon}
                        sx={{ fontSize: 20, color: 'error.main' }}
                      />
                    ) : tool.configured ? (
                      <AppIcon
                        name="CheckCircle"
                        fallback={CheckCircleIcon}
                        sx={{ fontSize: 20, color: 'success.main' }}
                      />
                    ) : (
                      <AppIcon
                        name="WarningAmber"
                        fallback={WarningAmberIcon}
                        sx={{ fontSize: 20, color: 'warning.main' }}
                      />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box
                        component="span"
                        sx={{ textDecoration: isRejected(tool.id) ? 'line-through' : 'none' }}
                      >
                        {tool.name}
                      </Box>
                    }
                    secondary={
                      <Box
                        component="span"
                        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
                      >
                        {isRejected(tool.id)
                          ? 'Rejected'
                          : tool.configured
                            ? tool.connectionType === 'internal'
                              ? 'Built-in'
                              : 'Configured'
                            : tool.connectionType === 'composio'
                              ? 'Needs OAuth connection'
                              : 'Needs API key'}
                        {!isRejected(tool.id) && riskBadge(tool)}
                      </Box>
                    }
                    primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
                    secondaryTypographyProps={{ variant: 'caption', component: 'div' }}
                  />
                </ListItem>

                {/* ── Inline API Key Input ──────────────── */}
                {!isRejected(tool.id) && (
                  <Collapse in={activeToolId === tool.id && !tool.configured}>
                    <Box sx={{ px: 2, pb: 1.5 }}>
                      <TextField
                        fullWidth
                        size="small"
                        type={showKey ? 'text' : 'password'}
                        placeholder={tool.credentials?.[0]?.label || 'Paste API key'}
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        disabled={saving}
                        slotProps={{
                          input: {
                            endAdornment: (
                              <InputAdornment position="end">
                                <IconButton
                                  size="small"
                                  onClick={() => setShowKey((v) => !v)}
                                  edge="end"
                                >
                                  {showKey ? (
                                    <AppIcon
                                      name="VisibilityOff"
                                      fallback={VisibilityOffIcon}
                                      sx={{ fontSize: 18 }}
                                    />
                                  ) : (
                                    <AppIcon
                                      name="Visibility"
                                      fallback={VisibilityIcon}
                                      sx={{ fontSize: 18 }}
                                    />
                                  )}
                                </IconButton>
                                <IconButton
                                  size="small"
                                  color={isManual ? 'success' : 'primary'}
                                  onClick={() => handleSaveApiKey(tool)}
                                  disabled={saving || !apiKeyInput.trim()}
                                  edge="end"
                                >
                                  <AppIcon
                                    name="SaveOutlined"
                                    fallback={SaveOutlinedIcon}
                                    sx={{ fontSize: 18 }}
                                  />
                                </IconButton>
                              </InputAdornment>
                            ),
                          },
                        }}
                        sx={{ mt: 0.5, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                      />
                      {tool.credentials?.[0]?.helpUrl && (
                        <Typography
                          variant="caption"
                          component="a"
                          href={tool.credentials[0].helpUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.5,
                            mt: 0.5,
                            color: 'primary.main',
                            textDecoration: 'none',
                            '&:hover': { textDecoration: 'underline' },
                          }}
                        >
                          <AppIcon
                            name="OpenInNew"
                            fallback={OpenInNewIcon}
                            sx={{ fontSize: 12 }}
                          />
                          {tool.credentials[0].helpText || 'Get API key'}
                        </Typography>
                      )}
                      {saveMsg && (
                        <Typography
                          variant="caption"
                          sx={{
                            mt: 0.5,
                            display: 'block',
                            color: saveMsg.success ? 'success.main' : 'error.main',
                          }}
                        >
                          {saveMsg.text}
                        </Typography>
                      )}
                    </Box>
                  </Collapse>
                )}
              </Box>
            ))}
          </List>
        </Box>
      </Paper>
    </Slide>
  );
}
