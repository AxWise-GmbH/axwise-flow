import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';

// Mock the context
const mockContext = {
  isOpen: false,
  isMinimized: false,
  agentRole: 'CTO',
  teamName: 'Founder',
  jobId: 'job-1',
  approvalMode: 'auto',
  rejectedTools: [],
  toolRequirements: [
    {
      id: 'tool-web-search',
      name: 'Web Search',
      connectionType: 'api',
      configured: true,
      credentials: [],
      riskLevel: 'low',
    },
    {
      id: 'tool-github',
      name: 'GitHub',
      connectionType: 'api',
      configured: false,
      credentials: [
        {
          key: 'GITHUB_TOKEN',
          label: 'GitHub Token',
          helpUrl: 'https://github.com/settings/tokens',
        },
      ],
      riskLevel: 'low',
    },
    {
      id: 'mcp-github',
      name: 'GitHub MCP',
      connectionType: 'composio',
      composioApp: 'github',
      configured: false,
      credentials: [],
      riskLevel: 'low',
    },
  ],
  showToolRequirements: vi.fn(),
  dismissToolRequirements: vi.fn(),
  toggleMinimize: vi.fn(),
  markToolConfigured: vi.fn(),
  rejectToolConfiguration: vi.fn(),
};

vi.mock('../../context/ToolRequirementContext', () => ({
  useToolRequirements: () => mockContext,
}));

vi.mock('../../services/toolService', () => ({
  updateTool: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../services/composioService', () => ({
  initiateComposioConnection: vi
    .fn()
    .mockResolvedValue({ redirectUrl: 'https://oauth.example.com' }),
}));

vi.mock('../../services/auditLogBackend', () => ({
  logAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../context/NotificationContext', () => ({
  useNotifications: () => ({ pushNotification: vi.fn() }),
}));

import ToolRequirementPopup from './ToolRequirementPopup';

const theme = createTheme();

function renderPopup() {
  return render(
    <ThemeProvider theme={theme}>
      <ToolRequirementPopup />
    </ThemeProvider>
  );
}

describe('ToolRequirementPopup', () => {
  beforeEach(() => {
    // Reset to defaults
    mockContext.isOpen = false;
    mockContext.isMinimized = false;
    mockContext.approvalMode = 'auto';
    mockContext.rejectedTools = [];
    mockContext.toolRequirements = [
      {
        id: 'tool-web-search',
        name: 'Web Search',
        connectionType: 'api',
        configured: true,
        credentials: [],
        riskLevel: 'low',
      },
      {
        id: 'tool-github',
        name: 'GitHub',
        connectionType: 'api',
        configured: false,
        credentials: [
          {
            key: 'GITHUB_TOKEN',
            label: 'GitHub Token',
            helpUrl: 'https://github.com/settings/tokens',
          },
        ],
        riskLevel: 'low',
      },
      {
        id: 'mcp-github',
        name: 'GitHub MCP',
        connectionType: 'composio',
        composioApp: 'github',
        configured: false,
        credentials: [],
        riskLevel: 'low',
      },
    ];
  });

  it('does not render when isOpen is false', () => {
    mockContext.isOpen = false;
    renderPopup();
    expect(screen.queryByText('Tools Required')).toBeNull();
  });

  it('renders tool list when isOpen is true', () => {
    mockContext.isOpen = true;
    renderPopup();
    expect(screen.getByText('Tools Required')).toBeTruthy();
    expect(screen.getByText('Web Search')).toBeTruthy();
    expect(screen.getByText('GitHub')).toBeTruthy();
    expect(screen.getByText('GitHub MCP')).toBeTruthy();
  });

  it('shows correct status labels', () => {
    mockContext.isOpen = true;
    renderPopup();
    expect(screen.getByText('Configured')).toBeTruthy();
    expect(screen.getByText('Needs API key')).toBeTruthy();
    expect(screen.getByText('Needs OAuth connection')).toBeTruthy();
  });

  it('shows progress counter', () => {
    mockContext.isOpen = true;
    renderPopup();
    expect(screen.getByText('1/3')).toBeTruthy();
  });

  it('shows agent role and team name', () => {
    mockContext.isOpen = true;
    renderPopup();
    expect(screen.getByText(/CTO/)).toBeTruthy();
    expect(screen.getByText(/Founder/)).toBeTruthy();
  });

  it('renders minimized badge when isMinimized', () => {
    mockContext.isOpen = true;
    mockContext.isMinimized = true;
    renderPopup();
    expect(screen.getByText('2 tools needed')).toBeTruthy();
  });

  it('shows Setup button for unconfigured API tools in auto mode', () => {
    mockContext.isOpen = true;
    mockContext.approvalMode = 'auto';
    renderPopup();
    expect(screen.getByText('Setup')).toBeTruthy();
  });

  it('shows Connect button for composio tools in auto mode', () => {
    mockContext.isOpen = true;
    mockContext.approvalMode = 'auto';
    renderPopup();
    expect(screen.getByText('Connect')).toBeTruthy();
  });

  // ── Consilium governance tests ──────────────────────────────

  it('shows Auto mode badge when approvalMode is auto', () => {
    mockContext.isOpen = true;
    mockContext.approvalMode = 'auto';
    renderPopup();
    expect(screen.getAllByText('Auto').length).toBeGreaterThanOrEqual(1);
  });

  it('shows Manual mode badge when approvalMode is manual', () => {
    mockContext.isOpen = true;
    mockContext.approvalMode = 'manual';
    renderPopup();
    expect(screen.getByText('Manual')).toBeTruthy();
  });

  it('shows Approve button for composio tools in manual mode', () => {
    mockContext.isOpen = true;
    mockContext.approvalMode = 'manual';
    renderPopup();
    expect(screen.getByText('Approve')).toBeTruthy();
  });

  it('does not show Setup/Connect in manual mode', () => {
    mockContext.isOpen = true;
    mockContext.approvalMode = 'manual';
    renderPopup();
    expect(screen.queryByText('Setup')).toBeNull();
    expect(screen.queryByText('Connect')).toBeNull();
  });

  it('shows Rejected chip for rejected tools', () => {
    mockContext.isOpen = true;
    mockContext.approvalMode = 'manual';
    mockContext.rejectedTools = ['tool-github'];
    renderPopup();
    expect(screen.getAllByText('Rejected').length).toBeGreaterThanOrEqual(1);
  });

  it('shows risk level badges when riskLevel is set', () => {
    mockContext.isOpen = true;
    mockContext.toolRequirements = [
      {
        id: 'tool-high',
        name: 'High Risk Tool',
        connectionType: 'api',
        configured: false,
        credentials: [],
        riskLevel: 'high',
      },
      {
        id: 'tool-med',
        name: 'Medium Tool',
        connectionType: 'api',
        configured: false,
        credentials: [],
        riskLevel: 'medium',
      },
    ];
    renderPopup();
    expect(screen.getByText('High Risk')).toBeTruthy();
    expect(screen.getByText('Medium')).toBeTruthy();
  });

  // ── Auto-provision tests ─────────────────────────────────────

  it('disables auto-provisioning and directs the user to add the key manually', () => {
    mockContext.isOpen = true;
    mockContext.approvalMode = 'auto';
    renderPopup();
    const autoProvision = screen.getByRole('button', {
      name: /auto-provisioning is temporarily unavailable; add the key manually/i,
    });
    expect(autoProvision).toBeDisabled();
    expect(autoProvision).toHaveTextContent('Auto unavailable');
    expect(screen.getByRole('button', { name: 'Setup' })).toBeEnabled();
  });

  it('does not show Auto button for configured tools', () => {
    mockContext.isOpen = true;
    mockContext.approvalMode = 'auto';
    mockContext.toolRequirements = [
      {
        id: 'tool-web-search',
        name: 'Web Search',
        connectionType: 'api',
        configured: true,
        credentials: [{ key: 'KEY', helpUrl: 'https://x.com' }],
        riskLevel: 'low',
      },
    ];
    renderPopup();
    expect(screen.queryByTestId('auto-provision-tool-web-search')).toBeNull();
  });

  it('does not show Auto button for internal tools', () => {
    mockContext.isOpen = true;
    mockContext.approvalMode = 'auto';
    mockContext.toolRequirements = [
      {
        id: 'tool-temp',
        name: 'Temp Tool',
        connectionType: 'internal',
        configured: false,
        credentials: [],
        riskLevel: 'low',
      },
    ];
    renderPopup();
    expect(screen.queryByTestId('auto-provision-tool-temp')).toBeNull();
  });
});
