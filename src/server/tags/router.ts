import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { tags, sessionTags } from '../db/schema.js';

// 12 visually distinct colors for auto-assignment
const TAG_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f43f5e', '#a855f7', '#6366f1',
];

function nextColor(): string {
  const existing = db.select().from(tags).all();
  const usedColors = new Set(existing.map(t => t.color));
  // Pick first unused color, or cycle
  for (const c of TAG_COLORS) {
    if (!usedColors.has(c)) return c;
  }
  return TAG_COLORS[existing.length % TAG_COLORS.length];
}

export function registerTagRoutes(app: FastifyInstance) {
  // List all tags
  app.get('/api/tags', async () => {
    return db.select().from(tags).all();
  });

  // Create a tag
  app.post<{ Body: { name: string; color?: string } }>('/api/tags', async (req) => {
    const { name, color } = req.body;
    const id = uuidv4();
    const now = new Date().toISOString();
    const tagColor = color || nextColor();

    db.insert(tags).values({ id, name, color: tagColor, createdAt: now }).run();
    return db.select().from(tags).where(eq(tags.id, id)).get();
  });

  // Delete a tag (and all associations)
  app.delete<{ Params: { tagId: string } }>('/api/tags/:tagId', async (req) => {
    const { tagId } = req.params;
    db.delete(sessionTags).where(eq(sessionTags.tagId, tagId)).run();
    db.delete(tags).where(eq(tags.id, tagId)).run();
    return { ok: true };
  });

  // Assign tag to session
  app.post<{ Params: { tagId: string; sessionId: string } }>(
    '/api/tags/:tagId/sessions/:sessionId',
    async (req, reply) => {
      const { tagId, sessionId } = req.params;
      // Check tag exists
      const tag = db.select().from(tags).where(eq(tags.id, tagId)).get();
      if (!tag) return reply.status(404).send({ error: 'Tag not found' });

      // Check not already assigned
      const existing = db.select().from(sessionTags)
        .where(and(eq(sessionTags.sessionId, sessionId), eq(sessionTags.tagId, tagId)))
        .get();
      if (existing) return { ok: true, alreadyExists: true };

      db.insert(sessionTags).values({ id: uuidv4(), sessionId, tagId }).run();
      return { ok: true };
    }
  );

  // Remove tag from session
  app.delete<{ Params: { tagId: string; sessionId: string } }>(
    '/api/tags/:tagId/sessions/:sessionId',
    async (req) => {
      const { tagId, sessionId } = req.params;
      db.delete(sessionTags)
        .where(and(eq(sessionTags.sessionId, sessionId), eq(sessionTags.tagId, tagId)))
        .run();
      return { ok: true };
    }
  );

  // Get tags for a session
  app.get<{ Params: { sessionId: string } }>(
    '/api/sessions/:sessionId/tags',
    async (req) => {
      const { sessionId } = req.params;
      const rows = db.select().from(sessionTags).where(eq(sessionTags.sessionId, sessionId)).all();
      const tagIds = rows.map(r => r.tagId);
      if (tagIds.length === 0) return [];
      return db.select().from(tags).all().filter(t => tagIds.includes(t.id));
    }
  );

  // Get all session-tag assignments (for frontend to group)
  app.get('/api/tags/assignments', async () => {
    return db.select().from(sessionTags).all();
  });
}
