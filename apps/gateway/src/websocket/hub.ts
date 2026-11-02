import type { AdminServerEvent } from '@vrcc/protocol';
import type { WebSocket } from 'ws';

export interface AdminSocketMetadata {
  socket: WebSocket;
  adminId: string;
  email: string;
  connectedAt: number;
  isAlive: boolean;
}

const MAX_QUEUED_PREVIEW_BYTES = 350_000;

/** Fan-out to authenticated dashboard sockets. Device commands never use this hub. */
export class AdminHub {
  private readonly clients = new Map<WebSocket, AdminSocketMetadata>();

  add(socket: WebSocket, adminId: string, email: string): AdminSocketMetadata {
    const metadata: AdminSocketMetadata = {
      socket,
      adminId,
      email,
      connectedAt: Date.now(),
      isAlive: true,
    };
    this.clients.set(socket, metadata);
    return metadata;
  }

  remove(socket: WebSocket): void {
    this.clients.delete(socket);
  }

  broadcast(event: AdminServerEvent): void {
    const payload = JSON.stringify(event);
    for (const metadata of this.clients.values()) {
      if (metadata.socket.readyState !== 1) continue;
      // A slow dashboard should receive the newest preview frame instead of
      // building a queue of old JPEGs that makes the preview appear delayed.
      if (
        event.kind === 'preview.frame' &&
        metadata.socket.bufferedAmount > MAX_QUEUED_PREVIEW_BYTES
      ) {
        continue;
      }
      try {
        metadata.socket.send(payload);
      } catch {
        this.clients.delete(metadata.socket);
      }
    }
  }

  sendTo(socket: WebSocket, event: AdminServerEvent): void {
    if (socket.readyState !== 1) return;
    try {
      socket.send(JSON.stringify(event));
    } catch {
      this.clients.delete(socket);
    }
  }

  markAlive(socket: WebSocket): void {
    const metadata = this.clients.get(socket);
    if (metadata) metadata.isAlive = true;
  }

  pingAll(): void {
    for (const metadata of this.clients.values()) {
      if (!metadata.isAlive) {
        try {
          metadata.socket.terminate();
        } catch {
          // Ignore.
        }
        this.clients.delete(metadata.socket);
        continue;
      }
      metadata.isAlive = false;
      try {
        metadata.socket.ping();
      } catch {
        this.clients.delete(metadata.socket);
      }
    }
  }

  get size(): number {
    return this.clients.size;
  }

  closeAll(code = 1001, reason = 'Gateway shutting down'): void {
    for (const metadata of this.clients.values()) {
      try {
        metadata.socket.close(code, reason);
      } catch {
        // Ignore.
      }
    }
    this.clients.clear();
  }
}
