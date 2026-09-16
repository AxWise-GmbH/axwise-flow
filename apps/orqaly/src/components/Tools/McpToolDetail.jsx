/**
 * MCP Tool Detail Dialog — professional tool info with Overview, Connect, Documentation tabs.
 *
 * Opens when a user clicks an MCP tool card in the catalog.
 * Shows actions, agent assignments, OAuth/API key connection, and setup docs.
 */
import { useState, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  Box,
  Typography,
  IconButton,
  Chip,
  Tabs,
  Tab,
  Divider,
  Button,
  TextField,
  InputAdornment,
  Paper,
  CircularProgress,
  useTheme,
  alpha,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import LaunchIcon from '@mui/icons-material/Launch';
import StarIcon from '@mui/icons-material/Star';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import ToolIcon from '../icons/ToolIcon';
import { PREDEFINED_AGENTS } from '../../config/predefinedAgents';
import { updateTool } from '../../services/toolService';
import { initiateComposioConnection } from '../../services/composioService';

// ── Subcategory colors (matches McpToolCatalog) ──────────────
const CHIP_COLORS = [
  '#6366F1',
  '#EC4899',
  '#14B8A6',
  '#F59E0B',
  '#8B5CF6',
  '#EF4444',
  '#3B82F6',
  '#10B981',
  '#F97316',
];
import { MCP_SUBCATEGORIES } from '../../config/mcpToolCatalog';

import AppIcon from '../icons/AppIcon';

function getSubcategoryColor(sub) {
  const idx = MCP_SUBCATEGORIES.indexOf(sub);
  return CHIP_COLORS[idx >= 0 ? idx % CHIP_COLORS.length : 0];
}

/** Format GITHUB_CREATE_ISSUE → "Create Issue" */
function formatActionName(action) {
  const parts = action.split('_');
  // Drop the app prefix (first part)
  const meaningful = parts.slice(1);
  return meaningful.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
}

// ── Section header ───────────────────────────────────────────
function SectionHeader({ icon, title, count }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
      <Box sx={{ color: 'text.secondary', display: 'flex', '& > *': { fontSize: 18 } }}>{icon}</Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
        {title}
      </Typography>
      {count != null && (
        <Chip label={count} size="small" sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700 }} />
      )}
    </Box>
  );
}

export default function McpToolDetail({
  open,
  onClose,
  tool,
  catalogEntry,
  connections = [],
  onToolUpdated,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const [activeTab, setActiveTab] = useState(0);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const subColor = catalogEntry ? getSubcategoryColor(catalogEntry.subcategory) : '#6366F1';

  // Check if connected via Composio OAuth
  const composioConnection = useMemo(() => {
    if (!catalogEntry || !connections.length) return null;
    return (
      connections.find(
        (c) => c.appName === catalogEntry.composioApp || c.appName === catalogEntry.id
      ) || null
    );
  }, [catalogEntry, connections]);

  const isConnected = tool?.status === 'active' || !!composioConnection;

  // Agents that use this tool
  const assignedAgents = useMemo(() => {
    if (!tool) return [];
    return PREDEFINED_AGENTS.filter((a) => a.tools?.includes(tool.id));
  }, [tool]);

  // ── Handlers ─────────────────────────────────────────────────
  const handleOAuthConnect = useCallback(async () => {
    if (!catalogEntry) return;
    setConnecting(true);
    try {
      const result = await initiateComposioConnection(catalogEntry.composioApp);
      if (result.redirectUrl) {
        globalThis.open(result.redirectUrl, '_blank', 'noopener,noreferrer');
      }
    } catch {
      // silently fail — user can retry
    } finally {
      setConnecting(false);
    }
  }, [catalogEntry]);

  const handleSaveApiKey = useCallback(async () => {
    if (!tool || !apiKey.trim()) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      await updateTool(tool.id, { apiKey: apiKey.trim(), status: 'active' });
      setSaveSuccess(true);
      onToolUpdated?.();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  }, [tool, apiKey, onToolUpdated]);

  if (!tool || !catalogEntry) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: 3, overflow: 'hidden', maxHeight: '90vh' } } }}
    >
      {/* ── Tinted Header ──────────────────────────────────────── */}
      <Box
        sx={{
          px: 3,
          pt: 2.5,
          pb: 2,
          background: `linear-gradient(135deg, ${alpha(subColor, isDark ? 0.12 : 0.08)} 0%, ${alpha(theme.palette.background.paper, 1)} 100%)`,
          borderBottom: '1px solid',
          borderColor: 'divider',
          position: 'relative',
        }}
      >
        <IconButton
          onClick={onClose}
          size="small"
          sx={{ position: 'absolute', top: 12, right: 12, color: 'text.secondary' }}
        >
          <AppIcon name="Close" fallback={CloseIcon} fontSize="small" />
        </IconButton>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
          <ToolIcon tool={catalogEntry || tool} tileSize={40} size={20} subColor={subColor} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }} noWrap>
              {tool.name}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {tool.description}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
          <Chip
            label={catalogEntry.subcategory}
            size="small"
            sx={{
              height: 22,
              fontSize: '0.7rem',
              fontWeight: 700,
              bgcolor: alpha(subColor, isDark ? 0.15 : 0.1),
              color: subColor,
            }}
          />
          {catalogEntry.popular && (
            <Chip
              icon={
                <AppIcon
                  name="Star"
                  fallback={StarIcon}
                  sx={{ fontSize: '12px !important', color: '#F59E0B !important' }}
                />
              }
              label="Popular"
              size="small"
              sx={{
                height: 22,
                fontSize: '0.7rem',
                fontWeight: 700,
                bgcolor: alpha('#F59E0B', 0.1),
                color: '#F59E0B',
              }}
            />
          )}
          <Chip
            label={isConnected ? 'Connected' : 'Not Connected'}
            size="small"
            sx={{
              height: 22,
              fontSize: '0.7rem',
              fontWeight: 700,
              bgcolor: isConnected
                ? alpha(theme.palette.success.main, 0.1)
                : alpha(theme.palette.warning.main, 0.1),
              color: isConnected ? 'success.main' : 'warning.main',
            }}
          />
        </Box>
      </Box>
      {/* ── Tabs ───────────────────────────────────────────────── */}
      <Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{
            minHeight: 40,
            px: 2,
            '& .MuiTab-root': {
              minHeight: 40,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.85rem',
            },
          }}
        >
          <Tab label="Overview" />
          <Tab label="Connect" />
          <Tab label="Documentation" />
        </Tabs>
      </Box>
      {/* ── Content ────────────────────────────────────────────── */}
      <DialogContent sx={{ pt: 2, pb: 3 }}>
        {/* ── Tab 0: Overview ────────────────────────────────── */}
        {activeTab === 0 && (
          <Box>
            <SectionHeader
              icon={<AppIcon name="BoltOutlined" fallback={BoltOutlinedIcon} />}
              title="Available Actions"
              count={catalogEntry.actions.length}
            />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 3 }}>
              {catalogEntry.actions.map((action) => (
                <Paper
                  key={action}
                  elevation={0}
                  sx={{
                    px: 1.5,
                    py: 1,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1,
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                    {formatActionName(action)}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: '0.65rem',
                      color: 'text.disabled',
                      flexShrink: 0,
                    }}
                  >
                    {action}
                  </Typography>
                </Paper>
              ))}
            </Box>

            <SectionHeader
              icon={<AppIcon name="SmartToyOutlined" fallback={SmartToyOutlinedIcon} />}
              title="Assigned Agents"
              count={assignedAgents.length}
            />
            {assignedAgents.length === 0 ? (
              <Typography variant="caption" color="text.secondary">
                No agents are currently assigned this tool. Assign it via AgentHub → Setup Tools.
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {assignedAgents.map((a) => (
                  <Box
                    key={a.role}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      px: 1.5,
                      py: 0.75,
                      borderRadius: 1.5,
                      bgcolor: alpha(theme.palette.primary.main, 0.04),
                    }}
                  >
                    <AppIcon
                      name="SmartToyOutlined"
                      fallback={SmartToyOutlinedIcon}
                      sx={{ fontSize: 14, color: 'text.secondary' }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                      {a.role}
                    </Typography>
                    <Chip
                      label={a.category}
                      size="small"
                      sx={{ ml: 'auto', height: 18, fontSize: '0.6rem', fontWeight: 600 }}
                    />
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        )}

        {/* ── Tab 1: Connect ─────────────────────────────────── */}
        {activeTab === 1 && (
          <Box>
            {/* Connection status */}
            <Paper
              elevation={0}
              sx={{
                p: 2,
                mb: 2.5,
                borderRadius: 2,
                border: '1px solid',
                borderColor: isConnected
                  ? alpha(theme.palette.success.main, 0.3)
                  : alpha(theme.palette.warning.main, 0.3),
                bgcolor: isConnected
                  ? alpha(theme.palette.success.main, isDark ? 0.06 : 0.04)
                  : alpha(theme.palette.warning.main, isDark ? 0.06 : 0.04),
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {isConnected ? (
                  <AppIcon
                    name="CheckCircleOutline"
                    fallback={CheckCircleOutlineIcon}
                    sx={{ fontSize: 20, color: 'success.main' }}
                  />
                ) : (
                  <AppIcon
                    name="WarningAmber"
                    fallback={WarningAmberIcon}
                    sx={{ fontSize: 20, color: 'warning.main' }}
                  />
                )}
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {isConnected ? 'Connected' : 'Not Connected'}
                </Typography>
              </Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 0.5, display: 'block' }}
              >
                {isConnected
                  ? `This tool is active and ready for agent use.${composioConnection?.createdAt ? ` Connected ${new Date(composioConnection.createdAt).toLocaleDateString()}.` : ''}`
                  : 'Connect via OAuth or enter an API key to activate this tool.'}
              </Typography>
            </Paper>

            {/* OAuth section */}
            <SectionHeader
              icon={<AppIcon name="LinkOutlined" fallback={LinkOutlinedIcon} />}
              title="Connect via OAuth"
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Authorize access through Composio's secure OAuth flow. A new window will open to
              complete authentication.
            </Typography>
            <Button
              variant="contained"
              size="small"
              onClick={handleOAuthConnect}
              disabled={connecting}
              startIcon={
                connecting ? (
                  <CircularProgress size={14} />
                ) : (
                  <AppIcon name="Launch" fallback={LaunchIcon} sx={{ fontSize: 14 }} />
                )
              }
              sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, mb: 3 }}
            >
              {connecting ? 'Connecting…' : `Connect ${tool.name}`}
            </Button>

            {/* Divider with "or" */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
              <Divider sx={{ flex: 1 }} />
              <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 600 }}>
                or
              </Typography>
              <Divider sx={{ flex: 1 }} />
            </Box>

            {/* Manual API Key section */}
            <SectionHeader
              icon={<AppIcon name="VpnKeyOutlined" fallback={VpnKeyOutlinedIcon} />}
              title="Manual API Key"
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Paste your API key for direct authentication. Suitable for services like OpenAI,
              SerpAPI, or Brave Search.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
              <TextField
                size="small"
                fullWidth
                placeholder="sk-... or your API key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setShowKey(!showKey)} edge="end">
                          {showKey ? (
                            <AppIcon
                              name="VisibilityOffOutlined"
                              fallback={VisibilityOffOutlinedIcon}
                              sx={{ fontSize: 16 }}
                            />
                          ) : (
                            <AppIcon
                              name="VisibilityOutlined"
                              fallback={VisibilityOutlinedIcon}
                              sx={{ fontSize: 16 }}
                            />
                          )}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
              <Button
                variant="contained"
                size="small"
                onClick={handleSaveApiKey}
                disabled={saving || !apiKey.trim()}
                startIcon={
                  saving ? (
                    <CircularProgress size={14} />
                  ) : (
                    <AppIcon
                      name="SaveOutlined"
                      fallback={SaveOutlinedIcon}
                      sx={{ fontSize: 14 }}
                    />
                  )
                }
                sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, minWidth: 80 }}
              >
                {saveSuccess ? 'Saved' : 'Save'}
              </Button>
            </Box>

            {/* Info box */}
            <Box
              sx={{
                mt: 3,
                px: 1.5,
                py: 1,
                borderRadius: 2,
                bgcolor: alpha(theme.palette.info.main, 0.04),
                border: '1px solid',
                borderColor: alpha(theme.palette.info.main, 0.15),
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1,
              }}
            >
              <AppIcon
                name="InfoOutlined"
                fallback={InfoOutlinedIcon}
                sx={{ fontSize: 16, color: 'info.main', mt: 0.25 }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                OAuth is recommended for most services. Manual API keys are useful for services that
                provide direct key-based access. Credentials are stored securely and never exposed
                in the frontend.
              </Typography>
            </Box>
          </Box>
        )}

        {/* ── Tab 2: Documentation ───────────────────────────── */}
        {activeTab === 2 && (
          <Box>
            {/* Setup Instructions */}
            <SectionHeader
              icon={<AppIcon name="MenuBookOutlined" fallback={MenuBookOutlinedIcon} />}
              title="Setup Instructions"
            />
            <Box
              sx={{
                mb: 3,
                px: 2,
                py: 1.5,
                borderRadius: 2,
                bgcolor: alpha(theme.palette.primary.main, isDark ? 0.04 : 0.02),
                border: '1px solid',
                borderColor: alpha(theme.palette.divider, 0.5),
              }}
            >
              {[
                {
                  step: 1,
                  text: 'Go to the Connect tab and authorize via OAuth or enter your API key.',
                },
                { step: 2, text: 'Assign this tool to your agents in AgentHub → Setup Tools.' },
                {
                  step: 3,
                  text: 'Agents will automatically use this tool during task execution when relevant.',
                },
              ].map(({ step, text }) => (
                <Box key={step} sx={{ display: 'flex', gap: 1.5, py: 0.75 }}>
                  <Box
                    sx={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      bgcolor: alpha(subColor, 0.12),
                      color: subColor,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      mt: 0.1,
                    }}
                  >
                    <Typography variant="caption" sx={{ fontWeight: 800, fontSize: '0.65rem' }}>
                      {step}
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem', lineHeight: 1.5 }}>
                    {text}
                  </Typography>
                </Box>
              ))}
            </Box>

            {/* API Reference */}
            <SectionHeader
              icon={<AppIcon name="BoltOutlined" fallback={BoltOutlinedIcon} />}
              title="API Reference"
              count={catalogEntry.actions.length}
            />
            <Box
              component="table"
              sx={{
                width: '100%',
                borderCollapse: 'collapse',
                mb: 3,
                '& th, & td': {
                  textAlign: 'left',
                  px: 1.5,
                  py: 0.75,
                  fontSize: '0.75rem',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                },
                '& th': {
                  fontWeight: 700,
                  color: 'text.secondary',
                  fontSize: '0.7rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                },
              }}
            >
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Identifier</th>
                </tr>
              </thead>
              <tbody>
                {catalogEntry.actions.map((action) => (
                  <tr key={action}>
                    <td>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.78rem' }}>
                        {formatActionName(action)}
                      </Typography>
                    </td>
                    <td>
                      <Typography
                        variant="caption"
                        sx={{
                          fontFamily: 'monospace',
                          fontSize: '0.68rem',
                          color: 'text.secondary',
                        }}
                      >
                        {action}
                      </Typography>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Box>

            {/* External Resources */}
            <SectionHeader
              icon={<AppIcon name="Launch" fallback={LaunchIcon} />}
              title="External Resources"
            />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Button
                variant="outlined"
                size="small"
                href={`https://docs.composio.dev/apps/${catalogEntry.composioApp}`}
                target="_blank"
                rel="noopener noreferrer"
                endIcon={
                  <AppIcon
                    name="Launch"
                    fallback={LaunchIcon}
                    sx={{ fontSize: '14px !important' }}
                  />
                }
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  borderRadius: 2,
                  justifyContent: 'flex-start',
                }}
              >
                {tool.name} Documentation on Composio
              </Button>
              <Button
                variant="outlined"
                size="small"
                href="https://docs.composio.dev"
                target="_blank"
                rel="noopener noreferrer"
                endIcon={
                  <AppIcon
                    name="Launch"
                    fallback={LaunchIcon}
                    sx={{ fontSize: '14px !important' }}
                  />
                }
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  borderRadius: 2,
                  justifyContent: 'flex-start',
                }}
              >
                Composio Platform Documentation
              </Button>
            </Box>

            {/* Provider badge */}
            <Box
              sx={{
                mt: 3,
                pt: 2,
                borderTop: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.75,
              }}
            >
              <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 600 }}>
                Powered by
              </Typography>
              <Typography
                component="a"
                href="https://composio.dev"
                target="_blank"
                rel="noopener noreferrer"
                variant="caption"
                sx={{
                  fontWeight: 800,
                  color: subColor,
                  textDecoration: 'none',
                  '&:hover': { textDecoration: 'underline' },
                }}
              >
                Composio
              </Typography>
            </Box>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
