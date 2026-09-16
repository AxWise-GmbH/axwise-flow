import { describe, it, expect } from 'vitest';
import { introspectOpenApiDoc, introspectOpenApiJson } from '../introspect-openapi.js';

const petStore = {
  openapi: '3.0.0',
  info: { title: 'Pet Store', version: '1.0' },
  paths: {
    '/pets': {
      get: {
        operationId: 'listPets',
        summary: 'List pets',
        tags: ['Pets'],
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer' }, description: 'Max results' },
        ],
      },
      post: {
        operationId: 'createPet',
        summary: 'Create pet',
        tags: ['Pets'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', title: 'Name' },
                  tag: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    '/pets/{petId}': {
      parameters: [
        { name: 'petId', in: 'path', required: true, schema: { type: 'string' } },
      ],
      get: {
        operationId: 'getPet',
        summary: 'Get pet',
        tags: ['Pets'],
      },
    },
    '/owners/{ownerId}/pets/{petId}': {
      get: {
        operationId: 'getOwnersPet',
        summary: 'Get an owner pet',
        tags: ['Owners'],
        parameters: [
          { name: 'ownerId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'petId', in: 'path', required: true, schema: { type: 'string' } },
        ],
      },
    },
  },
};

describe('introspectOpenApiDoc', () => {
  const endpoints = introspectOpenApiDoc(petStore);

  it('returns one endpoint per method per path', () => {
    expect(endpoints).toHaveLength(4);
  });

  it('uses operationId as the id', () => {
    expect(endpoints.map((e) => e.id)).toEqual(
      expect.arrayContaining(['listPets', 'createPet', 'getPet', 'getOwnersPet']),
    );
  });

  it('categorizes by the first tag, falls back to General', () => {
    const cats = new Set(endpoints.map((e) => e.category));
    expect(cats.has('Pets')).toBe(true);
    expect(cats.has('Owners')).toBe(true);
  });

  it('marks GET as read and POST/PUT/DELETE as write', () => {
    const get = endpoints.find((e) => e.id === 'listPets');
    const post = endpoints.find((e) => e.id === 'createPet');
    expect(get.verb).toBe('read');
    expect(post.verb).toBe('write');
  });

  it('collects path params from path-level + op-level entries and marks them required', () => {
    const getPet = endpoints.find((e) => e.id === 'getPet');
    expect(getPet.inputSchema.required).toContain('petId');
    expect(getPet.paramLocations.petId).toBe('path');
  });

  it('captures request body properties into inputSchema with body location', () => {
    const create = endpoints.find((e) => e.id === 'createPet');
    expect(create.inputSchema.properties.name).toBeDefined();
    expect(create.paramLocations.name).toBe('body');
    expect(create.inputSchema.required).toContain('name');
  });

  it('handles multiple path params on one operation', () => {
    const nested = endpoints.find((e) => e.id === 'getOwnersPet');
    expect(nested.inputSchema.required).toEqual(expect.arrayContaining(['ownerId', 'petId']));
  });
});

describe('introspectOpenApiJson', () => {
  it('parses JSON text and delegates', () => {
    const eps = introspectOpenApiJson(JSON.stringify(petStore));
    expect(eps.length).toBe(4);
  });

  it('rejects non-OpenAPI JSON', () => {
    expect(() => introspectOpenApiJson('{"foo":"bar"}')).toThrow(/does not look like OpenAPI/);
  });

  it('rejects invalid JSON', () => {
    expect(() => introspectOpenApiJson('{nope')).toThrow(/Invalid JSON/);
  });
});
