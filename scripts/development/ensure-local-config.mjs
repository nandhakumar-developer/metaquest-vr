/**
 * First-run bootstrap for a fresh clone.
 *
 * `npm install` installs dependencies, but the repository intentionally does
 * not contain `.env` (credentials) or generated TLS files. This script runs
 * before `npm run dev` / `npm start` and:
 *   - creates a local .env with the default administrator if missing
 *   - generates a local HTTPS certificate for a freshly created .env
 *   - builds the dashboard once so http(s)://localhost:<port>/admin works
 *
 * An existing .env is never overwritten.
 */
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const envPath = path.join(rootDir, ".env");
const certPath = path.join(rootDir, "storage", "certs", "gateway.crt");
const keyPath = path.join(rootDir, "storage", "certs", "gateway.key");
const adminIndex = path.join(rootDir, "apps", "admin", "dist", "index.html");

function runNpm(args, label) {
  // Pass a single command string: passing an args array together with
  // `shell: true` is deprecated by Node.
  const result = spawnSync(`npm ${args.join(" ")}`, {
    cwd: rootDir,
    stdio: "inherit",
    shell: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${label} failed with exit code ${result.status ?? "unknown"}`,
    );
  }
}

function runNode(script, label) {
  const result = spawnSync(process.execPath, [script], {
    cwd: rootDir,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${label} failed with exit code ${result.status ?? "unknown"}`,
    );
  }
}

function updateEnv(key, value) {
  const content = readFileSync(envPath, "utf8");
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const next = pattern.test(content)
    ? content.replace(pattern, `${key}=${value}`)
    : `${content.replace(/\s*$/, "")}\n${key}=${value}\n`;
  writeFileSync(envPath, next, { mode: 0o600 });
  chmodSync(envPath, 0o600);
}

function createEnv() {
  if (existsSync(envPath)) return false;

  const content = `# ---------------------------------------------------------------------------
# VR Control Center - local configuration
# Generated automatically on first run. This file is local and gitignored.
# Edit freely; the bootstrap never overwrites an existing .env.
# ---------------------------------------------------------------------------

GATEWAY_HOST=0.0.0.0
GATEWAY_PORT=5000
ADMIN_ORIGIN=http://localhost:3000
EXTRA_ALLOWED_ORIGINS=
PUBLIC_GATEWAY_URL=

# Local administrator created automatically when the database is empty.
BOOTSTRAP_ADMIN_EMAIL=admin2026
BOOTSTRAP_ADMIN_PASSWORD=Ndurance@2026
BOOTSTRAP_ADMIN_NAME=VR Admin
`;
  writeFileSync(envPath, content, { mode: 0o600 });
  chmodSync(envPath, 0o600);
  console.log(
    "[VRCC] Created .env with the default local administrator (admin2026).",
  );
  return true;
}

function ensureTls() {
  if (existsSync(certPath) && existsSync(keyPath)) return true;

  console.log("[VRCC] Creating a local HTTPS certificate for this PC...");
  try {
    runNode(
      path.join(rootDir, "scripts", "development", "setup-tls.mjs"),
      "TLS setup",
    );
    return existsSync(certPath) && existsSync(keyPath);
  } catch (error) {
    console.warn(`[VRCC] HTTPS setup failed: ${error.message}`);
    console.warn(
      "[VRCC] Starting without HTTPS. Run `npm run tls:setup` later to enable it.",
    );
    return false;
  }
}

function ensureAdminBuild() {
  if (existsSync(adminIndex)) return;

  console.log(
    "[VRCC] Building the dashboard once so /admin is available on the gateway port...",
  );
  runNpm(["run", "build:packages"], "Package build");
  runNpm(["run", "build", "-w", "@vrcc/admin"], "Dashboard build");
}

function main() {
  const created = createEnv();
  if (created) {
    const tlsReady = ensureTls();
    updateEnv(
      "ADMIN_ORIGIN",
      tlsReady ? "https://localhost:3000" : "http://localhost:3000",
    );
  }
  ensureAdminBuild();
}

try {
  main();
} catch (error) {
  console.error(`[VRCC] First-run setup failed: ${error?.stack || error}`);
  process.exit(1);
}
