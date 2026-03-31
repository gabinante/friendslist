import type { FastifyInstance } from 'fastify';
import type { LoopController } from './controller.js';
import type { StartLoopRequest } from '../../shared/types.js';

export function registerLoopRoutes(app: FastifyInstance, controller: LoopController): void {
  app.get('/api/loops', async () => {
    return controller.listLoops();
  });

  app.post<{ Body: StartLoopRequest }>('/api/loops', async (req, reply) => {
    const { sessionId, prompt, exitCondition } = req.body;
    if (!sessionId || !prompt || !exitCondition) {
      return reply.status(400).send({ error: 'sessionId, prompt, and exitCondition are required' });
    }
    return reply.status(201).send(controller.startLoop(req.body));
  });

  app.get<{ Params: { id: string } }>('/api/loops/:id', async (req, reply) => {
    const loop = controller.getLoop(req.params.id);
    if (!loop) return reply.status(404).send({ error: 'Loop not found' });
    return loop;
  });

  app.post<{ Params: { id: string } }>('/api/loops/:id/pause', async (req, reply) => {
    const loop = controller.pauseLoop(req.params.id);
    if (!loop) return reply.status(404).send({ error: 'Loop not found' });
    return loop;
  });

  app.post<{ Params: { id: string } }>('/api/loops/:id/resume', async (req, reply) => {
    const loop = controller.resumeLoop(req.params.id);
    if (!loop) return reply.status(404).send({ error: 'Loop not found' });
    return loop;
  });

  app.post<{ Params: { id: string } }>('/api/loops/:id/stop', async (req, reply) => {
    const loop = controller.stopLoop(req.params.id);
    if (!loop) return reply.status(404).send({ error: 'Loop not found' });
    return loop;
  });
}
