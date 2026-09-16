import { describe, expect, it } from 'vitest';
import { mergeNativeEditorNodes } from './native-editor-catalog.js';

describe('actual pinned native canvas descriptions', () => {
  it('includes genuine branch, array and connector forms without granting runtime authority', () => {
    const nodes = mergeNativeEditorNodes([]);
    expect(new Set(nodes.map((node) => node.name)).size).toBe(32);
    expect(nodes.find((node) => node.name === 'n8n-nodes-base.errorTrigger')).toMatchObject({
      displayName: 'Error Trigger',
      version: 1,
      inputs: [],
      outputs: ['main'],
      maxNodes: 1,
    });
    expect(
      nodes.find((node) => node.name === 'CUSTOM.boundedHttp').properties.map((field) => field.name)
    ).toEqual(['url', 'method', 'body']);
    const branch = nodes.find(
      (node) => node.name === 'n8n-nodes-base.if' && node.defaultVersion === 2.3
    );
    expect(branch.displayName).toBe('If');
    expect(branch.defaults).toHaveProperty('name');
    expect(branch.properties.some((property) => property.name === 'conditions')).toBe(true);
    expect(branch.outputs).toEqual(['main', 'main']);
    expect(nodes.some((node) => node.name === 'n8n-nodes-base.splitOut')).toBe(true);
    expect(nodes.some((node) => node.name === 'n8n-nodes-base.httpRequest')).toBe(true);
  });
  it('retains real upstream metadata and does not mutate or duplicate covered versions', () => {
    const upstream = mergeNativeEditorNodes([]);
    const original = structuredClone(upstream);
    expect(mergeNativeEditorNodes(upstream)).toEqual(original);
    expect(upstream).toEqual(original);
    expect(() => mergeNativeEditorNodes({ data: [] })).toThrow('shape_invalid');
  });
});
