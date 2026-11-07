import type { FastifyBaseLogger } from 'fastify';
import type { GatewayConfig } from './config.js';
import { ensureDirectories, resolveGatewayUrls } from './config.js';
import { Store } from './database/index.js';
import { BootstrapService } from './auth/bootstrap.js';
import { AdminAuthService } from './auth/adminAuth.js';
import { DeviceRegistry } from './devices/registry.js';
import { AdminHub } from './websocket/hub.js';
import { CloudSyncService } from './services/cloudSync.js';
import { DeviceStateService } from './devices/stateService.js';
import { CommandService } from './commands/service.js';
import { MediaService } from './services/media.js';
import { DeploymentService } from './transfers/deploymentService.js';
import { PairingService } from './pairing/service.js';
import { PreviewService } from './preview/service.js';
import { VideoService } from './videos/service.js';
import { SnapshotService } from './services/snapshot.js';
import { PlayerMediaService } from './services/playerMedia.js';
import { GroupPlaybackService } from './services/groupPlayback.js';
import { DeviceSocketHandler } from './websocket/deviceSocket.js';
import { OfflineMonitor } from './devices/offlineMonitor.js';
import { MaintenanceService } from './services/maintenance.js';
import { GatewayWebSocketServer } from './websocket/server.js';

export interface GatewayContext {
  config: GatewayConfig;
  store: Store;
  bootstrap: BootstrapService;
  auth: AdminAuthService;
  registry: DeviceRegistry;
  hub: AdminHub;
  cloud: CloudSyncService;
  state: DeviceStateService;
  commands: CommandService;
  media: MediaService;
  deployments: DeploymentService;
  pairing: PairingService;
  preview: PreviewService;
  videos: VideoService;
  playerMedia: PlayerMediaService;
  groupPlayback: GroupPlaybackService;
  snapshot: SnapshotService;
  deviceHandler: DeviceSocketHandler;
  offlineMonitor: OfflineMonitor;
  maintenance: MaintenanceService;
  wsServer: GatewayWebSocketServer;
  urls: {
    publicUrl: string;
    wsUrl: string;
    lanAddresses: string[];
    secure: boolean;
    warnings: string[];
  };
  close(): void;
}

export async function createContext(
  config: GatewayConfig,
  logger: FastifyBaseLogger,
): Promise<GatewayContext> {
  ensureDirectories(config);
  const store = new Store(config.dataDir);
  const urls = resolveGatewayUrls(config);
  const secure = Boolean(config.tlsCertPath && config.tlsKeyPath);

  const bootstrap = new BootstrapService(store.admins, config.dataDir);
  const auth = new AdminAuthService(store.admins, store.ops, bootstrap, config, secure);
  const registry = new DeviceRegistry();
  const hub = new AdminHub();
  const cloud = new CloudSyncService(hub);
  const state = new DeviceStateService(
    store.devices,
    store.videos,
    store.ops,
    registry,
    hub,
    cloud,
  );
  const commands = new CommandService(
    config,
    store.ops,
    store.devices,
    registry,
    state,
    hub,
    cloud,
  );
  const media = new MediaService(config);
  await media.detect();
  const deployments = new DeploymentService(
    config,
    store.deployments,
    store.devices,
    store.videos,
    store.ops,
    registry,
    state,
    hub,
    cloud,
    urls.publicUrl,
  );
  const pairingAdminUrl =
    config.adminDistDir !== null ? urls.publicUrl : config.adminOrigin;
  const pairing = new PairingService(
    config,
    store.db,
    store.devices,
    store.ops,
    hub,
    cloud,
    urls.wsUrl,
    pairingAdminUrl,
  );
  const preview = new PreviewService(config, store.devices, store.ops, registry, commands, state, hub);
  const videos = new VideoService(
    config,
    store.videos,
    store.deployments,
    store.ops,
    hub,
    cloud,
    media,
    registry,
  );
  const playerMedia = new PlayerMediaService(
    store.devices,
    store.videos,
    pairing,
    store.ops,
    urls.publicUrl,
    config.heartbeatIntervalMs,
  );
  const groupPlayback = new GroupPlaybackService(
    store.devices,
    store.videos,
    registry,
    state,
    commands,
    hub,
    store.ops,
  );
  const snapshot = new SnapshotService(
    state,
    videos,
    deployments,
    pairing,
    store.ops,
    cloud,
    groupPlayback,
  );
  const deviceHandler = new DeviceSocketHandler(
    config,
    store.devices,
    registry,
    state,
    commands,
    pairing,
    preview,
    deployments,
    logger,
  );
  const wsServer = new GatewayWebSocketServer({
    config,
    auth,
    hub,
    snapshot,
    deviceHandler,
    logger,
  });
  const offlineMonitor = new OfflineMonitor(
    config,
    store.devices,
    registry,
    state,
    commands,
    preview,
    logger,
  );
  const maintenance = new MaintenanceService(config, store.ops, store.devices, pairing, logger);

  return {
    config,
    store,
    bootstrap,
    auth,
    registry,
    hub,
    cloud,
    state,
    commands,
    media,
    deployments,
    pairing,
    preview,
    videos,
    playerMedia,
    groupPlayback,
    snapshot,
    deviceHandler,
    offlineMonitor,
    maintenance,
    wsServer,
    urls,
    close(): void {
      groupPlayback.dispose();
      offlineMonitor.stop();
      maintenance.stop();
      cloud.stop();
      wsServer.close();
      store.close();
    },
  };
}
