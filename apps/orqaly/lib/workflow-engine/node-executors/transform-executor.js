/**
 * Transform node executor — maps/transforms data between nodes.
 * Config.mapping is a JSON object where keys are output field names
 * and values are dot-notation paths into inputData, or literal values.
 */

/**
 * @param {object} config - { mapping: object }
 * @param {object} inputData - Data from upstream nodes
 */
export async function executeTransform(config, inputData) {
  const mapping = config.mapping;

  // No mapping → pass through
  if (!mapping || typeof mapping !== 'object') {
    return { output: inputData, outputPort: 'out' };
  }

  const output = {};

  for (const [outputKey, sourcePath] of Object.entries(mapping)) {
    if (typeof sourcePath === 'string' && sourcePath.startsWith('$.')) {
      // Dot-notation path into input data
      output[outputKey] = resolveValue(sourcePath.slice(2), inputData);
    } else if (typeof sourcePath === 'string' && sourcePath.startsWith('{{') && sourcePath.endsWith('}}')) {
      // Template expression
      const path = sourcePath.slice(2, -2).trim();
      output[outputKey] = resolveValue(path, inputData);
    } else {
      // Literal value
      output[outputKey] = sourcePath;
    }
  }

  return { output, outputPort: 'out' };
}

function resolveValue(path, data) {
  const parts = path.split('.');
  let current = data;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}
