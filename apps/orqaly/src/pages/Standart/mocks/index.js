/**
 * [module: design-system]
 *
 * The /standart mockups.
 *
 * FIFTEEN DRAWINGS, FIFTEEN SILHOUETTES. The onboarding mock set states the
 * same rule for the same reason: a page whose pictures all read as the same
 * rectangle teaches nothing, and the eye stops looking at the third one. Adding
 * a sixteenth means finding a shape none of these already occupies.
 *
 *   MockBoardVote        rows with a verdict, one struck through
 *   MockCreditCap        a meter against a ceiling, over a ledger
 *   MockToolPermissions  toggle rows in two groups
 *   MockProviderChain    chips joined by arrows, one failing over
 *   MockOrgTree          an indented tree with connector rules
 *   MockWorkflowChain    nodes joined by drawn paths, and a branch
 *   MockKnowledgeDiff    a split before/after pane
 *   MockSkillForge       two pass/fail columns resolving to a verdict box
 *   MockFirstRun         ticked checkbox rows
 *   MockAuditRows        a dense timestamped log
 *   MockSupervisor       rules mapped to outcomes across a gap
 *   MockRoomThread       a phone frame with a thread
 *   MockMonoTable        a banded table beside a nav rail
 *   MockTeamRoster       a flat roster with one member opened
 *   MockTeamBuild        a browser window with a prompt typing itself
 *
 * `MOCK_BY_KIND` lets the copy module name a drawing with a plain string, so
 * standartCopy.js can stay data-only. That matters beyond tidiness:
 * react-refresh/only-export-components warns on a module that exports both, and
 * a copy file that imported components could not be read as prose.
 */
export { default as MockBoardVote } from './MockBoardVote';
export { default as MockCreditCap } from './MockCreditCap';
export { default as MockToolPermissions } from './MockToolPermissions';
export { default as MockProviderChain } from './MockProviderChain';
export { default as MockOrgTree } from './MockOrgTree';
export { default as MockWorkflowChain } from './MockWorkflowChain';
export { default as MockKnowledgeDiff } from './MockKnowledgeDiff';
export { default as MockSkillForge } from './MockSkillForge';
export { default as MockFirstRun } from './MockFirstRun';
export { default as MockAuditRows } from './MockAuditRows';
export { default as MockSupervisor } from './MockSupervisor';
export { default as MockRoomThread } from './MockRoomThread';
export { default as MockMonoTable } from './MockMonoTable';
export { default as MockTeamRoster } from './MockTeamRoster';
export { default as MockTeamBuild } from './MockTeamBuild';

import MockBoardVote from './MockBoardVote';
import MockCreditCap from './MockCreditCap';
import MockToolPermissions from './MockToolPermissions';
import MockProviderChain from './MockProviderChain';
import MockOrgTree from './MockOrgTree';
import MockWorkflowChain from './MockWorkflowChain';
import MockKnowledgeDiff from './MockKnowledgeDiff';
import MockSkillForge from './MockSkillForge';
import MockFirstRun from './MockFirstRun';
import MockAuditRows from './MockAuditRows';
import MockSupervisor from './MockSupervisor';
import MockRoomThread from './MockRoomThread';
import MockMonoTable from './MockMonoTable';
import MockTeamRoster from './MockTeamRoster';
import MockTeamBuild from './MockTeamBuild';

/**
 * Name to drawing.
 *
 * `goalRun` is the welcome deck's own mock, reused rather than redrawn. It is
 * zero-prop and takes its colours from the theme, so inside this page's mono
 * island it renders near-black without any adaptation - and it is already the
 * best picture of the pipeline in the codebase.
 */
export const MOCK_BY_KIND = {
  boardVote: MockBoardVote,
  creditCap: MockCreditCap,
  toolPermissions: MockToolPermissions,
  providerChain: MockProviderChain,
  orgTree: MockOrgTree,
  workflowChain: MockWorkflowChain,
  knowledgeDiff: MockKnowledgeDiff,
  skillForge: MockSkillForge,
  firstRun: MockFirstRun,
  auditRows: MockAuditRows,
  supervisor: MockSupervisor,
  roomThread: MockRoomThread,
  monoTable: MockMonoTable,
  teamRoster: MockTeamRoster,
  teamBuild: MockTeamBuild,
};
