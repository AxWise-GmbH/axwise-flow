/**
 * Condition node executor — evaluates an expression and routes to true/false output.
 * Supports simple comparisons: value == x, value != x, value > x, etc.
 * Also supports truthy check (just a field path).
 */

/**
 * @param {object} config - { expression: string }
 * @param {object} inputData - Data from upstream nodes
 * @returns {{ output: object, outputPort: 'true' | 'false' }}
 */
export async function executeCondition(config, inputData) {
  const expression = config.expression || '';
  if (!expression) throw new Error('Condition node: expression is required');

  let result = false;

  try {
    result = evaluateExpression(expression, inputData);
  } catch (err) {
    throw new Error(`Condition evaluation failed: ${err.message}`);
  }

  return {
    output: { ...inputData, _conditionResult: result },
    outputPort: result ? 'true' : 'false',
  };
}

function evaluateExpression(expr, data) {
  // Try comparison operators
  const comparisons = [
    { op: '===', fn: (a, b) => a === b },
    { op: '!==', fn: (a, b) => a !== b },
    { op: '==', fn: (a, b) => a == b },
    { op: '!=', fn: (a, b) => a != b },
    { op: '>=', fn: (a, b) => Number(a) >= Number(b) },
    { op: '<=', fn: (a, b) => Number(a) <= Number(b) },
    { op: '>', fn: (a, b) => Number(a) > Number(b) },
    { op: '<', fn: (a, b) => Number(a) < Number(b) },
    { op: 'includes', fn: (a, b) => String(a).includes(b) },
    { op: 'startsWith', fn: (a, b) => String(a).startsWith(b) },
  ];

  for (const { op, fn } of comparisons) {
    const parts = expr.split(` ${op} `);
    if (parts.length === 2) {
      const left = resolveValue(parts[0].trim(), data);
      const right = resolveValue(parts[1].trim(), data);
      return fn(left, right);
    }
  }

  // Simple truthy check on a path
  const val = resolveValue(expr.trim(), data);
  return Boolean(val);
}

function resolveValue(token, data) {
  // String literal
  if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
    return token.slice(1, -1);
  }
  // Number literal
  if (/^-?\d+(\.\d+)?$/.test(token)) return Number(token);
  // Boolean literals
  if (token === 'true') return true;
  if (token === 'false') return false;
  if (token === 'null') return null;

  // Resolve from data (dot notation)
  const parts = token.split('.');
  let current = data;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}
