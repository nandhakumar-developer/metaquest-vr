import { closeDatabase, openDatabase, type Database } from './db.js';
import { AdminRepository } from './adminRepo.js';
import { DeviceRepository } from './deviceRepo.js';
import { VideoRepository } from './videoRepo.js';
import { DeploymentRepository } from './deploymentRepo.js';
import { OpsRepository } from './opsRepo.js';

export class Store {
  readonly db: Database;
  readonly admins: AdminRepository;
  readonly devices: DeviceRepository;
  readonly videos: VideoRepository;
  readonly deployments: DeploymentRepository;
  readonly ops: OpsRepository;

  constructor(dataDir: string, filename = 'vrcc.sqlite') {
    this.db = openDatabase(dataDir, filename);
    this.admins = new AdminRepository(this.db);
    this.devices = new DeviceRepository(this.db);
    this.videos = new VideoRepository(this.db);
    this.deployments = new DeploymentRepository(this.db);
    this.ops = new OpsRepository(this.db);
  }

  close(): void {
    closeDatabase(this.db);
  }
}

export { openDatabase, closeDatabase };
export type { Database };
export * from './types.js';
