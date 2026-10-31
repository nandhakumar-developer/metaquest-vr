import { parseAdminEvent, type AdminServerEvent } from '@vrcc/protocol';
import { apiRequest } from './client.js';

export type EventListener = (event: AdminServerEvent) => void;

export class GatewayWebSocketClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<EventListener>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private isIntentionalClose = false;
  private onStatusChangeCallback: ((connected: boolean) => void) | null = null;

  constructor(private readonly getWsBaseUrl: () => string) {}

  onStatusChange(callback: (connected: boolean) => void): void {
    this.onStatusChangeCallback = callback;
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async connect(): Promise<void> {
    this.isIntentionalClose = false;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      // 1. Obtain a one-time WS ticket from gateway
      const ticketRes = await apiRequest<{ ticket: string; expiresAt: string }>('/api/auth/ws-ticket', {
        method: 'POST',
      });

      const baseUrl = this.getWsBaseUrl();
      const wsUrl = `${baseUrl.replace(/^http/, 'ws')}/ws?role=admin&ticket=${encodeURIComponent(ticketRes.ticket)}`;

      const socket = new WebSocket(wsUrl);
      this.ws = socket;

      socket.onopen = () => {
        this.onStatusChangeCallback?.(true);
        this.startPing();
      };

      socket.onmessage = (event) => {
        if (typeof event.data === 'string') {
          const parsed = parseAdminEvent(event.data);
          if (parsed) {
            for (const listener of this.listeners) {
              try {
                listener(parsed);
              } catch (err) {
                console.error('[AdminWS] Listener error', err);
              }
            }
          }
        }
      };

      socket.onclose = () => {
        this.stopPing();
        this.onStatusChangeCallback?.(false);
        if (!this.isIntentionalClose) {
          this.scheduleReconnect();
        }
      };

      socket.onerror = (err) => {
        console.warn('[AdminWS] Socket error', err);
        socket.close();
      };
    } catch {
      this.onStatusChangeCallback?.(false);
      if (!this.isIntentionalClose) {
        this.scheduleReconnect();
      }
    }
  }

  disconnect(): void {
    this.isIntentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.onStatusChangeCallback?.(false);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, 2500);
  }

  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ kind: 'ping' }));
      }
    }, 25000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}

