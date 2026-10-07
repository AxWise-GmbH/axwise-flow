import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, writeFile, lstat, readdir, chmod } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const plugin = join(root, 'axwise');
const dist = join(root, '../../../dist/axwise-codex-plugin');
const files = [
  'plugin.json', 'mcp.json', '.mcp.json', '.codex-plugin/plugin.json',
  'README.md', 'NATIVE_README.md', 'LICENSE', 'RUNTIME.json', 'bin/axwise',
  'assets/icon.svg', 'skills/axwise/SKILL.md', 'skills/axwise/references/workflow.md',
];
const expectedBinaryHash = '816af0bd6dd31a109300f066d41c08ff01c285d82bdcd2d0144df5d37385aea8';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(await readFile(join(plugin, 'plugin.json'), 'utf8'));
const runtime = JSON.parse(await readFile(join(plugin, 'RUNTIME.json'), 'utf8'));
if (manifest.name !== 'axwise' || manifest.version !== '0.1.1') throw new Error('Unexpected plugin release');
if (runtime.platform !== 'darwin-arm64' || runtime.version !== '0.5.2' ||
    runtime.sha256 !== expectedBinaryHash || hash(await readFile(join(plugin, 'bin/axwise'))) !== expectedBinaryHash) {
  throw new Error('Build the verified Apple Silicon Rust 0.5.2 package first');
}

async function inspect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const name = relative(plugin, path);
    if (entry.isSymbolicLink()) throw new Error(`Symlink rejected: ${name}`);
    if (entry.isDirectory()) {
      if (!files.some(file => file.startsWith(name + '/'))) throw new Error(`Unrelated directory: ${name}`);
      await inspect(path);
    } else if (!files.includes(name) && name !== '.gitignore') {
      throw new Error(`Unrelated file: ${name}`);
    }
  }
}
await inspect(plugin);
for (const name of files) {
  if (!(await lstat(join(plugin, name))).isFile()) throw new Error(`Not a regular package file: ${name}`);
}

await mkdir(dist, { recursive: true });
const marketplace = await mkdtemp(join(dist, 'public-marketplace-'));
const target = join(marketplace, 'axwise');
const inventory = [];
for (const name of files) {
  const destination = join(target, name);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(join(plugin, name), destination);
  if (name === 'bin/axwise') await chmod(destination, 0o755);
  inventory.push({ path: `axwise/${name}`, sha256: hash(await readFile(destination)) });
}
const catalog = JSON.parse(await readFile(join(root, '.agents/plugins/marketplace.json'), 'utf8'));
await mkdir(join(marketplace, '.agents/plugins'), { recursive: true });
await writeFile(join(marketplace, '.agents/plugins/marketplace.json'), JSON.stringify(catalog, null, 2) + '\n');
await writeFile(join(marketplace, 'README.md'), `# AxWise for Codex ${manifest.version}

Rust product discovery: scope → personas → requested interview simulations → analysis → PRD.
This edition supports Apple Silicon macOS. It uses your existing Codex model access.
It does not need Python, Node.js, an AxWise account or copied credentials.

## Install from this download

Extract this ZIP, then run these commands in the extracted marketplace folder:

\`\`\`sh
codex plugin marketplace add .
codex plugin add axwise@axwise
\`\`\`

Start a new Codex chat and ask: "Use AxWise for the complete discovery-to-PRD flow."
Codex CLI 0.159.3 was tested. The client must support local plugin marketplaces.

This is a public download for local Codex installation, separate from OpenAI's built-in directory.
See [the plugin instructions](axwise/README.md) for storage, limits and supported tools.
The archive contains the published Rust 0.5.2 executable, unchanged and hash checked.
The macOS executable is ad-hoc signed and is not Apple notarized.

Support: https://github.com/AxWise-GmbH/axwise-flow/issues
License: Apache-2.0; see [LICENSE](axwise/LICENSE).
`);
const archive = join(dist, `axwise-codex-marketplace-v${manifest.version}-darwin-arm64.zip`);
// zip updates existing archives, so reject a stale destination instead of retaining extra entries.
try {
  await lstat(archive);
  throw new Error(`Archive already exists; inspect or move it before rebuilding: ${archive}`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
execFileSync('/usr/bin/zip', ['-q', '-r', '-X', archive, '.', '-x', '*.DS_Store'], { cwd: marketplace });
const sha256 = hash(await readFile(archive));
await writeFile(archive + '.sha256', `${sha256}  ${archive.split('/').at(-1)}\n`);
const report = { pluginVersion: manifest.version, engineVersion: runtime.version,
  platform: runtime.platform, marketplace, archive, sha256, inventory,
  distribution: 'public_download_and_git_marketplace', directorySubmissionReady: false };
await writeFile(join(dist, 'public-package-verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
