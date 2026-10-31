import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { uuidSchema } from '@vrcc/protocol';
import type { GatewayContext } from '../context.js';
import { parseBody } from './helpers.js';
import { contentTypeForFilename, parseRangeHeader } from '../utils/httpRange.js';
import { clientIp } from './helpers.js';

/**
 * Capability-URL download endpoint for Quest devices. Large media never travels
 * over the control WebSocket. The HMAC token is scoped to one deployment.
 */
export async function registerDownloadRoutes(
  app: FastifyInstance,
  ctx: GatewayContext,
): Promise<void> {
  app.get('/api/device-downloads/:deploymentId', async (request, reply) => {
    const { deploymentId } = parseBody(
      z.object({ deploymentId: uuidSchema }),
      request.params,
    );
    const { token } = parseBody(
      z.object({ token: z.string().min(20).max(200) }),
      request.query,
    );
    const { deployment, video } = ctx.deployments.resolveDownload(deploymentId, token);
    const absolute = ctx.videos.absolutePath(video);
    const stat = await fs.stat(absolute);

    if (deployment.status === 'pending' || deployment.status === 'queued') {
      ctx.store.deployments.updateDeployment(deployment.id, {
        status: 'downloading',
        error: null,
      });
      ctx.state.logEvent(deployment.deviceId, 'video.download_started', {
        deploymentId: deployment.id,
        videoId: video.id,
        ipAddress: clientIp(request),
      });
    }

    reply.header('Accept-Ranges', 'bytes');
    reply.header('Cache-Control', 'no-store');
    reply.header('ETag', `"${video.checksum}"`);
    reply.header('Content-Type', contentTypeForFilename(video.storagePath));
    reply.header(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(video.storagePath))}`,
    );

    const parsed = parseRangeHeader(request.headers.range, stat.size);
    if (parsed.kind === 'invalid') {
      reply.header('Content-Range', `bytes */${stat.size}`);
      return reply
        .code(416)
        .send({ error: { code: 'RANGE_NOT_SATISFIABLE', message: 'Invalid byte range' } });
    }
    if (parsed.kind === 'range') {
      const { start, end } = parsed.range;
      reply.code(206);
      reply.header('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      reply.header('Content-Length', end - start + 1);
      return reply.send(createReadStream(absolute, { start, end }));
    }
    reply.header('Content-Length', stat.size);
    return reply.send(createReadStream(absolute));
  });
}
