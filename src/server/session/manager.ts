import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { sessions } from '../db/schema.js';
import { spawnClaudeOneShot } from './process.js';
import { discoverClaudeSessions } from './history.js';
import type { SessionConfig, SessionState, ClaudeStreamMessage } from './types.js';
import type { SessionInfo, SessionStatus, CreateSessionRequest, ImageAttachment } from '../../shared/types.js';

export class SessionManager extends EventEmitter {
  private activeSessions = new Map<string, SessionState>();

  constructor() {
    super();
    this.loadFromDb();
    this.importDiscoveredSessions();
  }

  private loadFromDb(): void {
    const rows = db.select().from(sessions).all();
    for (const row of rows) {
      // Mark previously running sessions as stopped on restart
      if (row.status !== 'stopped') {
        db.update(sessions)
          .set({ status: 'stopped', pid: null })
          .where(eq(sessions.id, row.id))
          .run();
      }
      this.activeSessions.set(row.id, {
        config: {
          id: row.id,
          claudeSessionId: row.claudeSessionId,
          name: row.name,
          alias: row.alias ?? undefined,
          cwd: row.cwd,
          model: row.model,
        },
        status: 'stopped',
        pid: null,
        createdAt: new Date(row.createdAt),
        lastActivityAt: new Date(row.lastActivityAt),
        currentTaskId: row.currentTaskId,
        outputBuffer: [],
        realClaudeSessionId: row.realClaudeSessionId ?? null,
        tracked: row.tracked ?? true,
        summary: row.summary ?? null,
      });
    }
  }

  /**
   * Scan Claude CLI JSONL files and import any sessions not already tracked.
   * This allows friendlist to surface sessions created outside of friendlist
   * and backfill realClaudeSessionId for existing sessions.
   */
  private importDiscoveredSessions(): void {
    const discovered = discoverClaudeSessions();
    const knownRealIds = new Set<string>();
    for (const state of this.activeSessions.values()) {
      if (state.realClaudeSessionId) knownRealIds.add(state.realClaudeSessionId);
      // Also track claudeSessionId since imports set it to realClaudeSessionId
      knownRealIds.add(state.config.claudeSessionId);
    }

    let imported = 0;
    for (const d of discovered) {
      if (knownRealIds.has(d.realClaudeSessionId)) continue;

      const id = uuidv4();
      const config: SessionConfig = {
        id,
        claudeSessionId: d.realClaudeSessionId,
        name: d.name,
        cwd: d.cwd,
        model: d.model,
      };

      const state: SessionState = {
        config,
        status: 'stopped',
        pid: null,
        createdAt: new Date(d.createdAt),
        lastActivityAt: new Date(d.lastActivityAt),
        currentTaskId: null,
        outputBuffer: [],
        realClaudeSessionId: d.realClaudeSessionId,
        tracked: false,
        summary: null,
      };

      db.insert(sessions).values({
        id,
        claudeSessionId: d.realClaudeSessionId,
        name: d.name,
        alias: null,
        status: 'stopped',
        cwd: d.cwd,
        pid: null,
        model: d.model,
        createdAt: d.createdAt,
        lastActivityAt: d.lastActivityAt,
        currentTaskId: null,
        realClaudeSessionId: d.realClaudeSessionId,
        tracked: false,
        summary: null,
      }).run();

      this.activeSessions.set(id, state);
      imported++;
    }

    if (imported > 0) {
      console.log(`Discovered and imported ${imported} Claude session(s) from filesystem`);
    }
  }

  createSession(req: CreateSessionRequest): SessionInfo {
    const id = uuidv4();
    const claudeSessionId = uuidv4();
    const now = new Date().toISOString();

    const config: SessionConfig = {
      id,
      claudeSessionId,
      name: req.name,
      alias: req.alias,
      cwd: req.cwd,
      model: req.model ?? 'sonnet',
    };

    const state: SessionState = {
      config,
      status: 'idle',
      pid: null,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      currentTaskId: null,
      outputBuffer: [],
      realClaudeSessionId: null,
      tracked: true,
      summary: null,
    };

    db.insert(sessions).values({
      id,
      claudeSessionId,
      name: req.name,
      alias: req.alias ?? null,
      status: 'idle',
      cwd: req.cwd,
      pid: null,
      model: config.model,
      createdAt: now,
      lastActivityAt: now,
      currentTaskId: null,
    }).run();

    this.activeSessions.set(id, state);

    const info = this.toSessionInfo(state);
    this.emit('session:created', info);
    return info;
  }

  listSessions(filter?: { tracked?: boolean }): SessionInfo[] {
    let values = Array.from(this.activeSessions.values());
    if (filter?.tracked !== undefined) {
      values = values.filter(s => s.tracked === filter.tracked);
    }
    return values.map(s => this.toSessionInfo(s));
  }

  getSession(id: string): SessionInfo | null {
    const state = this.activeSessions.get(id);
    return state ? this.toSessionInfo(state) : null;
  }

  getSessionHistoryInfo(id: string): { realClaudeSessionId: string | null; cwd: string } | null {
    const state = this.activeSessions.get(id);
    if (!state) return null;
    return { realClaudeSessionId: state.realClaudeSessionId, cwd: state.config.cwd };
  }

  getSessionByAlias(alias: string): SessionInfo | null {
    for (const state of this.activeSessions.values()) {
      if (state.config.alias === alias) {
        return this.toSessionInfo(state);
      }
    }
    return null;
  }

  updateSession(id: string, updates: { name?: string; alias?: string }): SessionInfo | null {
    const state = this.activeSessions.get(id);
    if (!state) return null;

    if (updates.name !== undefined) state.config.name = updates.name;
    if (updates.alias !== undefined) state.config.alias = updates.alias;

    db.update(sessions)
      .set({ name: state.config.name, alias: state.config.alias ?? null })
      .where(eq(sessions.id, id))
      .run();

    const info = this.toSessionInfo(state);
    this.emit('session:updated', info);
    return info;
  }

  deleteSession(id: string): boolean {
    const state = this.activeSessions.get(id);
    if (!state) return false;

    // Kill process if running
    this.updateStatus(id, 'stopped');
    this.activeSessions.delete(id);
    db.delete(sessions).where(eq(sessions.id, id)).run();
    this.emit('session:deleted', id);
    return true;
  }

  untrackSession(id: string): SessionInfo | null {
    const state = this.activeSessions.get(id);
    if (!state) return null;

    // Stop the process if running
    if (state.status === 'working') {
      this.updateStatus(id, 'stopped');
    }

    state.tracked = false;
    db.update(sessions).set({ tracked: false }).where(eq(sessions.id, id)).run();

    const info = this.toSessionInfo(state);
    this.emit('session:updated', info);
    return info;
  }

  trackSession(id: string): SessionInfo | null {
    const state = this.activeSessions.get(id);
    if (!state) return null;

    state.tracked = true;
    db.update(sessions).set({ tracked: true }).where(eq(sessions.id, id)).run();

    const info = this.toSessionInfo(state);
    this.emit('session:updated', info);
    return info;
  }

  /**
   * Send a prompt to a session. Spawns a one-shot claude process,
   * streams output events, and resolves with the final result text.
   */
  async sendPrompt(id: string, prompt: string, images?: ImageAttachment[]): Promise<string> {
    const state = this.activeSessions.get(id);
    if (!state) throw new Error(`Session ${id} not found`);

    this.updateStatus(id, 'working');

    // First prompt: use a fresh session ID.
    // Subsequent prompts: --resume the real session ID from the first invocation.
    const invocationId = uuidv4();
    const proc = spawnClaudeOneShot({
      sessionId: invocationId,
      resumeSessionId: state.realClaudeSessionId ?? undefined,
      sessionName: state.config.name,
      cwd: state.config.cwd,
      model: state.config.model,
      prompt,
      images,
    });

    state.pid = proc.pid;
    this.persistState(id);

    return new Promise<string>((resolve, reject) => {
      let resultText = '';
      const chunks: string[] = [];
      const stderrLines: string[] = [];

      // Broadcast all raw stream-json messages to frontend
      proc.on('message', (msg: ClaudeStreamMessage) => {
        this.emit('session:output', {
          sessionId: id,
          content: JSON.stringify(msg),
          messageType: msg.type,
        });
      });

      proc.on('assistant', (msg: ClaudeStreamMessage) => {
        const content = msg.message?.content;
        if (content) {
          for (const block of content) {
            if (block.type === 'thinking' && block.text) {
              this.emit('session:thinking', {
                sessionId: id,
                content: block.text,
              });
            } else if (block.type === 'tool_use') {
              this.emit('session:tool_use', {
                sessionId: id,
                tool: block.name ?? 'unknown',
                input: typeof block.input === 'string'
                  ? block.input
                  : JSON.stringify(block.input ?? {}),
              });
            } else if (block.text) {
              chunks.push(block.text);
              state.outputBuffer.push(block.text);
            }
          }
        }
        state.lastActivityAt = new Date();
      });

      proc.on('stderr', (line: string) => {
        stderrLines.push(line);
        console.error(`[session:${state.config.name}] ${line}`);
        // Also emit stderr to frontend
        this.emit('session:output', {
          sessionId: id,
          content: line,
          messageType: 'stderr',
        });
      });

      proc.on('system', (msg: ClaudeStreamMessage) => {
        // Capture the real Claude session ID from the init message
        const sid = (msg as Record<string, unknown>).session_id as string | undefined;
        if (sid && !state.realClaudeSessionId) {
          state.realClaudeSessionId = sid;
        }
      });

      proc.on('result', (msg: ClaudeStreamMessage) => {
        resultText = msg.result?.text ?? chunks.join('');
        // Also capture session ID from result if we missed init
        if (msg.result?.session_id && !state.realClaudeSessionId) {
          state.realClaudeSessionId = msg.result.session_id;
        }
        // Emit cost/duration metadata (fields are at top level of result message)
        const raw = msg as Record<string, unknown>;
        this.emit('session:result_meta', {
          sessionId: id,
          costUsd: (raw.total_cost_usd as number) ?? 0,
          durationMs: (raw.duration_ms as number) ?? 0,
          model: (raw.model as string) ?? state.config.model,
        });
        // Update summary with latest result (truncated)
        if (resultText) {
          state.summary = resultText.slice(0, 500);
          db.update(sessions).set({ summary: state.summary }).where(eq(sessions.id, id)).run();
        }
        state.lastActivityAt = new Date();
        this.updateStatus(id, 'idle');
        state.pid = null;
        this.persistState(id);
        resolve(resultText);
      });

      proc.on('exit', ({ code }: { code: number | null }) => {
        if (code !== 0 && !resultText) {
          const stderrMsg = stderrLines.join('\n');
          console.error(`[session:${state.config.name}] exited with code ${code}: ${stderrMsg}`);
          this.updateStatus(id, 'idle');
          state.pid = null;
          this.persistState(id);
          reject(new Error(`Claude process exited with code ${code}: ${stderrMsg}`));
        }
      });

      proc.on('error', (err: Error) => {
        console.error(`[session:${state.config.name}] process error:`, err);
        this.updateStatus(id, 'idle');
        state.pid = null;
        this.persistState(id);
        reject(err);
      });
    });
  }

  getOutputBuffer(id: string): string[] {
    return this.activeSessions.get(id)?.outputBuffer ?? [];
  }

  private updateStatus(id: string, status: SessionStatus): void {
    const state = this.activeSessions.get(id);
    if (!state) return;
    state.status = status;
    state.lastActivityAt = new Date();
    this.persistState(id);
    this.emit('session:updated', this.toSessionInfo(state));
  }

  setStatus(id: string, status: SessionStatus): void {
    this.updateStatus(id, status);
  }

  private persistState(id: string): void {
    const state = this.activeSessions.get(id);
    if (!state) return;
    db.update(sessions)
      .set({
        status: state.status,
        pid: state.pid,
        lastActivityAt: state.lastActivityAt.toISOString(),
        currentTaskId: state.currentTaskId,
        realClaudeSessionId: state.realClaudeSessionId,
      })
      .where(eq(sessions.id, id))
      .run();
  }

  private toSessionInfo(state: SessionState): SessionInfo {
    return {
      id: state.config.id,
      claudeSessionId: state.config.claudeSessionId,
      name: state.config.name,
      alias: state.config.alias ?? null,
      status: state.status,
      cwd: state.config.cwd,
      pid: state.pid,
      model: state.config.model,
      createdAt: state.createdAt.toISOString(),
      lastActivityAt: state.lastActivityAt.toISOString(),
      currentTaskId: state.currentTaskId,
      tracked: state.tracked,
      summary: state.summary,
    };
  }
}
