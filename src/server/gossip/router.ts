import type { FastifyInstance } from 'fastify';
import type { MessageBus } from './bus.js';
import type { SendGossipRequest } from '../../shared/types.js';

export function registerGossipRoutes(app: FastifyInstance, bus: MessageBus): void {
  app.get<{ Querystring: { sessionId?: string } }>('/api/gossip', async (req) => {
    return bus.listMessages(req.query.sessionId);
  });

  app.post<{ Body: SendGossipRequest }>('/api/gossip', async (req, reply) => {
    const { fromSessionId, content } = req.body;
    if (!fromSessionId || !content) {
      return reply.status(400).send({ error: 'fromSessionId and content are required' });
    }
    return reply.status(201).send(bus.send(req.body));
  });

  app.get<{ Params: { id: string } }>('/api/gossip/:id', async (req, reply) => {
    const msg = bus.getMessage(req.params.id);
    if (!msg) return reply.status(404).send({ error: 'Message not found' });
    return msg;
  });
}
