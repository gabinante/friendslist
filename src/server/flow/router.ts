import type { FastifyInstance } from 'fastify';
import type { FlowEngine } from './engine.js';
import type { FlowDef } from './types.js';
import { loadFlowsFromDisk } from './loader.js';

export function registerFlowRoutes(app: FastifyInstance, engine: FlowEngine): void {
  const flowsDir = new URL('../../../flows', import.meta.url).pathname;

  // Auto-load any new flow files from disk on every list request
  app.get('/api/flows', async () => {
    await loadFlowsFromDisk(engine, flowsDir);
    return engine.listFlows();
  });

  // Explicit reload endpoint
  app.post('/api/flows/reload', async () => {
    const loaded = await loadFlowsFromDisk(engine, flowsDir);
    return { loaded, flows: engine.listFlows() };
  });

  app.post<{ Body: FlowDef }>('/api/flows', async (req, reply) => {
    const { name, steps } = req.body;
    if (!name || !steps) {
      return reply.status(400).send({ error: 'name and steps are required' });
    }
    const id = engine.createFlow(req.body);
    return reply.status(201).send({ id });
  });

  app.get<{ Params: { id: string } }>('/api/flows/:id', async (req, reply) => {
    const flow = engine.getFlow(req.params.id);
    if (!flow) return reply.status(404).send({ error: 'Flow not found' });
    return flow;
  });

  app.post<{ Params: { id: string } }>('/api/flows/:id/run', async (req, reply) => {
    const flow = engine.getFlow(req.params.id);
    if (!flow) return reply.status(404).send({ error: 'Flow not found' });

    // Run async — don't block the response
    engine.runFlow(req.params.id).catch(err => {
      console.error('Flow execution error:', err);
    });

    return { status: 'started' };
  });
}
