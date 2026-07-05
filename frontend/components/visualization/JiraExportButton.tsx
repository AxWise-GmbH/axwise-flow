'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, ExternalLink } from 'lucide-react';
import { useToast } from '@/components/providers/toast-provider';

interface JiraExportButtonProps {
  analysisId: string;
  disabled?: boolean;
}

interface JiraCredentials {
  jira_url: string;
  email: string;
  api_token: string;
  project_key: string;
}

interface JiraExportRequest {
  result_id: number;
  credentials: JiraCredentials;
  epic_name: string;
  include_technical: boolean;
  include_acceptance_criteria: boolean;
  update_existing: boolean;
}

export function JiraExportButton({ analysisId, disabled = false }: JiraExportButtonProps) {
  const { showToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  // Form state
  const [jiraUrl, setJiraUrl] = useState('');
  const [email, setEmail] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [projectKey, setProjectKey] = useState('');
  const [epicName, setEpicName] = useState('Customer Research PRD');
  const [includeTechnical, setIncludeTechnical] = useState(true);
  const [includeAcceptanceCriteria, setIncludeAcceptanceCriteria] = useState(true);
  const [updateExisting, setUpdateExisting] = useState(false);


  const handleTestConnection = async () => {
    if (!jiraUrl || !email || !apiToken || !projectKey) {
      showToast('Please fill in all Jira credentials', { variant: 'error' });
      return;
    }

    setIsTesting(true);

    try {
      const response = await fetch('/api/export/jira/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          credentials: {
            jira_url: jiraUrl,
            email: email,
            api_token: apiToken,
            project_key: projectKey,
          },
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        showToast(`✅ Connection successful! Project: ${result.project_name}`, { variant: 'default' });
      } else {
        showToast(`❌ Connection failed: ${result.message || 'Unknown error'}`, { variant: 'error' });
      }
    } catch (error) {
      console.error('Error testing Jira connection:', error);
      showToast('Failed to test connection. Please check your credentials.', { variant: 'error' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleExport = async () => {
    if (!jiraUrl || !email || !apiToken || !projectKey || !epicName) {
      showToast('Please fill in all required fields', { variant: 'error' });
      return;
    }

    setIsExporting(true);

    try {
      const exportRequest: JiraExportRequest = {
        result_id: parseInt(analysisId),
        credentials: {
          jira_url: jiraUrl,
          email: email,
          api_token: apiToken,
          project_key: projectKey,
        },
        epic_name: epicName,
        include_technical: includeTechnical,
        include_acceptance_criteria: includeAcceptanceCriteria,
        update_existing: updateExisting,
      };

      const response = await fetch('/api/export/jira', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(exportRequest),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        showToast(
          `✅ Successfully exported to Jira! ${result.message} (1 epic, ${result.stories_created} stories, ${result.tasks_created} tasks)`,
          { variant: 'default' }
        );

        // Open epic in new tab if URL is available
        if (result.epic?.url) {
          window.open(result.epic.url, '_blank');
        }

        setIsOpen(false);
      } else {
        const errorMsg = result.message || result.errors?.join(', ') || 'Unknown error';
        showToast(`❌ Export failed: ${errorMsg}`, { variant: 'error' });
      }
    } catch (error) {
      console.error('Error exporting to Jira:', error);
      showToast('Failed to export to Jira. Please try again.', { variant: 'error' });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        disabled={disabled}
        className="flex items-center"
      >
        <ExternalLink className="mr-2 h-4 w-4" />
        Export to Jira
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Export PRD to Jira</DialogTitle>
            <DialogDescription>
              Export your Product Requirements Document to Jira as an Epic with Stories and Tasks
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Jira URL */}
            <div className="space-y-2">
              <Label htmlFor="jira-url">Jira URL *</Label>
              <Input
                id="jira-url"
                placeholder="https://your-domain.atlassian.net"
                value={jiraUrl}
                onChange={(e) => setJiraUrl(e.target.value)}
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {/* API Token */}
            <div className="space-y-2">
              <Label htmlFor="api-token">API Token *</Label>
              <Input
                id="api-token"
                type="password"
                placeholder="Your Jira API token"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Generate an API token at:{' '}
                <a
                  href="https://id.atlassian.com/manage-profile/security/api-tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Atlassian Account Settings
                </a>
              </p>
            </div>

            {/* Project Key */}
            <div className="space-y-2">
              <Label htmlFor="project-key">Project Key *</Label>
              <Input
                id="project-key"
                placeholder="PROJ"
                value={projectKey}
                onChange={(e) => setProjectKey(e.target.value.toUpperCase())}
              />
            </div>

            {/* Test Connection Button */}
            <Button
              variant="secondary"
              onClick={handleTestConnection}
              disabled={isTesting || !jiraUrl || !email || !apiToken || !projectKey}
              className="w-full"
            >
              {isTesting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing Connection...
                </>
              ) : (
                'Test Connection'
              )}
            </Button>

            <div className="border-t pt-4">
              {/* Epic Name */}
              <div className="space-y-2">
                <Label htmlFor="epic-name">Epic Name *</Label>
                <Input
                  id="epic-name"
                  placeholder="Customer Research PRD"
                  value={epicName}
                  onChange={(e) => setEpicName(e.target.value)}
                />
              </div>

              {/* Options */}
              <div className="space-y-3 mt-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="include-technical" className="text-sm font-normal cursor-pointer">
                    Include Technical Requirements as Tasks
                  </Label>
                  <Switch
                    id="include-technical"
                    checked={includeTechnical}
                    onCheckedChange={setIncludeTechnical}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="include-acceptance" className="text-sm font-normal cursor-pointer">
                    Include Acceptance Criteria in Stories
                  </Label>
                  <Switch
                    id="include-acceptance"
                    checked={includeAcceptanceCriteria}
                    onCheckedChange={setIncludeAcceptanceCriteria}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="update-existing" className="text-sm font-normal cursor-pointer">
                    Update Existing Issues (match by summary)
                  </Label>
                  <Switch
                    id="update-existing"
                    checked={updateExisting}
                    onCheckedChange={setUpdateExisting}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isExporting}>
              Cancel
            </Button>
            <Button onClick={handleExport} disabled={isExporting || !epicName}>
              {isExporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                'Export to Jira'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default JiraExportButton;

