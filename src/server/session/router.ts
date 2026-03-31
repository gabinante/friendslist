import type { FastifyInstance } from 'fastify';
import type { SessionManager } from './manager.js';
import type { CreateSessionRequest, SendPromptRequest } from '../../shared/types.js';

export function registerSessionRoutes(app: FastifyInstance, manager: SessionManager): void {
  // List all sessions
  app.get('/api/sessions', async () => {
    return manager.listSessions();
  });

  // Create a session
  app.post<{ Body: CreateSessionRequest }>('/api/sessions', async (req, reply) => {
    const { name, alias, cwd, model } = req.body;
    if (!name || !cwd) {
      return reply.status(400).send({ error: 'name and cwd are required' });
    }
    const session = manager.createSession({ name, alias, cwd, model });
    return reply.status(201).send(session);
  });

  // Get a session
  app.get<{ Params: { id: string } }>('/api/sessions/:id', async (req, reply) => {
    const session = manager.getSession(req.params.id);
    if (!session) return reply.status(404).send({ error: 'Session not found' });
    return session;
  });

  // Update a session (name/alias)
  app.patch<{ Params: { id: string }; Body: { name?: string; alias?: string } }>(
    '/api/sessions/:id',
    async (req, reply) => {
      const session = manager.updateSession(req.params.id, req.body);
      if (!session) return reply.status(404).send({ error: 'Session not found' });
      return session;
    }
  );

  // Delete a session
  app.delete<{ Params: { id: string } }>('/api/sessions/:id', async (req, reply) => {
    const deleted = manager.deleteSession(req.params.id);
    if (!deleted) return reply.status(404).send({ error: 'Session not found' });
    return { ok: true };
  });

  // Send a prompt to a session
  app.post<{ Params: { id: string }; Body: SendPromptRequest }>(
    '/api/sessions/:id/prompt',
    async (req, reply) => {
      const { prompt } = req.body;
      if (!prompt) return reply.status(400).send({ error: 'prompt is required' });

      try {
        const result = await manager.sendPrompt(req.params.id, prompt);
        return { result };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return reply.status(500).send({ error: message });
      }
    }
  );

  // Get session output buffer
  app.get<{ Params: { id: string } }>('/api/sessions/:id/output', async (req, reply) => {
    const session = manager.getSession(req.params.id);
    if (!session) return reply.status(404).send({ error: 'Session not found' });
    return { output: manager.getOutputBuffer(req.params.id) };
  });
}
