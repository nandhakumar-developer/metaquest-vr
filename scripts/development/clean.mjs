import { rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');

const targets = [
  'dist',
  'coverage',
  '.turbo',
  'packages/shared-types/dist',
  'packages/protocol/dist',
  'apps/gateway/dist',
  'apps/admin/dist',
];

for (const target of targets) {
  const fullPath = path.join(rootDir, target);
  if (existsSync(fullPath)) {
    rmSync(fullPath, { recursive: true, force: true });
    process.stdout.write(`Removed: ${target}\n`);
  }
}

process.stdout.write('Clean complete.\n');

