import type { AdminSnapshot } from '@vrcc/protocol';
import type { OpsRepository } from '../database/opsRepo.js';
import type { DeviceStateService } from '../devices/stateService.js';
import type { VideoService } from '../videos/service.js';
import type { DeploymentService } from '../transfers/deploymentService.js';
import type { PairingService } from '../pairing/service.js';
import type { CloudSyncService } from '../services/cloudSync.js';
import type { GroupPlaybackService } from '../services/groupPlayback.js';
import { toCommandDto } from '../commands/service.js';

export class SnapshotService {
  constructor(
    private readonly state: DeviceStateService,
    private readonly videos: VideoService,
    private readonly deployments: DeploymentService,
    private readonly pairing: PairingService,
    private readonly ops: OpsRepository,
    private readonly cloud: CloudSyncService,
    private readonly group: GroupPlaybackService,
  ) {}

  build(): AdminSnapshot {
    return {
      devices: this.state.listDevices(),
      videos: this.videos.list(),
      deployments: this.deployments.list({ limit: 200 }),
      pairingRequests: this.pairing.listPending(),
      commands: this.ops
        .listCommands({ pageSize: 50 })
        .items.map((record) => toCommandDto(record)),
      group: this.group.getState(),
      settings: this.ops.getSettings(),
      cloud: this.cloud.status(),
    };
  }
}
