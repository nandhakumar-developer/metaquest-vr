import { createHash, randomBytes } from 'node:crypto';
import WebSocket from 'ws';
import { DEFAULT_CAPABILITIES, type PlaybackSnapshot } from '@vrcc/shared-types';
import {
  makeMessage,
  parseDeviceCommandMessage,
  type DeviceCommandMessage,
} from '@vrcc/protocol';

interface SimulatorOptions {
  gatewayHttp: string;
  gatewayWs: string;
  name: string;
  model: string;
  deviceUuid?: string;
  secretHex?: string;
  autoPair?: boolean;
}

function parseCliArgs(): SimulatorOptions {
  const args = process.argv.slice(2);
  const opts: SimulatorOptions = {
    gatewayHttp: 'http://localhost:4000',
    gatewayWs: 'ws://localhost:4000/ws',
    name: 'Meta Quest 2 (Simulated)',
    model: 'Meta Quest 2',
    autoPair: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--http' && args[i + 1]) opts.gatewayHttp = args[++i];
    else if (arg === '--ws' && args[i + 1]) opts.gatewayWs = args[++i];
    else if (arg === '--name' && args[i + 1]) opts.name = args[++i];
    else if (arg === '--model' && args[i + 1]) opts.model = args[++i];
    else if (arg === '--uuid' && args[i + 1]) opts.deviceUuid = args[++i];
    else if (arg === '--secret' && args[i + 1]) opts.secretHex = args[++i];
  }
  return opts;
}

// Minimal valid 16x16 JPEG base64 payload for preview frame
const SAMPLE_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

class SimulatedQuest {
  private secretHex: string;
  private secretHash: string;
  private deviceUuid: string | null = null;
  private deviceId: string | null = null;
  private ws: WebSocket | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private playbackInterval: NodeJS.Timeout | null = null;
  private previewInterval: NodeJS.Timeout | null = null;
  private batteryLevel = 92;
  private charging = false;
  private uptimeSeconds = 120;
  private localVideos: Array<{
    videoId: string;
    name: string;
    filename: string;
    sizeBytes: number;
    checksum: string;
    durationSeconds: number | null;
    downloadedAt: string | null;
  }> = [];

  private playback: PlaybackSnapshot = {
    state: 'idle',
    videoId: null,
    videoName: null,
    positionSeconds: 0,
    durationSeconds: null,
    volume: 0.8,
    positionConfirmed: true,
    error: null,
    updatedAt: new Date().toISOString(),
  };

  constructor(private readonly opts: SimulatorOptions) {
    if (opts.secretHex) {
      this.secretHex = opts.secretHex;
    } else {
      this.secretHex = randomBytes(32).toString('hex');
    }
    this.secretHash = createHash('sha256').update(this.secretHex).digest('hex');
    if (opts.deviceUuid) {
      this.deviceUuid = opts.deviceUuid;
    }
  }

  async start(): Promise<void> {
    process.stdout.write(`\n=== Simulated Meta Quest 2 Initializing ===\n`);
    process.stdout.write(`Device Name:  ${this.opts.name}\n`);
    process.stdout.write(`Gateway HTTP: ${this.opts.gatewayHttp}\n`);
    process.stdout.write(`Gateway WS:   ${this.opts.gatewayWs}\n`);

    if (!this.deviceUuid) {
      await this.performPairingFlow();
    } else {
      process.stdout.write(`Using existing Device UUID: ${this.deviceUuid}\n`);
    }

    this.connectWebSocket();
  }

  private async performPairingFlow(): Promise<void> {
    process.stdout.write(`\nInitiating pairing challenge with gateway...\n`);
    const challengeRes = await fetch(`${this.opts.gatewayHttp}/api/devices/pairing-sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secretHash: this.secretHash,
        model: this.opts.model,
        appVersion: '1.0.0',
      }),
    });

    if (!challengeRes.ok) {
      throw new Error(`Failed to request pairing challenge: ${challengeRes.status} ${await challengeRes.text()}`);
    }

    const challenge = (await challengeRes.json()) as {
      id: string;
      code: string;
      pollToken: string;
      pairingUri: string;
    };

    process.stdout.write(`\n------------------------------------------------------------\n`);
    process.stdout.write(`  PAIRING CODE: [ ${challenge.code} ]\n`);
    process.stdout.write(`  Enter this 6-digit code in the VR Control Center dashboard\n`);
    process.stdout.write(`  or open: ${this.opts.gatewayHttp}/pair?code=${challenge.code}\n`);
    process.stdout.write(`------------------------------------------------------------\n\n`);
    process.stdout.write(`Waiting for administrator to confirm pairing...\n`);

    const pollInterval = 1500;
    while (!this.deviceUuid) {
      await new Promise((r) => setTimeout(r, pollInterval));
      const claimRes = await fetch(
        `${this.opts.gatewayHttp}/api/devices/pairing-sessions/${challenge.id}/claim`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pollToken: challenge.pollToken }),
        },
      );

      if (!claimRes.ok) continue;
      const claim = (await claimRes.json()) as {
        status: string;
        device?: { deviceId: string; deviceUuid: string; name: string; wsUrl: string };
      };

      if (claim.status === 'paired' && claim.device) {
        this.deviceUuid = claim.device.deviceUuid;
        this.deviceId = claim.device.deviceId;
        if (claim.device.wsUrl) {
          this.opts.gatewayWs = claim.device.wsUrl;
        }
        process.stdout.write(
          `\nPairing confirmed! Paired as: "${claim.device.name}" (UUID: ${this.deviceUuid})\n`,
        );
        break;
      } else if (claim.status === 'expired' || claim.status === 'cancelled') {
        throw new Error(`Pairing challenge ${claim.status}. Please restart the simulator.`);
      }
    }
  }

  private connectWebSocket(): void {
    if (!this.deviceUuid) return;
    process.stdout.write(`Connecting to Gateway WebSocket: ${this.opts.gatewayWs} ...\n`);

    const ws = new WebSocket(this.opts.gatewayWs);
    this.ws = ws;

    ws.on('open', () => {
      process.stdout.write(`WebSocket connected. Sending DEVICE_AUTH...\n`);
      this.send('DEVICE_AUTH', {
        secret: this.secretHex,
        appVersion: '1.0.0',
        model: this.opts.model,
        capabilities: DEFAULT_CAPABILITIES,
      });
    });

    ws.on('message', (data: WebSocket.RawData) => {
      const parsed = parseDeviceCommandMessage(data.toString());
      if (!parsed.ok) {
        process.stdout.write(`[WS] Unrecognized or invalid command: ${data.toString()}\n`);
        return;
      }
      this.handleCommand(parsed.data);
    });

    ws.on('close', (code, reason) => {
      process.stdout.write(`WebSocket closed (code: ${code}, reason: ${reason.toString() || 'none'})\n`);
      this.cleanup();
      process.stdout.write(`Reconnecting in 3 seconds...\n`);
      setTimeout(() => this.connectWebSocket(), 3000);
    });

    ws.on('error', (err) => {
      process.stderr.write(`WebSocket error: ${String(err)}\n`);
    });
  }

  private handleCommand(cmd: DeviceCommandMessage): void {
    process.stdout.write(`[RECV] ${cmd.type} (id: ${cmd.messageId})\n`);

    switch (cmd.type) {
      case 'AUTH_OK': {
        process.stdout.write(`Authentication successful! Gateway registered headset.\n`);
        this.startHeartbeat();
        this.sendDeviceStatus();
        this.sendInventory();
        break;
      }

      case 'AUTH_ERROR': {
        process.stderr.write(`Authentication failed: ${JSON.stringify(cmd.payload)}\n`);
        break;
      }

      case 'STATUS_REQUEST': {
        this.sendDeviceStatus();
        break;
      }

      case 'PING': {
        this.send('PONG', {
          serverTime: new Date().toISOString(),
          clientTime: new Date().toISOString(),
        });
        break;
      }

      case 'PLAY': {
        this.playback.state = 'playing';
        if (cmd.payload.positionSeconds !== undefined) {
          this.playback.positionSeconds = cmd.payload.positionSeconds;
        }
        this.playback.updatedAt = new Date().toISOString();
        this.sendAck(cmd.messageId, true);
        this.sendPlaybackEvent('playing');
        this.startPlaybackTimer();
        break;
      }

      case 'PAUSE': {
        this.playback.state = 'paused';
        this.playback.updatedAt = new Date().toISOString();
        this.sendAck(cmd.messageId, true);
        this.sendPlaybackEvent('paused');
        this.stopPlaybackTimer();
        break;
      }

      case 'STOP': {
        this.playback.state = 'idle';
        this.playback.positionSeconds = 0;
        this.playback.updatedAt = new Date().toISOString();
        this.sendAck(cmd.messageId, true);
        this.sendPlaybackEvent('stopped');
        this.stopPlaybackTimer();
        break;
      }

      case 'SEEK': {
        this.playback.positionSeconds = cmd.payload.positionSeconds;
        this.playback.updatedAt = new Date().toISOString();
        this.sendAck(cmd.messageId, true);
        this.sendPlaybackEvent(this.playback.state === 'playing' ? 'playing' : 'paused');
        break;
      }

      case 'SET_VOLUME': {
        this.playback.volume = cmd.payload.volume;
        this.playback.updatedAt = new Date().toISOString();
        this.sendAck(cmd.messageId, true);
        break;
      }

      case 'LOAD_VIDEO': {
        const found = this.localVideos.find((v) => v.videoId === cmd.payload.videoId);
        this.playback.videoId = cmd.payload.videoId;
        this.playback.videoName = found ? found.name : 'Unknown Video';
        this.playback.positionSeconds = 0;
        this.playback.durationSeconds = found?.durationSeconds ?? 180;
        this.playback.state = 'ready';
        this.playback.updatedAt = new Date().toISOString();
        this.sendAck(cmd.messageId, true);
        this.sendPlaybackEvent('ready');
        break;
      }

      case 'REQUEST_PREVIEW': {
        this.sendAck(cmd.messageId, true);
        this.startPreview();
        break;
      }

      case 'STOP_PREVIEW': {
        this.sendAck(cmd.messageId, true);
        this.stopPreview();
        break;
      }

      case 'DOWNLOAD_VIDEO': {
        this.sendAck(cmd.messageId, true);
        void this.simulateDownload(cmd.payload);
        break;
      }

      case 'CANCEL_DOWNLOAD': {
        this.sendAck(cmd.messageId, true);
        break;
      }

      case 'CONFIG_UPDATE': {
        process.stdout.write(`Config updated from gateway: ${JSON.stringify(cmd.payload)}\n`);
        break;
      }

      case 'PROTOCOL_ERROR': {
        process.stderr.write(`Protocol error from gateway: ${JSON.stringify(cmd.payload)}\n`);
        break;
      }
    }
  }

  private send(type: any, payload: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.deviceUuid) return;
    const msg = makeMessage(type, this.deviceUuid, payload);
    this.ws.send(JSON.stringify(msg));
  }

  private sendAck(commandId: string, success: boolean): void {
    this.send('COMMAND_ACK', {
      commandId,
      success,
      playback: this.playback,
    });
  }

  private sendPlaybackEvent(
    event: 'loading' | 'buffering' | 'ready' | 'playing' | 'paused' | 'stopped' | 'ended' | 'error',
  ): void {
    this.send('PLAYBACK_EVENT', {
      event,
      videoId: this.playback.videoId,
      videoName: this.playback.videoName,
      positionSeconds: this.playback.positionSeconds,
      durationSeconds: this.playback.durationSeconds,
      volume: this.playback.volume,
      error: null,
    });
  }

  private sendDeviceStatus(): void {
    this.uptimeSeconds += 5;
    this.send('DEVICE_STATUS', {
      appVersion: '1.0.0',
      model: this.opts.model,
      batteryLevel: this.batteryLevel,
      charging: this.charging,
      playback: this.playback,
      inventoryCount: this.localVideos.length,
      storage: {
        freeBytes: 48 * 1024 * 1024 * 1024,
        totalBytes: 128 * 1024 * 1024 * 1024,
      },
      uptimeSeconds: this.uptimeSeconds,
      capabilities: DEFAULT_CAPABILITIES,
    });
  }

  private sendInventory(): void {
    this.send('VIDEO_INVENTORY', {
      videos: this.localVideos,
    });
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      this.sendDeviceStatus();
    }, 5000);
  }

  private startPlaybackTimer(): void {
    if (this.playbackInterval) clearInterval(this.playbackInterval);
    this.playbackInterval = setInterval(() => {
      if (this.playback.state !== 'playing') return;
      this.playback.positionSeconds += 1;
      this.playback.updatedAt = new Date().toISOString();
      if (
        this.playback.durationSeconds &&
        this.playback.positionSeconds >= this.playback.durationSeconds
      ) {
        this.playback.state = 'ended';
        this.playback.positionSeconds = this.playback.durationSeconds;
        this.sendPlaybackEvent('ended');
        this.stopPlaybackTimer();
      }
    }, 1000);
  }

  private stopPlaybackTimer(): void {
    if (this.playbackInterval) {
      clearInterval(this.playbackInterval);
      this.playbackInterval = null;
    }
  }

  private startPreview(): void {
    if (this.previewInterval) clearInterval(this.previewInterval);
    process.stdout.write(`Starting 12 FPS snapshot preview generator...\n`);
    this.previewInterval = setInterval(() => {
      this.send('PREVIEW_SIGNAL', {
        mode: 'snapshot',
        mimeType: 'image/jpeg',
        dataBase64: SAMPLE_JPEG_BASE64,
        width: 16,
        height: 16,
        capturedAt: new Date().toISOString(),
        includesUserInterface: false,
      });

      // Also send mock head orientation pose
      this.send('HEAD_POSE', {
        rotation: { x: 0, y: Math.sin(Date.now() / 3000) * 0.2, z: 0, w: 1 },
        position: { x: 0, y: 1.6, z: 0 },
        sampleTimestamp: new Date().toISOString(),
        sessionActive: true,
      });
    }, Math.round(1000 / 12));
  }

  private stopPreview(): void {
    if (this.previewInterval) {
      clearInterval(this.previewInterval);
      this.previewInterval = null;
      process.stdout.write(`Stopped snapshot preview generator.\n`);
    }
  }

  private async simulateDownload(payload: {
    deploymentId: string;
    videoId: string;
    name: string;
    filename: string;
    url: string;
    checksum: string;
    sizeBytes: number;
    durationSeconds: number | null;
  }): Promise<void> {
    process.stdout.write(`[DOWNLOAD] Starting download of "${payload.name}" (${payload.sizeBytes} bytes)\n`);

    const steps = 10;
    const chunkSize = Math.floor(payload.sizeBytes / steps);

    for (let step = 1; step <= steps; step++) {
      await new Promise((r) => setTimeout(r, 400));
      const received = step === steps ? payload.sizeBytes : step * chunkSize;
      const progress = received / payload.sizeBytes;

      this.send('VIDEO_DOWNLOAD_PROGRESS', {
        deploymentId: payload.deploymentId,
        videoId: payload.videoId,
        bytesReceived: received,
        totalBytes: payload.sizeBytes,
        progress,
        throughputBytesPerSecond: chunkSize / 0.4,
      });
    }

    process.stdout.write(`[DOWNLOAD] Video downloaded and checksum verified.\n`);
    this.send('VIDEO_READY', {
      deploymentId: payload.deploymentId,
      videoId: payload.videoId,
      checksum: payload.checksum,
      sizeBytes: payload.sizeBytes,
      checksumVerified: true,
      localFilename: payload.filename,
    });

    this.localVideos.push({
      videoId: payload.videoId,
      name: payload.name,
      filename: payload.filename,
      sizeBytes: payload.sizeBytes,
      checksum: payload.checksum,
      durationSeconds: payload.durationSeconds,
      downloadedAt: new Date().toISOString(),
    });

    this.sendInventory();
  }

  private cleanup(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.playbackInterval) clearInterval(this.playbackInterval);
    if (this.previewInterval) clearInterval(this.previewInterval);
  }
}

const simulator = new SimulatedQuest(parseCliArgs());
simulator.start().catch((err) => {
  process.stderr.write(`Simulator failed: ${String(err?.message || err)}\n`);
  process.exit(1);
});

