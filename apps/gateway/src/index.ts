import { buildServer, listen } from './server.js';
import { loadConfig } from './config.js';
import { APP_VERSION } from './version.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const { app, ctx } = await buildServer({ config });

  const host = config.host;
  const port = config.port;

  await listen(app, host, port);

  const separator = '='.repeat(64);
  const thinSeparator = '-'.repeat(64);

  process.stdout.write(`\n${separator}\n`);
  process.stdout.write(`  VR Control Center Gateway v${APP_VERSION}\n`);
  process.stdout.write(`  Meta Quest 2 Management & Playback Controller\n`);
  process.stdout.write(`${thinSeparator}\n`);
  process.stdout.write(`  Local Gateway:    ${ctx.urls.publicUrl}\n`);
  process.stdout.write(`  Player URL:       ${config.playerUrl}\n`);
  process.stdout.write(`  WebSocket:        ${ctx.urls.wsUrl}\n`);
  if (ctx.urls.lanAddresses.length > 0) {
    process.stdout.write(`  LAN Addresses:    ${ctx.urls.lanAddresses.join(', ')}\n`);
  }
  for (const warning of ctx.urls.warnings) {
    process.stdout.write(`  WARNING:          ${warning}\n`);
  }
  process.stdout.write(`  Dashboard Origin: ${config.adminOrigin}\n`);
  process.stdout.write(`  Data Directory:   ${config.dataDir}\n`);
  process.stdout.write(`  Video Directory:  ${config.videoDir}\n`);
  process.stdout.write(`  FFmpeg/Probe:     ${ctx.media.available ? 'Available' : 'Not found (optional)'}\n`);
  process.stdout.write(`  Supabase Sync:    ${config.supabase.configured ? 'Configured' : 'Disabled (local mode)'}\n`);
  process.stdout.write(`${separator}\n`);

  if (ctx.bootstrap.status().needsBootstrap) {
    const token = ctx.bootstrap.activeToken;
    process.stdout.write(`\n[VRCC SETUP REQUIRED]\n`);
    process.stdout.write(`  No administrator accounts found.\n`);
    process.stdout.write(`  One-time setup token: ${token}\n`);
    process.stdout.write(`  Complete setup at:    ${config.adminOrigin}/setup\n`);
    process.stdout.write(`  Or run:               npm run admin:create\n\n`);
  } else {
    process.stdout.write(`\n[VRCC] Ready for Quest connections & dashboard requests.\n\n`);
  }

  const shutdown = async (signal: string) => {
    process.stdout.write(`\n[VRCC] Received ${signal}. Shutting down gracefully...\n`);
    try {
      await app.close();
      process.stdout.write('[VRCC] Gateway stopped.\n');
      process.exit(0);
    } catch (err) {
      process.stderr.write(`[VRCC] Error during shutdown: ${String(err)}\n`);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  process.stderr.write(`[VRCC FATAL] Failed to start gateway: ${String(err?.stack || err)}\n`);
  process.exit(1);
});

