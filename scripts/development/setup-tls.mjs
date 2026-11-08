/**
 * Generate a local certificate authority and an HTTPS certificate for the
 * gateway. The CA only needs to be installed on a headset once; rerunning this
 * script regenerates the server certificate for the current LAN addresses while
 * keeping the same CA.
 *
 * Usage: npm run tls:setup
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import selfsigned from 'selfsigned';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '..', '..');
const envPath = path.join(rootDir, '.env');
const certDir = path.join(rootDir, 'storage', 'certs');
const caKeyPath = path.join(certDir, 'local-ca.key');
const caCertPath = path.join(certDir, 'local-ca.crt');
const serverKeyPath = path.join(certDir, 'gateway.key');
const serverCertPath = path.join(certDir, 'gateway.crt');

const VIRTUAL_INTERFACE_PATTERN =
  /(vethernet|hyper-?v|virtualbox|vmware|virtual|docker|wsl|loopback|tailscale|zeronet|nordlynx|wireguard|bluetooth|npcap|^tap\b|^tun\b)/i;

function isPrivateIpv4(address) {
  return (
    address.startsWith('10.') ||
    address.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address)
  );
}

function lanScore(entry) {
  let score = 0;
  if (VIRTUAL_INTERFACE_PATTERN.test(entry.interfaceName)) score -= 1000;
  if (/^192\.168\.56\./.test(entry.address)) score -= 500;
  if (/^172\.(1[7-9]|2\d|3[01])\./.test(entry.address)) score -= 100;
  if (/(^|\b)(wi-?fi|wlan|wireless)/i.test(entry.interfaceName)) score += 100;
  else if (/(^|\b)(ethernet|eth\d|en\d)/i.test(entry.interfaceName)) score += 80;
  if (isPrivateIpv4(entry.address)) score += 20;
  return score;
}

function listLanAddresses() {
  const results = [];
  for (const [interfaceName, addresses] of Object.entries(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal) continue;
      if (address.address.startsWith('169.254.')) continue;
      results.push({ address: address.address, interfaceName });
    }
  }
  return results.sort((a, b) => lanScore(b) - lanScore(a)).map((entry) => entry.address);
}

function readEnvFile() {
  if (!existsSync(envPath)) return '';
  return readFileSync(envPath, 'utf8');
}

function updateEnv(content, key, value) {
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(content)) return content.replace(pattern, `${key}=${value}`);
  return `${content.replace(/\s*$/, '')}\n${key}=${value}\n`;
}

function writePrivate(filePath, value) {
  writeFileSync(filePath, value, { mode: 0o600 });
}

async function main() {
  mkdirSync(certDir, { recursive: true });
  const lanAddresses = listLanAddresses();
  const primary = lanAddresses[0] ?? 'localhost';
  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' },
    { type: 7, ip: '::1' },
    ...lanAddresses.map((address) => ({ type: 7, ip: address })),
  ];
  const notBeforeDate = new Date(Date.now() - 5 * 60_000);
  const caNotAfterDate = new Date(Date.now() + 3650 * 24 * 60 * 60_000);
  const serverNotAfterDate = new Date(Date.now() + 825 * 24 * 60 * 60_000);

  let caKey;
  let caCert;
  if (existsSync(caKeyPath) && existsSync(caCertPath)) {
    caKey = readFileSync(caKeyPath, 'utf8');
    caCert = readFileSync(caCertPath, 'utf8');
    console.log(`Reusing local CA: ${caCertPath}`);
  } else {
    const ca = await selfsigned.generate(
      [{ name: 'commonName', value: 'VR Control Center Local CA' }],
      {
        keySize: 2048,
        algorithm: 'sha256',
        notBeforeDate,
        notAfterDate: caNotAfterDate,
        extensions: [
          { name: 'basicConstraints', cA: true, critical: true },
          {
            name: 'keyUsage',
            keyCertSign: true,
            cRLSign: true,
            digitalSignature: true,
            critical: true,
          },
        ],
      },
    );
    caKey = ca.private;
    caCert = ca.cert;
    writePrivate(caKeyPath, caKey);
    writeFileSync(caCertPath, caCert);
    console.log(`Created local CA: ${caCertPath}`);
  }

  const server = await selfsigned.generate(
    [{ name: 'commonName', value: primary }],
    {
      keySize: 2048,
      algorithm: 'sha256',
      notBeforeDate,
      notAfterDate: serverNotAfterDate,
      ca: { key: caKey, cert: caCert },
      extensions: [
        { name: 'basicConstraints', cA: false, critical: true },
        {
          name: 'keyUsage',
          digitalSignature: true,
          keyEncipherment: true,
          critical: true,
        },
        { name: 'extKeyUsage', serverAuth: true },
        { name: 'subjectAltName', altNames },
      ],
    },
  );
  writePrivate(serverKeyPath, server.private);
  writeFileSync(serverCertPath, server.cert);
  console.log(`Created server certificate: ${serverCertPath}`);
  console.log(`  Common name: ${primary}`);
  console.log(`  SANs: localhost, 127.0.0.1, ::1${lanAddresses.map((a) => `, ${a}`).join('')}`);

  let env = readEnvFile();
  env = updateEnv(env, 'TLS_CERT_PATH', './storage/certs/gateway.crt');
  env = updateEnv(env, 'TLS_KEY_PATH', './storage/certs/gateway.key');
  writeFileSync(envPath, env);
  console.log(`Updated ${envPath} with the TLS paths.`);

  const gatewayPort = /(?:^|\n)GATEWAY_PORT=(\d+)/.exec(env)?.[1] ?? '5000';
  console.log('');
  console.log('Next steps:');
  console.log('  1. Restart the gateway so it reads the new TLS paths.');
  console.log(`  2. Open the secure player URL on the headset: https://${primary}:${gatewayPort}/player/`);
  console.log('  3. If the headset shows a certificate warning, either choose "Advanced"');
  console.log('     and proceed, or install the local CA from:');
  console.log(`     ${caCertPath}`);
  console.log('     On Quest: Settings > Security > Install CA certificate.');
  console.log('  4. Unpair/repair the headset in the browser because HTTPS is a new origin.');
}

main().catch((error) => {
  console.error(`TLS setup failed: ${error?.stack || error}`);
  process.exit(1);
});
