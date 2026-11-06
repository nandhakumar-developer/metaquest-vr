import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  const target = `${protocol}://127.0.0.1:4000`;
  const wsTarget = `${wsProtocol}://127.0.0.1:4000`;

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
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
