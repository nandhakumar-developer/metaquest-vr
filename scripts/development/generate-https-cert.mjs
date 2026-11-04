/**
 * Generates a local self-signed TLS certificate for the gateway.
 *
 * WebXR (immersive 180/360 playback) is only exposed in a secure context.
 * Meta Quest Browser treats `https://<lan-ip>` as secure after the user accepts
 * the certificate warning, so a local certificate is enough to make Enter VR
 * work. A certificate signed by a CA the headset already trusts avoids the
 * warning but is not required.
 *
 * The certificate covers localhost, the PC hostname, and every current
 * non-loopback IPv4 address. Re-run this script when the PC's LAN address
 * changes (for example after a DHCP lease change).
 *
 * Usage:
 *   node scripts/development/generate-https-cert.mjs
 *
 * Then set these values in `.env` and restart the gateway:
 *   TLS_CERT_PATH=./certs/gateway.crt
 *   TLS_KEY_PATH=./certs/gateway.key
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const certDir = path.join(repoRoot, 'certs');
const certPath = path.join(certDir, 'gateway.crt');
const keyPath = path.join(certDir, 'gateway.key');
const configPath = path.join(certDir, 'openssl.cnf');

function collectAddresses() {
  const addresses = new Set(['127.0.0.1']);
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      if (entry.address.startsWith('169.254.')) continue;
      addresses.add(entry.address);
    }
  }
  return [...addresses];
}

function buildConfig(addresses) {
  const dnsNames = ['localhost', hostname()].filter(
    (name, index, list) => name && list.indexOf(name) === index,
  );
  const altNames = [
    ...dnsNames.map((name, index) => `DNS.${index + 1} = ${name}`),
    ...addresses.map((address, index) => `IP.${index + 1} = ${address}`),
    `IP.${addresses.length + 1} = ::1`,
  ];
  return `[req]
distinguished_name = dn
x509_extensions = v3_req
prompt = no

[dn]
CN = VR Control Center

[v3_req]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
${altNames.join('\n')}
`;
}

function main() {
  mkdirSync(certDir, { recursive: true });
  const addresses = collectAddresses();
  writeFileSync(configPath, buildConfig(addresses), 'utf8');
  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-sha256',
        '-days',
        '825',
        '-keyout',
        keyPath,
        '-out',
        certPath,
        '-config',
        configPath,
        '-extensions',
        'v3_req',
      ],
      { stdio: 'inherit' },
    );
  } catch (error) {
    process.stderr.write(
      '\nCould not run `openssl`. Install OpenSSL (or mkcert) and try again.\n' +
        'On Windows, the OpenSSL shipped with Git for Windows also works if it is on PATH.\n',
    );
    throw error;
  } finally {
    rmSync(configPath, { force: true });
  }

  process.stdout.write(`\nCreated ${path.relative(repoRoot, certPath)}\n`);
  process.stdout.write(`Created ${path.relative(repoRoot, keyPath)}\n`);
  process.stdout.write(`Covered addresses: ${addresses.join(', ')}\n\n`);
  process.stdout.write(
    'Restart the gateway. It enables HTTPS automatically when these files exist.\n\n',
  );
  process.stdout.write('On the headset, open the https:// player URL, accept the certificate warning,\n');
  process.stdout.write('then tap Enter VR. You only need to accept the warning once per browser.\n\n');
  process.stdout.write(
    'If the PC LAN address changes, run `npm run https:setup` again and restart.\n',
  );
}

main();
