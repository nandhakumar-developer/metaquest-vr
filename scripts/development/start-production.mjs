import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');

const gatewayDist = path.join(rootDir, 'apps', 'gateway', 'dist', 'index.js');

if (!existsSync(gatewayDist)) {
  process.stdout.write('[VRCC] Production build not found. Running npm run build first...\n');
  const build = spawn('npm', ['run', 'build'], { cwd: rootDir, stdio: 'inherit', shell: true });
  build.on('close', (code) => {
    if (code !== 0) {
      process.stderr.write(`[VRCC] Build failed with exit code ${code}\n`);
      process.exit(code ?? 1);
    }
    runGateway();
  });
} else {
  runGateway();
}

function runGateway() {
  process.stdout.write('[VRCC] Starting gateway in production mode...\n');
  const child = spawn('node', [gatewayDist], {
    cwd: rootDir,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  });

  child.on('close', (code) => {
    process.exit(code ?? 0);
  });
}

