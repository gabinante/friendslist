import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { EventEmitter } from 'events';
import { db } from '../db/connection.js';
import { loopConfigs } from '../db/schema.js';
import { evaluateExitCondition } from './conditions.js';
import type { SessionManager } from '../session/manager.js';
import type { Notifier } from '../notify/notifier.js';
import type { LoopConfigInfo, StartLoopRequest, ExitCondition, LoopStatus } from '../../shared/types.js';

export class LoopController extends EventEmitter {
  private activeLoops = new Map<string, { timer: ReturnType<typeof setTimeout> | null; aborted: boolean }>();

  constructor(
    private sessionManager: SessionManager,
    private notifier: Notifier,
  ) {
    super();
  }

  startLoop(req: StartLoopRequest): LoopConfigInfo {
    const id = uuidv4();
    const now = new Date().toISOString();
    const exitCondition = req.exitCondition;

    db.insert(loopConfigs).values({
      id,
      sessionId: req.sessionId,
      prompt: req.prompt,
      exitCondition: JSON.stringify(exitCondition),
      maxIterations: req.maxIterations ?? 10,
      currentIteration: 0,
      status: 'running',
      intervalMs: req.intervalMs ?? 1000,
      lastResult: null,
      createdAt: now,
    }).run();

    this.sessionManager.setStatus(req.sessionId, 'loop');
    this.activeLoops.set(id, { timer: null, aborted: false });

    // Start the loop asynchronously
    this.runIteration(id);

    return this.getLoop(id)!;
  }

  private async runIteration(loopId: string): Promise<void> {
    const state = this.activeLoops.get(loopId);
    if (!state || state.aborted) return;

    const loop = this.getLoop(loopId);
    if (!loop || loop.status !== 'running') return;

    const iteration = loop.currentIteration + 1;

    // Resolve template variables in prompt
    let prompt = loop.prompt
      .replace('{{iteration}}', String(iteration))
      .replace('{{lastResult}}', loop.lastResult ?? '(first iteration)');

    try {
      const result = await this.sessionManager.sendPrompt(loop.sessionId, prompt);

      // Update iteration count and result
      db.update(loopConfigs)
        .set({ currentIteration: iteration, lastResult: result })
        .where(eq(loopConfigs.id, loopId))
        .run();

      const updatedLoop = this.getLoop(loopId)!;
      this.emit('loop:update', updatedLoop);

      // Check exit conditions
      const session = this.sessionManager.getSession(loop.sessionId);
      const exitCondition: ExitCondition = JSON.parse(JSON.stringify(loop.exitCondition));
      const shouldExit = await evaluateExitCondition(exitCondition, result, session?.cwd ?? '.');

      if (shouldExit || iteration >= loop.maxIterations) {
        const finalStatus: LoopStatus = shouldExit ? 'completed' : 'failed';
        db.update(loopConfigs)
          .set({ status: finalStatus })
          .where(eq(loopConfigs.id, loopId))
          .run();

        this.sessionManager.setStatus(loop.sessionId, 'idle');
        this.activeLoops.delete(loopId);

        await this.notifier.notify({
          title: `Loop ${shouldExit ? 'completed' : 'max iterations reached'}`,
          body: `Session loop finished after ${iteration} iterations`,
          level: shouldExit ? 'success' : 'error',
        });

        this.emit('loop:update', this.getLoop(loopId)!);
        return;
      }

      // Schedule next iteration
      if (!state.aborted) {
        state.timer = setTimeout(() => this.runIteration(loopId), loop.intervalMs);
      }
    } catch (err) {
      db.update(loopConfigs)
        .set({ status: 'failed' as LoopStatus })
        .where(eq(loopConfigs.id, loopId))
        .run();

      this.sessionManager.setStatus(loop.sessionId, 'error');
      this.activeLoops.delete(loopId);

      await this.notifier.notify({
        title: 'Loop failed',
        body: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        level: 'error',
      });

      this.emit('loop:update', this.getLoop(loopId)!);
    }
  }

  pauseLoop(loopId: string): LoopConfigInfo | null {
    const state = this.activeLoops.get(loopId);
    if (state?.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }

    db.update(loopConfigs)
      .set({ status: 'paused' as LoopStatus })
      .where(eq(loopConfigs.id, loopId))
      .run();

    const loop = this.getLoop(loopId);
    if (loop) {
      this.sessionManager.setStatus(loop.sessionId, 'idle');
      this.emit('loop:update', loop);
    }
    return loop;
  }

  resumeLoop(loopId: string): LoopConfigInfo | null {
    db.update(loopConfigs)
      .set({ status: 'running' as LoopStatus })
      .where(eq(loopConfigs.id, loopId))
      .run();

    const loop = this.getLoop(loopId);
    if (loop) {
      this.sessionManager.setStatus(loop.sessionId, 'loop');
      this.activeLoops.set(loopId, { timer: null, aborted: false });
      this.runIteration(loopId);
      this.emit('loop:update', loop);
    }
    return loop;
  }

  stopLoop(loopId: string): LoopConfigInfo | null {
    const state = this.activeLoops.get(loopId);
    if (state) {
      state.aborted = true;
      if (state.timer) clearTimeout(state.timer);
    }
    this.activeLoops.delete(loopId);

    db.update(loopConfigs)
      .set({ status: 'completed' as LoopStatus })
      .where(eq(loopConfigs.id, loopId))
      .run();

    const loop = this.getLoop(loopId);
    if (loop) {
      this.sessionManager.setStatus(loop.sessionId, 'idle');
      this.emit('loop:update', loop);
    }
    return loop;
  }

  getLoop(id: string): LoopConfigInfo | null {
    const row = db.select().from(loopConfigs).where(eq(loopConfigs.id, id)).get();
    if (!row) return null;
    return {
      id: row.id,
      sessionId: row.sessionId,
      prompt: row.prompt,
      exitCondition: JSON.parse(row.exitCondition),
      maxIterations: row.maxIterations,
      currentIteration: row.currentIteration,
      status: row.status as LoopStatus,
      intervalMs: row.intervalMs,
      lastResult: row.lastResult,
      createdAt: row.createdAt,
    };
  }

  listLoops(): LoopConfigInfo[] {
    return db.select().from(loopConfigs).all().map(row => ({
      id: row.id,
      sessionId: row.sessionId,
      prompt: row.prompt,
      exitCondition: JSON.parse(row.exitCondition),
      maxIterations: row.maxIterations,
      currentIteration: row.currentIteration,
      status: row.status as LoopStatus,
      intervalMs: row.intervalMs,
      lastResult: row.lastResult,
      createdAt: row.createdAt,
    }));
  }
}
