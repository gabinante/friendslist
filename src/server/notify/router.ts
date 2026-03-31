import type { FastifyInstance } from 'fastify';
import type { Notifier } from './notifier.js';

export function registerNotifyRoutes(app: FastifyInstance, notifier: Notifier): void {
  // Test notification
  app.post<{ Body: { title: string; body: string; level?: 'info' | 'success' | 'error' } }>(
    '/api/notify/test',
    async (req) => {
      await notifier.notify({
        title: req.body.title ?? 'Test',
        body: req.body.body ?? 'This is a test notification',
        level: req.body.level ?? 'info',
      });
      return { ok: true };
    }
  );
}
