import { describe, it, expect } from 'vitest';
import {
  HOME_TILES,
  SLASH_COMMANDS,
  SLASH_CATEGORIES,
  filterSlashCommands,
  groupCommands,
} from './capabilities.js';

describe('capabilities catalog', () => {
  it('exposes the expanded home tiles including the copilot additions', () => {
    expect(HOME_TILES.length).toBeGreaterThanOrEqual(6);
    for (const id of ['insights', 'pulse', 'loops', 'activity']) {
      expect(HOME_TILES.some((t) => t.id === id)).toBe(true);
    }
  });

  it('includes the Let’s Talk tile that switches to talk mode', () => {
    const talk = HOME_TILES.find((t) => t.id === 'talk');
    expect(talk).toBeDefined();
    expect(talk.mode).toBe('talk');
  });

  it('exposes the new copilot slash-command categories', () => {
    for (const cat of ['Pulse', 'Loops', 'Insights', 'Activity']) {
      expect(SLASH_CATEGORIES).toContain(cat);
    }
  });

  it('every tile has a dispatchable text payload', () => {
    for (const tile of HOME_TILES) {
      expect(tile.text).toBeTruthy();
      expect(typeof tile.text).toBe('string');
    }
  });

  it('every slash command has id, label, category and template', () => {
    for (const cmd of SLASH_COMMANDS) {
      expect(cmd.id).toBeTruthy();
      expect(cmd.label).toBeTruthy();
      expect(cmd.category).toBeTruthy();
      expect(cmd.template).toBeTruthy();
    }
  });

  it('derives unique categories', () => {
    expect(new Set(SLASH_CATEGORIES).size).toBe(SLASH_CATEGORIES.length);
    expect(SLASH_CATEGORIES).toContain('Goals');
    expect(SLASH_CATEGORIES).toContain('Reports');
  });

  it('filterSlashCommands returns all commands for empty query', () => {
    expect(filterSlashCommands('').length).toBe(SLASH_COMMANDS.length);
    expect(filterSlashCommands('  ').length).toBe(SLASH_COMMANDS.length);
  });

  it('filterSlashCommands matches against id, label, and category', () => {
    const goalMatches = filterSlashCommands('goal');
    expect(goalMatches.some((c) => c.id === 'goal.create')).toBe(true);
    expect(goalMatches.every((c) => /goal/i.test(`${c.id} ${c.label} ${c.category}`))).toBe(true);
  });

  it('groupCommands returns a map keyed by category', () => {
    const grouped = groupCommands(SLASH_COMMANDS);
    expect(Object.keys(grouped).sort()).toEqual([...SLASH_CATEGORIES].sort());
    for (const [cat, cmds] of Object.entries(grouped)) {
      expect(cmds.every((c) => c.category === cat)).toBe(true);
    }
  });
});
