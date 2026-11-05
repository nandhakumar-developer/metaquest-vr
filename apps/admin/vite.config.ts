import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

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
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
