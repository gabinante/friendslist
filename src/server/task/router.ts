import type { FastifyInstance } from 'fastify';
import type { TaskTracker } from './tracker.js';
import type { CreateTaskRequest, TaskPhase } from '../../shared/types.js';

export function registerTaskRoutes(app: FastifyInstance, tracker: TaskTracker): void {
  app.get<{ Querystring: { phase?: TaskPhase } }>('/api/tasks', async (req) => {
    return tracker.listTasks(req.query.phase);
  });

  app.post<{ Body: CreateTaskRequest }>('/api/tasks', async (req, reply) => {
    const { title, description } = req.body;
    if (!title || !description) {
      return reply.status(400).send({ error: 'title and description are required' });
    }
    return reply.status(201).send(tracker.createTask(req.body));
  });

  app.get<{ Params: { id: string } }>('/api/tasks/:id', async (req, reply) => {
    const task = tracker.getTask(req.params.id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });
    return task;
  });

  app.get<{ Params: { id: string } }>('/api/tasks/:id/subtasks', async (req) => {
    return tracker.getSubtasks(req.params.id);
  });

  app.patch<{ Params: { id: string }; Body: { phase?: TaskPhase; title?: string; description?: string; priority?: number } }>(
    '/api/tasks/:id',
    async (req, reply) => {
      try {
        const { phase, ...rest } = req.body;
        let task = tracker.getTask(req.params.id);
        if (!task) return reply.status(404).send({ error: 'Task not found' });

        if (phase) task = tracker.updatePhase(req.params.id, phase);
        if (Object.keys(rest).length > 0) task = tracker.updateTask(req.params.id, rest);
        return task;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return reply.status(400).send({ error: message });
      }
    }
  );

  app.post<{ Params: { id: string }; Body: { sessionId: string | null } }>(
    '/api/tasks/:id/assign',
    async (req, reply) => {
      const task = tracker.getTask(req.params.id);
      if (!task) return reply.status(404).send({ error: 'Task not found' });
      return tracker.assignToSession(req.params.id, req.body.sessionId);
    }
  );

  app.delete<{ Params: { id: string } }>('/api/tasks/:id', async (req, reply) => {
    const deleted = tracker.deleteTask(req.params.id);
    if (!deleted) return reply.status(404).send({ error: 'Task not found' });
    return { ok: true };
  });
}
