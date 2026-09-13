#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function validateMigrationFiles(files) {
  const errors = [];
  const versions = new Map();

  for (const file of files) {
    const match = file.name.match(/^(\d{3,})_[a-z0-9_]+\.sql$/);
    if (!match) {
      errors.push(`${file.name}: invalid active migration filename`);
      continue;
    }
    const version = Number(match[1]);
    if (versions.has(version)) {
      errors.push(`${file.name}: duplicate version ${match[1]} (${versions.get(version)})`);
    }
    versions.set(version, file.name);
    if (!file.content.trim()) errors.push(`${file.name}: empty migration`);
    if (/^(<<<<<<<|=======|>>>>>>>)/m.test(file.content)) {
      errors.push(`${file.name}: unresolved merge conflict marker`);
    }
  }

  const ordered = [...versions.keys()].sort((a, b) => a - b);
  if (ordered[0] !== 1) errors.push('Active migrations must start at version 001');
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index] !== ordered[index - 1] + 1) {
      errors.push(`Missing migration version between ${ordered[index - 1]} and ${ordered[index]}`);
    }
  }

  return errors;
}

export function verifyMigrationDirectory(
  directory = resolve(process.cwd(), 'supabase/migrations')
) {
  const files = readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .map((name) => ({ name, content: readFileSync(resolve(directory, name), 'utf8') }));
  const errors = validateMigrationFiles(files);
  if (errors.length > 0) {
    for (const error of errors) console.error(`- ${error}`);
    return 1;
  }
  console.log(`Migration inventory verified: ${files.length} contiguous, non-empty SQL files.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(verifyMigrationDirectory());
}
