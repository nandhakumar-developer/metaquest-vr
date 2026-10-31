import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { loadConfig } from '../config.js';
import { Store } from '../database/index.js';
import { hashPassword, validatePasswordStrength } from '../auth/password.js';

interface ParsedArgs {
  email?: string;
  password?: string;
  name?: string;
  role?: 'admin' | 'operator' | 'viewer';
}

function parseCliArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--email=')) {
      result.email = arg.slice(8);
    } else if (arg === '--email' && args[i + 1]) {
      result.email = args[++i];
    } else if (arg.startsWith('--password=')) {
      result.password = arg.slice(11);
    } else if (arg === '--password' && args[i + 1]) {
      result.password = args[++i];
    } else if (arg.startsWith('--name=')) {
      result.name = arg.slice(7);
    } else if (arg === '--name' && args[i + 1]) {
      result.name = args[++i];
    } else if (arg.startsWith('--role=')) {
      const r = arg.slice(7);
      if (r === 'admin' || r === 'operator' || r === 'viewer') result.role = r;
    } else if (arg === '--role' && args[i + 1]) {
      const r = args[++i];
      if (r === 'admin' || r === 'operator' || r === 'viewer') result.role = r;
    }
  }
  return result;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const cliArgs = parseCliArgs(process.argv.slice(2));

  let email = cliArgs.email || process.env.BOOTSTRAP_ADMIN_EMAIL || '';
  let password = cliArgs.password || process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
  let displayName = cliArgs.name || '';
  const role = cliArgs.role || 'admin';

  if (!email || !password) {
    if (!process.stdin.isTTY) {
      process.stderr.write(
        'Error: Email and password must be supplied via CLI flags (--email, --password) or environment variables (BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD) in non-interactive mode.\n',
      );
      process.exit(1);
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      if (!email) {
        email = (await rl.question('Admin Email: ')).trim();
      }
      if (!displayName) {
        displayName = (await rl.question('Display Name (optional, defaults to email): ')).trim();
      }
      if (!password) {
        password = (await rl.question('Password (min 12 chars, letter & number): ')).trim();
      }
    } finally {
      rl.close();
    }
  }

  email = email.trim();
  if (!email || !email.includes('@')) {
    process.stderr.write('Error: A valid email address is required.\n');
    process.exit(1);
  }

  if (!displayName) {
    displayName = email.split('@')[0] || 'Administrator';
  }

  const issues = validatePasswordStrength(password);
  if (issues.length > 0) {
    process.stderr.write(`Password error: ${issues.join('. ')}\n`);
    process.exit(1);
  }

  const store = new Store(config.dataDir);
  try {
    const existing = store.admins.getAdminByEmail(email);
    const passwordHash = await hashPassword(password);

    if (existing) {
      store.admins.updatePassword(existing.id, passwordHash);
      if (displayName) {
        store.admins.updateProfile(existing.id, displayName);
      }
      store.admins.resetFailedLogins(existing.id);
      store.admins.deleteSessionsForAdmin(existing.id);
      process.stdout.write(`Successfully updated password for administrator: ${email}\n`);
    } else {
      const created = store.admins.createAdmin({
        email,
        displayName,
        passwordHash,
        role,
      });
      process.stdout.write(
        `Successfully created administrator account!\n` +
          `  ID:    ${created.id}\n` +
          `  Email: ${created.email}\n` +
          `  Name:  ${created.displayName}\n` +
          `  Role:  ${created.role}\n`,
      );
    }

    // Clean up one-time setup token if it exists
    const tokenFile = path.join(config.dataDir, 'bootstrap-token.txt');
    if (existsSync(tokenFile)) {
      try {
        unlinkSync(tokenFile);
      } catch {
        // Best-effort
      }
    }
  } finally {
    store.close();
  }
}

main().catch((err) => {
  process.stderr.write(`Failed to provision administrator: ${String(err?.message || err)}\n`);
  process.exit(1);
});

