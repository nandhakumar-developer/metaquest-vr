import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { MIN_PASSWORD_LENGTH } from '../auth/password.js';
import type { GatewayContext } from '../context.js';
import { unauthorized } from '../utils/errors.js';
import { clientIp, parseBody, requireSession } from './helpers.js';

const emailSchema = z.string().trim().min(3).max(254);
const passwordSchema = z.string().min(MIN_PASSWORD_LENGTH).max(256);

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
});

const bootstrapSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(80).optional(),
  token: z.string().min(10).max(200),
});

const supabaseSchema = z.object({
  accessToken: z.string().min(20).max(8192),
});

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: passwordSchema,
});

export async function registerAuthRoutes(app: FastifyInstance, ctx: GatewayContext): Promise<void> {
  app.post(
    '/api/auth/bootstrap',
    {
      config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
    },
    async (request, reply) => {
      const body = parseBody(bootstrapSchema, request.body);
      const result = await ctx.auth.bootstrapAdmin({
        email: body.email,
        password: body.password,
        displayName: body.displayName ?? body.email,
        token: body.token,
        ip: clientIp(request),
      });
      ctx.auth.sessions.setSessionCookie(reply, result.token, result.expiresAt);
      return reply.code(201).send({
        identity: result.identity,
        csrfToken: result.csrfToken,
        expiresAt: result.expiresAt,
      });
    },
  );

  app.post(
    '/api/auth/login',
    {
      config: { rateLimit: { max: 12, timeWindow: '5 minutes' } },
    },
    async (request, reply) => {
      const body = parseBody(loginSchema, request.body);
      const result = await ctx.auth.login({
        email: body.email,
        password: body.password,
        ip: clientIp(request),
      });
      ctx.auth.sessions.setSessionCookie(reply, result.token, result.expiresAt);
      return reply.send({
        identity: result.identity,
        csrfToken: result.csrfToken,
        expiresAt: result.expiresAt,
      });
    },
  );

  app.post(
    '/api/auth/supabase',
    {
      config: { rateLimit: { max: 20, timeWindow: '5 minutes' } },
    },
    async (request, reply) => {
      const body = parseBody(supabaseSchema, request.body);
      const result = await ctx.auth.exchangeSupabaseToken(
        body.accessToken,
        clientIp(request),
      );
      ctx.auth.sessions.setSessionCookie(reply, result.token, result.expiresAt);
      return reply.send({
        identity: result.identity,
        csrfToken: result.csrfToken,
        expiresAt: result.expiresAt,
      });
    },
  );

  app.get('/api/auth/session', async (request) => {
    const authenticated = ctx.auth.sessions.authenticateRequest(request);
    if (!authenticated) throw unauthorized('No active session');
    return {
      identity: authenticated.identity,
      csrfToken: ctx.auth.sessions.issueCsrfToken(authenticated.session),
      expiresAt: authenticated.session.expiresAt,
    };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const authenticated = ctx.auth.sessions.authenticateRequest(request);
    if (authenticated) {
      ctx.auth.sessions.requireCsrf(request, authenticated);
      ctx.store.ops.addAudit({
        actor: authenticated.admin.email,
        action: 'admin.logout',
        entityType: 'admin',
        entityId: authenticated.admin.id,
        payload: {},
      });
    }
    ctx.auth.sessions.logout(request);
    ctx.auth.sessions.clearSessionCookie(reply);
    return reply.code(204).send();
  });

  app.post('/api/auth/ws-ticket', async (request) => {
    const authenticated = requireSession(ctx, request);
    ctx.auth.sessions.requireCsrf(request, authenticated);
    return ctx.auth.issueWsTicket(authenticated);
  });

  app.post('/api/auth/password', async (request, reply) => {
    const authenticated = requireSession(ctx, request, { operator: true });
    const body = parseBody(passwordChangeSchema, request.body);
    await ctx.auth.changePassword(
      authenticated,
      body.currentPassword,
      body.newPassword,
    );
    return reply.code(204).send();
  });
}
