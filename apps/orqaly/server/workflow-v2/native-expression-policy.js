// A non-evaluating grammar for the first pure-data execution profile. Unsupported
// expressions remain authorable but cannot acquire execution authority.
const forbidden = new Set([
  '__proto__',
  'prototype',
  'constructor',
  'caller',
  'callee',
  'arguments',
]);
const methods = new Set([
  'trim',
  'toLowerCase',
  'toUpperCase',
  'includes',
  'startsWith',
  'endsWith',
  'slice',
  'substring',
  'split',
  'join',
  'toString',
  'toFixed',
  'at',
  'first',
  'last',
  'all',
  'isEmpty',
  'isNotEmpty',
  'toJsonString',
  'sum',
]);
const roots = new Set(['$json', '$input', '$execution', '$runIndex', '$itemIndex', '$']);
const binary = new Set([
  '+',
  '-',
  '*',
  '/',
  '%',
  '===',
  '!==',
  '==',
  '!=',
  '>=',
  '<=',
  '>',
  '<',
  '&&',
  '||',
  '??',
]);

function expressionSegments(text) {
  const segments = [];
  let cursor = 0;
  while (true) {
    const start = text.indexOf('{{', cursor);
    if (start < 0) return segments;
    let depth = 0;
    let quote = null;
    let escaped = false;
    let end = start + 2;
    for (; end < text.length; end++) {
      const character = text[end];
      if (quote) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === quote) quote = null;
      } else if (character === '"' || character === "'") quote = character;
      else if (character === '{') depth++;
      else if (character === '}') {
        if (depth > 0) depth--;
        else if (text[end + 1] === '}') break;
        else throw new Error();
      }
    }
    if (end >= text.length || quote || depth) throw new Error();
    segments.push(text.slice(start + 2, end));
    cursor = end + 2;
  }
}

export function inspectNativeExpression(expression) {
  const references = [];
  if (typeof expression !== 'string' || !expression.includes('{{'))
    return { safe: true, references };
  if (expression.length > 12000)
    return { safe: false, references, reason: 'Expression exceeds the reviewed size budget' };
  try {
    const segments = expressionSegments(expression);
    if (!segments.length) throw new Error();
    for (const segment of segments) {
      const tokens = [];
      let offset = 0;
      while (offset < segment.length) {
        const tail = segment.slice(offset);
        const match =
          /^(\s+|"(?:[^"\\\n]|\\["\\/bfnrt]|\\u[0-9a-fA-F]{4})*"|'(?:[^'\\\n]|\\['"\\/bfnrt])*'|(?:\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|[A-Za-z_$][A-Za-z0-9_$]*|===|!==|==|!=|>=|<=|&&|\|\||\?\?|\?\.|[.()[\]{},:?+*/%!<>-])/.exec(
            tail
          );
        if (!match) throw new Error();
        offset += match[0].length;
        if (!/^\s+$/.test(match[0])) tokens.push(match[0]);
        if (tokens.length > 2000) throw new Error();
      }
      let i = 0;
      let depth = 0;
      const take = (value) => {
        if (tokens[i] !== value) throw new Error();
        i++;
      };
      const stringValue = (value) =>
        value.startsWith('"')
          ? JSON.parse(value)
          : value.slice(1, -1).replace(/\\(['"\\/])/g, '$1');
      const expressionPart = () => {
        if (++depth > 32) throw new Error();
        primary();
        while (binary.has(tokens[i])) {
          i++;
          primary();
        }
        if (tokens[i] === '?') {
          i++;
          expressionPart();
          take(':');
          expressionPart();
        }
        depth--;
      };
      const primary = () => {
        let callable = null;
        const token = tokens[i++];
        if (!token) throw new Error();
        // typeof inspects an already permitted data expression only. It does
        // not add globals, calls, computed properties or an evaluating parser.
        if (['!', '-', '+', 'typeof'].includes(token)) {
          primary();
          return;
        }
        if (token === '(') {
          expressionPart();
          take(')');
        } else if (token === '[') {
          if (tokens[i] !== ']') {
            expressionPart();
            while (tokens[i] === ',') {
              i++;
              expressionPart();
            }
          }
          take(']');
        } else if (token === '{') {
          while (tokens[i] !== '}') {
            const key = tokens[i++];
            if (
              !key ||
              !/^(?:[A-Za-z_$][A-Za-z0-9_$]*|["'])/.test(key) ||
              forbidden.has(key.startsWith('"') || key.startsWith("'") ? stringValue(key) : key)
            )
              throw new Error();
            take(':');
            expressionPart();
            if (tokens[i] !== ',') break;
            i++;
          }
          take('}');
        } else if (
          /^["']/.test(token) ||
          /^\d/.test(token) ||
          ['true', 'false', 'null'].includes(token)
        ) {
          // Literal; never executable source.
        } else if (roots.has(token)) callable = token === '$' ? '$' : null;
        else throw new Error();
        while (['.', '?.', '[', '('].includes(tokens[i])) {
          if (tokens[i] === '(') {
            if (!callable) throw new Error();
            i++;
            if (callable === '$') {
              const name = tokens[i++];
              if (!name || !/^["']/.test(name)) throw new Error();
              references.push(stringValue(name));
              take(')');
            } else if (callable === 'sum') {
              // Pinned n8n Array.sum(): numeric-only, linear, no arguments or
              // user-supplied callbacks. Runtime n8n—not this parser—sums data.
              take(')');
            } else {
              if (tokens[i] !== ')') {
                expressionPart();
                while (tokens[i] === ',') {
                  i++;
                  expressionPart();
                }
              }
              take(')');
            }
            callable = null;
          } else if (tokens[i] === '[') {
            i++;
            const key = tokens[i++];
            if (
              !key ||
              !/^(?:\d+$|["'])/.test(key) ||
              forbidden.has(/^["']/.test(key) ? stringValue(key) : key)
            )
              throw new Error();
            take(']');
            callable = null;
          } else {
            i++;
            const property = tokens[i++];
            if (
              !property ||
              !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(property) ||
              forbidden.has(property)
            )
              throw new Error();
            callable = methods.has(property) ? property : null;
          }
        }
      };
      expressionPart();
      if (i !== tokens.length) throw new Error();
    }
    return { safe: true, references };
  } catch {
    return {
      safe: false,
      references: [],
      reason: 'Expression requires a separately reviewed execution profile; it was not evaluated',
    };
  }
}
