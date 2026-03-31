import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { EventEmitter } from 'events';
import { db } from '../db/connection.js';
import { tasks } from '../db/schema.js';
import { VALID_TRANSITIONS } from './types.js';
import type { TaskInfo, TaskPhase, CreateTaskRequest } from '../../shared/types.js';

export class TaskTracker extends EventEmitter {
  createTask(req: CreateTaskRequest): TaskInfo {
    const id = uuidv4();
    const now = new Date().toISOString();

    db.insert(tasks).values({
      id,
      parentId: req.parentId ?? null,
      title: req.title,
      description: req.description,
      phase: 'backlog',
      assignedSessionId: null,
      priority: req.priority ?? 0,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    }).run();

    const task = this.getTask(id)!;
    this.emit('task:created', task);
    return task;
  }

  getTask(id: string): TaskInfo | null {
    const row = db.select().from(tasks).where(eq(tasks.id, id)).get();
    return row ? this.toTaskInfo(row) : null;
  }

  listTasks(phase?: TaskPhase): TaskInfo[] {
    const rows = phase
      ? db.select().from(tasks).where(eq(tasks.phase, phase)).all()
      : db.select().from(tasks).all();
    return rows.map(r => this.toTaskInfo(r));
  }

  getSubtasks(parentId: string): TaskInfo[] {
    return db.select().from(tasks).where(eq(tasks.parentId, parentId)).all().map(r => this.toTaskInfo(r));
  }

  updatePhase(id: string, newPhase: TaskPhase): TaskInfo {
    const task = this.getTask(id);
    if (!task) throw new Error(`Task ${id} not found`);

    const currentPhase = task.phase as TaskPhase;
    if (!VALID_TRANSITIONS[currentPhase].includes(newPhase)) {
      throw new Error(`Invalid transition from ${currentPhase} to ${newPhase}`);
    }

    const now = new Date().toISOString();
    const completedAt = newPhase === 'completed' ? now : null;

    db.update(tasks)
      .set({ phase: newPhase, updatedAt: now, completedAt })
      .where(eq(tasks.id, id))
      .run();

    const updated = this.getTask(id)!;
    this.emit('task:updated', updated);
    return updated;
  }

  assignToSession(taskId: string, sessionId: string | null): TaskInfo {
    const now = new Date().toISOString();
    db.update(tasks)
      .set({ assignedSessionId: sessionId, updatedAt: now })
      .where(eq(tasks.id, taskId))
      .run();

    const updated = this.getTask(taskId)!;
    this.emit('task:updated', updated);
    return updated;
  }

  updateTask(id: string, updates: { title?: string; description?: string; priority?: number }): TaskInfo {
    const now = new Date().toISOString();
    const setValues: Record<string, unknown> = { updatedAt: now };
    if (updates.title !== undefined) setValues.title = updates.title;
    if (updates.description !== undefined) setValues.description = updates.description;
    if (updates.priority !== undefined) setValues.priority = updates.priority;

    db.update(tasks).set(setValues).where(eq(tasks.id, id)).run();

    const updated = this.getTask(id)!;
    this.emit('task:updated', updated);
    return updated;
  }

  deleteTask(id: string): boolean {
    const result = db.delete(tasks).where(eq(tasks.id, id)).run();
    return result.changes > 0;
  }

  private toTaskInfo(row: typeof tasks.$inferSelect): TaskInfo {
    return {
      id: row.id,
      parentId: row.parentId,
      title: row.title,
      description: row.description,
      phase: row.phase as TaskPhase,
      assignedSessionId: row.assignedSessionId,
      priority: row.priority,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      completedAt: row.completedAt,
    };
  }
}
