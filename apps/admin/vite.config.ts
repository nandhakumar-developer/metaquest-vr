<<<<<<< HEAD
import { defineConfig, loadEnv } from 'vite';
=======
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
>>>>>>> origin/main
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

<<<<<<< HEAD
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');
  const certPath = env.TLS_CERT_PATH?.trim();
  const keyPath = env.TLS_KEY_PATH?.trim();
  const hasTls =
    Boolean(certPath && keyPath) &&
    fs.existsSync(path.resolve(rootDir, certPath!)) &&
    fs.existsSync(path.resolve(rootDir, keyPath!));

  const protocol = hasTls ? 'https' : 'http';
  const wsProtocol = hasTls ? 'wss' : 'ws';
  // Keep the dev proxy in sync with the gateway's configured port. They used
  // to drift apart (proxy: 4000, gateway: 5000), which made every login fail
  // with a proxy connection error.
  const gatewayPort = Number(env.GATEWAY_PORT) || 4000;
  const target = `${protocol}://127.0.0.1:${gatewayPort}`;
  const wsTarget = `${wsProtocol}://127.0.0.1:${gatewayPort}`;

  return {
    envDir: rootDir,
    plugins: [react(), tailwindcss()],
    server: {
      host: '127.0.0.1',
      port: 3000,
      strictPort: true,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            // The gateway's default development origin is localhost:3000. Keep
            // LAN browser requests behind this local dev proxy within that policy.
            proxy.on('proxyReq', (proxyRequest) => {
              proxyRequest.setHeader('origin', 'http://localhost:3000');
            });
          },
        },
        '/ws': {
          target: wsTarget,
          ws: true,
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on('proxyReqWs', (proxyRequest) => {
              proxyRequest.setHeader('origin', 'http://localhost:3000');
            });
          },
        },
        '/player': {
          target,
          changeOrigin: true,
          secure: false,
        },
=======
// The gateway enables HTTPS when the generated local certificate exists. Follow
// that here so `npm run dev` keeps working after `npm run https:setup`.
const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(configDir, '..', '..');
const hasTls =
  existsSync(path.join(repoRoot, 'certs', 'gateway.crt')) &&
  existsSync(path.join(repoRoot, 'certs', 'gateway.key'));
const gatewayTarget = `${hasTls ? 'https' : 'http'}://localhost:4000`;
const gatewayWsTarget = `${hasTls ? 'wss' : 'ws'}://localhost:4000`;
const proxySecure = hasTls ? false : undefined;

export default defineConfig({
  envDir: repoRoot,
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: gatewayTarget,
        changeOrigin: true,
        secure: proxySecure,
        configure: (proxy) => {
          // The gateway's default development origin is localhost:3000. Keep
          // LAN browser requests behind this local dev proxy within that policy.
          proxy.on('proxyReq', (proxyRequest) => {
            proxyRequest.setHeader('origin', 'http://localhost:3000');
          });
        },
      },
      '/ws': {
        target: gatewayWsTarget,
        ws: true,
        changeOrigin: true,
        secure: proxySecure,
        configure: (proxy) => {
          proxy.on('proxyReqWs', (proxyRequest) => {
            proxyRequest.setHeader('origin', 'http://localhost:3000');
          });
        },
      },
      '/player': {
        target: gatewayTarget,
        changeOrigin: true,
        secure: proxySecure,
>>>>>>> origin/main
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
