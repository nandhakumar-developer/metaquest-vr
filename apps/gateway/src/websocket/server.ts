import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { PROTOCOL_VERSION, WS_CLOSE_CODES } from '@vrcc/protocol';
import type { FastifyBaseLogger } from 'fastify';
import type { GatewayConfig } from '../config.js';
import type { AdminAuthService } from '../auth/adminAuth.js';
import type { AdminHub } from './hub.js';
import type { SnapshotService } from '../services/snapshot.js';
import type { DeviceSocketHandler } from './deviceSocket.js';
import { isOriginAllowed } from '../security/origin.js';
import { WS_PATH } from '@vrcc/protocol';

interface UpgradeContext {
  request: IncomingMessage;
  socket: Duplex;
  head: Buffer;
}

export interface GatewayWebSocketDeps {
  config: GatewayConfig;
  auth: AdminAuthService;
  hub: AdminHub;
  snapshot: SnapshotService;
  deviceHandler: DeviceSocketHandler;
  logger: FastifyBaseLogger;
}

export class GatewayWebSocketServer {
  private wss: WebSocketServer | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private httpServer: HttpServer | null = null;

  constructor(private readonly deps: GatewayWebSocketDeps) {}

  attach(httpServer: HttpServer): void {
    this.httpServer = httpServer;
    const wss = new WebSocketServer({
      noServer: true,
      maxPayload: 1_500_000,
      perMessageDeflate: false,
      clientTracking: true,
    });
    this.wss = wss;
    wss.on('error', (error) => {
      this.deps.logger.error({ err: error }, 'WebSocket server error');
    });
    httpServer.on('upgrade', (request, socket, head) => {
      this.handleUpgrade({ request, socket, head }).catch((error: unknown) => {
        this.deps.logger.warn({ err: error }, 'WebSocket upgrade failed');
        rejectUpgrade(socket, 500, 'Upgrade failed');
      });
    });
    this.pingTimer = setInterval(() => {
      this.deps.hub.pingAll();
      this.deps.hub.broadcast({
        kind: 'gateway.ping',
        serverTime: new Date().toISOString(),
      });
    }, 30_000);
    this.pingTimer.unref?.();
  }

  private async handleUpgrade(context: UpgradeContext): Promise<void> {
    const { request, socket, head } = context;
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    if (url.pathname !== WS_PATH) {
      rejectUpgrade(socket, 404, 'Not found');
      return;
    }
    const role = url.searchParams.get('role');
    if (role === 'admin') {
      const origin = request.headers.origin;
      if (!isOriginAllowed(origin, this.deps.config, request.headers.host)) {
        rejectUpgrade(socket, 403, 'Origin not allowed');
        return;
      }
      const authenticated = this.deps.auth.tickets.consume(url.searchParams.get('ticket'));
      if (!authenticated) {
        rejectUpgrade(socket, 401, 'Invalid or expired WebSocket ticket');
        return;
      }
      this.wss?.handleUpgrade(request, socket, head, (ws) => {
        this.onAdminConnection(ws, request, authenticated.identity.email, authenticated.identity.id);
      });
      return;
    }
    if (role === 'device') {
      this.wss?.handleUpgrade(request, socket, head, (ws) => {
        this.deps.deviceHandler.handle(ws, request);
      });
      return;
    }
    rejectUpgrade(socket, 400, 'Missing or invalid role');
  }

  private onAdminConnection(
    socket: WebSocket,
    request: IncomingMessage,
    email: string,
    adminId: string,
  ): void {
    this.deps.hub.add(socket, adminId, email);
    this.deps.logger.info(
      { email, ip: request.socket.remoteAddress },
      'Admin dashboard WebSocket connected',
    );
    this.deps.hub.sendTo(socket, {
      kind: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      serverTime: new Date().toISOString(),
      snapshot: this.deps.snapshot.build(),
    });

    let messages = 0;
    const windowStart = Date.now();
    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        socket.close(WS_CLOSE_CODES.invalidMessage, 'Binary messages are not supported');
        return;
      }
      if (Date.now() - windowStart > 60_000) messages = 0;
      messages += 1;
      if (messages > 600) {
        socket.close(WS_CLOSE_CODES.rateLimited, 'Too many messages');
        return;
      }
      try {
        const parsed = JSON.parse(data.toString()) as { kind?: string };
        if (parsed.kind === 'ping') {
          this.deps.hub.sendTo(socket, {
            kind: 'gateway.ping',
            serverTime: new Date().toISOString(),
          });
        } else if (parsed.kind === 'pong') {
          this.deps.hub.markAlive(socket);
        }
      } catch {
        // Ignore malformed admin client frames; commands are REST-only.
      }
    });
    socket.on('pong', () => this.deps.hub.markAlive(socket));
    socket.on('close', () => {
      this.deps.hub.remove(socket);
      this.deps.logger.info({ email }, 'Admin dashboard WebSocket disconnected');
    });
    socket.on('error', (error) => {
      this.deps.logger.warn({ err: error, email }, 'Admin WebSocket error');
      this.deps.hub.remove(socket);
    });
  }

  close(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.deps.hub.closeAll(WS_CLOSE_CODES.serverShutdown, 'Gateway shutting down');
    this.wss?.close();
    this.wss = null;
    if (this.httpServer) {
      this.httpServer.removeAllListeners('upgrade');
      this.httpServer = null;
    }
  }
}

function rejectUpgrade(socket: Duplex, status: number, message: string): void {
  try {
    const body = `${status} ${message}`;
    socket.write(
      `HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(
        body,
      )}\r\n\r\n${body}`,
    );
  } catch {
    // Ignore.
  }
  socket.destroy();
}
