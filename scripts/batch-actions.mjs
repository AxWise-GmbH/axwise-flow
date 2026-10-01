#!/usr/bin/env node
import { executeBatchActions } from './lib/batch-actions.mjs';
import fs from 'node:fs';

async function main() {
  let rawJson = process.argv[2];

  if (!rawJson) {
    // Read from stdin if no CLI arg provided
    try {
      rawJson = fs.readFileSync(0, 'utf8');
    } catch {
      // no stdin
    }
  }

  if (!rawJson) {
    console.error('Usage: batch-actions \'<json-actions-array>\'');
    console.error('Example: node scripts/batch-actions.mjs \'[{"type":"wait","ms":50}]\'');
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    console.error('Failed to parse JSON input:', err.message);
    process.exit(1);
  }

  const actions = Array.isArray(parsed) ? parsed : (parsed.actions || []);
  const options = Array.isArray(parsed) ? {} : parsed.options || {};

  const result = await executeBatchActions(actions, options);
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('batch-actions failed:', err);
  process.exit(1);
});
