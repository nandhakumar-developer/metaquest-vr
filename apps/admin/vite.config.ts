import { existsSync, readFileSync } from 'node:fs';
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
  const generatedCertFile = path.join(repoRoot, 'certs', 'gateway.crt');
  const generatedKeyFile = path.join(repoRoot, 'certs', 'gateway.key');
  let certFile = tlsConfiguredExplicitly
    ? certPath
      ? path.resolve(repoRoot, certPath)
      : ''
    : generatedCertFile;
  let keyFile = tlsConfiguredExplicitly
    ? keyPath
      ? path.resolve(repoRoot, keyPath)
      : ''
    : generatedKeyFile;
  if (
    (certFile && !existsSync(certFile)) ||
    (keyFile && !existsSync(keyFile))
  ) {
    certFile = generatedCertFile;
    keyFile = generatedKeyFile;
  }
  const hasTls = Boolean(certFile && keyFile && existsSync(certFile) && existsSync(keyFile));
  const protocol = hasTls ? 'https' : 'http';
  const wsProtocol = hasTls ? 'wss' : 'ws';
  const gatewayPort = Number(env.GATEWAY_PORT) || 4000;
  const target = `${protocol}://127.0.0.1:${gatewayPort}`;
  const wsTarget = `${wsProtocol}://127.0.0.1:${gatewayPort}`;
  const adminOrigin = `${protocol}://localhost:3000`;
  const httpsOptions = hasTls
    ? { cert: readFileSync(certFile), key: readFileSync(keyFile) }
    : undefined;

  return {
    envDir: repoRoot,
    plugins: [react(), tailwindcss()],
    server: {
      host: '127.0.0.1',
      port: 3000,
      strictPort: true,
      ...(httpsOptions ? { https: httpsOptions } : {}),
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyRequest) => {
              proxyRequest.setHeader('origin', adminOrigin);
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
              proxyRequest.setHeader('origin', adminOrigin);
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
