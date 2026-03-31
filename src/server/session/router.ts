import type { FastifyInstance } from 'fastify';
import type { SessionManager } from './manager.js';
import type { CreateSessionRequest, SendPromptRequest } from '../../shared/types.js';
import { getSessionHistory } from './history.js';

export function registerSessionRoutes(app: FastifyInstance, manager: SessionManager): void {
  // List sessions (optionally filter by tracked status)
  app.get<{ Querystring: { tracked?: string } }>('/api/sessions', async (req) => {
    const { tracked } = req.query;
    if (tracked !== undefined) {
      return manager.listSessions({ tracked: tracked !== 'false' });
    }
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

  // Untrack a session (soft delete — keeps history)
  app.post<{ Params: { id: string } }>('/api/sessions/:id/untrack', async (req, reply) => {
    const session = manager.untrackSession(req.params.id);
    if (!session) return reply.status(404).send({ error: 'Session not found' });
    return session;
  });

  // Re-track a session
  app.post<{ Params: { id: string } }>('/api/sessions/:id/track', async (req, reply) => {
    const session = manager.trackSession(req.params.id);
    if (!session) return reply.status(404).send({ error: 'Session not found' });
    return session;
  });

  // Send a prompt to a session
  app.post<{ Params: { id: string }; Body: SendPromptRequest }>(
    '/api/sessions/:id/prompt',
    async (req, reply) => {
      const { prompt, images } = req.body;
      if (!prompt) return reply.status(400).send({ error: 'prompt is required' });

      try {
        const result = await manager.sendPrompt(req.params.id, prompt, images);
        return { result };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return reply.status(500).send({ error: message });
      }
    }
  );

  // Get session chat history from Claude CLI JSONL files
  app.get<{ Params: { id: string } }>('/api/sessions/:id/history', async (req, reply) => {
    const info = manager.getSessionHistoryInfo(req.params.id);
    if (!info) return reply.status(404).send({ error: 'Session not found' });
    if (!info.realClaudeSessionId) return { messages: [] };
    return { messages: getSessionHistory(info.realClaudeSessionId, info.cwd) };
  });

  // Get session output buffer
  app.get<{ Params: { id: string } }>('/api/sessions/:id/output', async (req, reply) => {
    const session = manager.getSession(req.params.id);
    if (!session) return reply.status(404).send({ error: 'Session not found' });
    return { output: manager.getOutputBuffer(req.params.id) };
  });
}
