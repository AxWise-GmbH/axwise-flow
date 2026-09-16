import { describe, expect, it } from 'vitest';
import { parseVoiceCommands } from './voiceCommandParser';

describe('voiceCommandParser', () => {
  // ── Create project ────────────────────────────────────────────────────
  describe('create project', () => {
    it('parses "create a project called Alpha"', () => {
      const actions = parseVoiceCommands('create a project called Alpha');
      expect(actions.some((a) => a.type === 'create_project' && a.name === 'Alpha')).toBe(true);
    });

    it('parses "start a new project called Alpha"', () => {
      const actions = parseVoiceCommands('start a new project called Alpha');
      expect(actions.some((a) => a.type === 'create_project')).toBe(true);
    });

    it('parses "build project for Germany Campaign"', () => {
      const actions = parseVoiceCommands('build project for Germany Campaign');
      expect(actions.some((a) => a.type === 'create_project')).toBe(true);
    });

    it('parses "set up a new project"', () => {
      const actions = parseVoiceCommands('set up a new project');
      expect(actions.some((a) => a.type === 'create_project')).toBe(true);
    });

    it('parses project with workflow hint', () => {
      const actions = parseVoiceCommands('create project Alpha with onboarding workflow');
      const proj = actions.find((a) => a.type === 'create_project');
      expect(proj).toBeTruthy();
      expect(proj.workflowHint).toBeTruthy();
    });
  });

  // ── Create partner ────────────────────────────────────────────────────
  describe('create partner', () => {
    it('parses "register new partner named Nova Media"', () => {
      const actions = parseVoiceCommands('register new partner named Nova Media');
      expect(actions.some((a) => a.type === 'create_partner')).toBe(true);
    });

    it('parses "add partner X with group Webmaster agreement CPL"', () => {
      const actions = parseVoiceCommands('add partner TestCo group Webmaster agreement CPL');
      const p = actions.find((a) => a.type === 'create_partner');
      expect(p).toBeTruthy();
      expect(p.group).toBe('Webmaster');
      expect(p.agreement).toBe('CPL');
    });

    it('parses "onboard a new partner"', () => {
      const actions = parseVoiceCommands('onboard a new partner called Acme');
      expect(actions.some((a) => a.type === 'create_partner')).toBe(true);
    });
  });

  // ── Create task ───────────────────────────────────────────────────────
  describe('create task', () => {
    it('parses "make a new task prepare campaign report"', () => {
      const actions = parseVoiceCommands('make a new task prepare campaign report');
      expect(actions.some((a) => a.type === 'create_task')).toBe(true);
    });

    it('parses "add task review partner contract"', () => {
      const actions = parseVoiceCommands('add task review partner contract');
      const t = actions.find((a) => a.type === 'create_task');
      expect(t).toBeTruthy();
      expect(t.title.toLowerCase()).toContain('review');
    });

    it('parses "assign a new task for onboarding"', () => {
      const actions = parseVoiceCommands('assign a new task for onboarding');
      expect(actions.some((a) => a.type === 'create_task')).toBe(true);
    });
  });

  // ── Create workflow ───────────────────────────────────────────────────
  describe('create workflow', () => {
    it('parses "build a workflow for lead qualification"', () => {
      const actions = parseVoiceCommands('build a workflow for lead qualification');
      expect(actions.some((a) => a.type === 'create_workflow')).toBe(true);
    });

    it('parses "create new workflow"', () => {
      const actions = parseVoiceCommands('create new workflow');
      expect(actions.some((a) => a.type === 'create_workflow')).toBe(true);
    });

    it('parses "set up a workflow called Partner Onboarding"', () => {
      const actions = parseVoiceCommands('set up a workflow called Partner Onboarding');
      expect(actions.some((a) => a.type === 'create_workflow')).toBe(true);
    });
  });

  // ── Assign / link ─────────────────────────────────────────────────────
  describe('assign and link', () => {
    it('parses "assign partner Nova to project Alpha"', () => {
      const actions = parseVoiceCommands('assign partner Nova to project Alpha');
      const a = actions.find((x) => x.type === 'assign_partner_to_project');
      expect(a).toBeTruthy();
      expect(a.partnerHint).toContain('Nova');
      expect(a.projectHint).toContain('Alpha');
    });

    it('parses "link workflow Onboarding to project Germany"', () => {
      const actions = parseVoiceCommands('link workflow Onboarding to project Germany');
      const a = actions.find((x) => x.type === 'link_workflow_to_project');
      expect(a).toBeTruthy();
    });

    it('parses "connect partner X for project Y"', () => {
      const actions = parseVoiceCommands('connect partner X for project Y');
      expect(actions.some((a) => a.type === 'assign_partner_to_project')).toBe(true);
    });
  });

  // ── List / show / count ───────────────────────────────────────────────
  describe('list and count', () => {
    it('parses "show me all partners"', () => {
      const actions = parseVoiceCommands('show me all partners');
      expect(actions.some((a) => a.type === 'navigate' && a.path === '/partners')).toBe(true);
    });

    it('parses "list my projects"', () => {
      const actions = parseVoiceCommands('list my projects');
      expect(actions.some((a) => a.type === 'navigate')).toBe(true);
    });

    it('parses "how many tasks do I have"', () => {
      const actions = parseVoiceCommands('how many tasks do I have');
      expect(actions.some((a) => a.type === 'count_entities')).toBe(true);
    });

    it('parses "show summary"', () => {
      const actions = parseVoiceCommands('show summary');
      expect(actions.some((a) => a.type === 'show_summary')).toBe(true);
    });
  });

  // ── Navigation ────────────────────────────────────────────────────────
  describe('navigation', () => {
    it('navigates to dashboard', () => {
      const actions = parseVoiceCommands('go to dashboard');
      expect(actions.some((a) => a.type === 'navigate' && a.path === '/dashboard')).toBe(true);
    });

    it('navigates to settings', () => {
      const actions = parseVoiceCommands('open settings');
      expect(actions.some((a) => a.type === 'navigate' && a.path === '/settings')).toBe(true);
    });

    it('navigates to audit log', () => {
      const actions = parseVoiceCommands('go to audit log');
      expect(actions.some((a) => a.type === 'navigate' && a.path === '/audit-log')).toBe(true);
    });
  });

  // ── Confirmation ──────────────────────────────────────────────────────
  describe('confirmation', () => {
    it('recognizes "yes" as confirmation', () => {
      const actions = parseVoiceCommands('yes');
      expect(actions.some((a) => a.type === 'confirm_yes')).toBe(true);
    });

    it('recognizes "go ahead" as confirmation', () => {
      const actions = parseVoiceCommands('go ahead');
      expect(actions.some((a) => a.type === 'confirm_yes')).toBe(true);
    });

    it('recognizes "no" as cancellation', () => {
      const actions = parseVoiceCommands('no');
      expect(actions.some((a) => a.type === 'confirm_no')).toBe(true);
    });

    it('recognizes "cancel" as cancellation', () => {
      const actions = parseVoiceCommands('cancel');
      expect(actions.some((a) => a.type === 'confirm_no')).toBe(true);
    });
  });

  // ── Status / update / delete ──────────────────────────────────────────
  describe('status, update, delete', () => {
    it('parses "what is the status of project Alpha"', () => {
      const actions = parseVoiceCommands('what is the status of project Alpha');
      expect(actions.some((a) => a.type === 'status_query')).toBe(true);
    });

    it('parses "update partner name"', () => {
      const actions = parseVoiceCommands('update partner name');
      expect(actions.some((a) => a.type === 'update_entity')).toBe(true);
    });

    it('parses "delete task"', () => {
      const actions = parseVoiceCommands('delete task');
      expect(actions.some((a) => a.type === 'delete_entity')).toBe(true);
    });

    it('parses "archive workflow"', () => {
      const actions = parseVoiceCommands('archive workflow');
      expect(actions.some((a) => a.type === 'delete_entity')).toBe(true);
    });
  });

  // ── Multi-command ─────────────────────────────────────────────────────
  describe('multi-command', () => {
    it('handles "create project Alpha. Create task for it"', () => {
      const actions = parseVoiceCommands('create project Alpha. Create task for onboarding');
      expect(actions.some((a) => a.type === 'create_project')).toBe(true);
      expect(actions.some((a) => a.type === 'create_task')).toBe(true);
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────
  describe('edge cases', () => {
    it('returns empty for empty input', () => {
      expect(parseVoiceCommands('')).toEqual([]);
    });

    it('returns empty for null input', () => {
      expect(parseVoiceCommands(null)).toEqual([]);
    });
  });
});
