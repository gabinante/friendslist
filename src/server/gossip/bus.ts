import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { gossipMessages } from '../db/schema.js';
import type { GossipMessageInfo, SendGossipRequest, GossipStatus } from '../../shared/types.js';

export class MessageBus extends EventEmitter {
  send(req: SendGossipRequest): GossipMessageInfo {
    const id = uuidv4();
    const now = new Date().toISOString();

    db.insert(gossipMessages).values({
      id,
      fromSessionId: req.fromSessionId,
      toSessionId: req.toSessionId ?? null,
      content: req.content,
      responseContent: null,
      status: 'pending',
      createdAt: now,
      respondedAt: null,
    }).run();

    const msg = this.getMessage(id)!;
    this.emit('gossip:message', msg);

    // Emit targeted event for the session manager to pick up
    if (req.toSessionId) {
      this.emit(`gossip:${req.toSessionId}`, msg);
    } else {
      this.emit('gossip:broadcast', msg);
    }

    return msg;
  }

  respond(messageId: string, responseContent: string): GossipMessageInfo {
    const now = new Date().toISOString();
    db.update(gossipMessages)
      .set({ responseContent, status: 'responded' as GossipStatus, respondedAt: now })
      .where(eq(gossipMessages.id, messageId))
      .run();

    const msg = this.getMessage(messageId)!;
    this.emit('gossip:response', msg);
    return msg;
  }

  markDelivered(messageId: string): void {
    db.update(gossipMessages)
      .set({ status: 'delivered' as GossipStatus })
      .where(eq(gossipMessages.id, messageId))
      .run();
  }

  getMessage(id: string): GossipMessageInfo | null {
    const row = db.select().from(gossipMessages).where(eq(gossipMessages.id, id)).get();
    return row ? this.toInfo(row) : null;
  }

  listMessages(sessionId?: string): GossipMessageInfo[] {
    const rows = db.select().from(gossipMessages).all();
    if (!sessionId) return rows.map(r => this.toInfo(r));
    return rows
      .filter(r => r.fromSessionId === sessionId || r.toSessionId === sessionId || r.toSessionId === null)
      .map(r => this.toInfo(r));
  }

  private toInfo(row: typeof gossipMessages.$inferSelect): GossipMessageInfo {
    return {
      id: row.id,
      fromSessionId: row.fromSessionId,
      toSessionId: row.toSessionId,
      content: row.content,
      responseContent: row.responseContent,
      status: row.status as GossipStatus,
      createdAt: row.createdAt,
      respondedAt: row.respondedAt,
    };
  }
}
