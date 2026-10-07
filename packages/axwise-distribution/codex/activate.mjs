// Retire the obsolete separate server after the installed plugin has been verified.
// Keep its configuration and all saved data so the change remains reversible.
import { readFile, writeFile, rename, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const configPath = join(homedir(), '.codex/config.toml');
const source = await readFile(configPath, 'utf8');
const header = '[mcp_servers.axwise-local]';
const start = source.indexOf(header);
if (start < 0) {
  console.log(JSON.stringify({ legacyServer: 'axwise-local', action: 'absent', changed: false }));
} else {
  const bodyStart = start + header.length;
  const next = source.slice(bodyStart).search(/\n\s*\[/);
  const end = next < 0 ? source.length : bodyStart + next;
  const block = source.slice(bodyStart, end);
  if (/^enabled\s*=\s*false\s*(?:#.*)?$/m.test(block)) {
    console.log(JSON.stringify({ legacyServer: 'axwise-local', action: 'already_disabled', changed: false }));
  } else {
    const updatedBlock = /^enabled\s*=/m.test(block)
      ? block.replace(/^enabled\s*=.*$/m, 'enabled = false')
      : '\nenabled = false' + block;
    const updated = source.slice(0, bodyStart) + updatedBlock + source.slice(end);
    if (process.argv.includes('--dry-run')) {
      console.log(JSON.stringify({ legacyServer: 'axwise-local', action: 'disable', changed: false }));
    } else {
      const suffix = 'axwise-plugin-' + randomUUID();
      const backup = configPath + '.' + suffix + '.bak';
      const temporary = configPath + '.' + suffix + '.tmp';
      await writeFile(backup, source, { flag: 'wx', mode: 0o600 });
      await writeFile(temporary, updated, { flag: 'wx', mode: (await stat(configPath)).mode & 0o777 });
      await rename(temporary, configPath);
      console.log(JSON.stringify({ legacyServer: 'axwise-local', action: 'disabled', changed: true, backup }));
    }
  }
}
