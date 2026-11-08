import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(configDir, '..', '..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '');
  const certPath = env.TLS_CERT_PATH?.trim();
  const keyPath = env.TLS_KEY_PATH?.trim();
  const tlsConfiguredExplicitly = Boolean(certPath || keyPath);
  const certFile = tlsConfiguredExplicitly
    ? certPath
      ? path.resolve(repoRoot, certPath)
      : ''
    : path.join(repoRoot, 'certs', 'gateway.crt');
  const keyFile = tlsConfiguredExplicitly
    ? keyPath
      ? path.resolve(repoRoot, keyPath)
      : ''
    : path.join(repoRoot, 'certs', 'gateway.key');
  const hasTls = Boolean(certFile && keyFile && existsSync(certFile) && existsSync(keyFile));
  const protocol = hasTls ? 'https' : 'http';
  const wsProtocol = hasTls ? 'wss' : 'ws';
  const gatewayPort = Number(env.GATEWAY_PORT) || 4000;
  const target = `${protocol}://127.0.0.1:${gatewayPort}`;
  const wsTarget = `${wsProtocol}://127.0.0.1:${gatewayPort}`;

  return {
    envDir: repoRoot,
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
