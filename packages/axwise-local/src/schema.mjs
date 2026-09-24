/** Provider-facing schemas are generation hints; Python remains authoritative. */
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = () => { throw new Error('AXWISE_SCHEMA_INVALID'); };
const MAX_BYTES = 256_000;

/** Expand bounded local JSON pointers without mutating or weakening the schema. */
export function inlineLocalRefs(schema) {
  if (!object(schema) || Buffer.byteLength(JSON.stringify(schema)) > MAX_BYTES) invalid();
  let nodes = 0;
  const walk = (value, refs = [], depth = 0) => {
    if (++nodes > 20_000 || depth > 40) invalid();
    if (Array.isArray(value)) return value.map((item) => walk(item, refs, depth + 1));
    if (!object(value)) return value;
    if (Object.hasOwn(value, '$ref')) {
      const pointer = value.$ref;
      if (typeof pointer !== 'string' || !pointer.startsWith('#/') || refs.includes(pointer)) invalid();
      let target = schema;
      for (const encoded of pointer.slice(2).split('/')) {
        if (/~(?![01])/u.test(encoded)) invalid();
        const part = encoded.replaceAll('~1', '/').replaceAll('~0', '~');
        if (!object(target) || !Object.hasOwn(target, part)) invalid();
        target = target[part];
      }
      if (!object(target)) invalid();
      const expanded = walk(target, [...refs, pointer], depth + 1);
      const siblings = Object.fromEntries(Object.entries(value).filter(([key]) => key !== '$ref'));
      if (!Object.keys(siblings).length) return expanded;
      // JSON Schema ref siblings are conjunctive. Never overwrite constraints
      // from the target with sibling values (which could silently weaken them).
      const annotations = ['title', 'description', 'default'];
      if (Object.keys(siblings).every((key) => annotations.includes(key)))
        return { ...expanded, ...walk(siblings, refs, depth + 1) };
      return { allOf: [expanded, walk(siblings, refs, depth + 1)] };
    }
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== '$defs' && key !== 'definitions')
      .map(([key, item]) => [key, walk(item, refs, depth + 1)]));
  };
  const expanded = walk(schema);
  if (Buffer.byteLength(JSON.stringify(expanded)) > MAX_BYTES) invalid();
  return expanded;
}

const CONSTRAINTS = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
  'minLength', 'maxLength', 'pattern', 'format', 'minItems', 'maxItems', 'uniqueItems', 'minProperties', 'maxProperties'];
const KNOWN = new Set(['type', 'properties', 'required', 'items', 'enum', 'const', 'anyOf', 'oneOf',
  'title', 'description', 'default', 'examples', 'additionalProperties', ...CONSTRAINTS]);

/**
 * Gemini's OpenAI schema compiler rejected our full bounded Pydantic schemas
 * with HTTP 400 before inference. Keep structural types/required/enums but put
 * size/format/numeric constraints in descriptions. Inputs and generated outputs
 * still pass the unchanged full Python validators before any inference/save.
 * Do not strip arbitrary object keys: fields literally named "title", "items"
 * or "default" must remain intact inside a properties map.
 */
export function providerSchema(schema) {
  const expanded = inlineLocalRefs(schema);
  const walk = (value) => {
    if (!object(value) || Object.keys(value).some((key) => !KNOWN.has(key))) invalid();
    const result = {};
    if (value.type !== undefined) result.type = structuredClone(value.type);
    if (value.properties !== undefined) {
      if (!object(value.properties)) invalid();
      result.properties = Object.fromEntries(Object.entries(value.properties).map(([key, item]) => [key, walk(item)]));
    }
    if (value.required !== undefined) result.required = structuredClone(value.required);
    if (value.items !== undefined) result.items = walk(value.items);
    if (value.enum !== undefined) result.enum = structuredClone(value.enum);
    if (value.const !== undefined) result.enum = [structuredClone(value.const)];
    for (const key of ['anyOf', 'oneOf']) if (value[key] !== undefined) {
      if (!Array.isArray(value[key])) invalid();
      result[key] = value[key].map(walk);
    }
    const hints = CONSTRAINTS.filter((key) => value[key] !== undefined).map((key) => `${key}=${JSON.stringify(value[key])}`);
    if (value.additionalProperties === false) hints.push('no additional properties');
    else if (value.additionalProperties !== undefined) invalid();
    if (value.default !== undefined) hints.push(`default=${JSON.stringify(value.default)}`);
    const description = [value.description, hints.length ? `Locally enforced constraints: ${hints.join('; ')}.` : null].filter(Boolean).join(' ');
    if (description) result.description = description;
    return result;
  };
  return walk(expanded);
}
