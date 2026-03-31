import { spawn, ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import { EventEmitter } from 'events';
import { resolve } from 'path';
import { writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { ClaudeStreamMessage, SessionConfig } from './types.js';
import type { ImageAttachment } from '../../shared/types.js';

/** Path to the Friendlist MCP server script */
const MCP_SERVER_PATH = resolve(import.meta.dirname, '../mcp/server.ts');

export class ClaudeProcess extends EventEmitter {
  private proc: ChildProcess | null = null;
  private config: SessionConfig;
  private _alive = false;

  constructor(config: SessionConfig) {
    super();
    this.config = config;
  }

  get alive(): boolean {
    return this._alive;
  }

  get pid(): number | null {
    return this.proc?.pid ?? null;
  }

  start(): void {
    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--session-id', this.config.claudeSessionId,
      '--model', this.config.model,
    ];

    this.proc = spawn('claude', args, {
      cwd: this.config.cwd,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this._alive = true;

    if (this.proc.stdout) {
      const rl = createInterface({ input: this.proc.stdout });
      rl.on('line', (line) => {
        try {
          const msg: ClaudeStreamMessage = JSON.parse(line);
          this.emit('message', msg);

          if (msg.type === 'assistant') {
            this.emit('assistant', msg);
          } else if (msg.type === 'result') {
            this.emit('result', msg);
          } else if (msg.type === 'system') {
            this.emit('system', msg);
          }
        } catch {
          // Non-JSON line, emit as raw output
          this.emit('raw', line);
        }
      });
    }

    if (this.proc.stderr) {
      const rl = createInterface({ input: this.proc.stderr });
      rl.on('line', (line) => {
        this.emit('stderr', line);
      });
    }

    this.proc.on('exit', (code, signal) => {
      this._alive = false;
      this.emit('exit', { code, signal });
    });

    this.proc.on('error', (err) => {
      this._alive = false;
      this.emit('error', err);
    });
  }

  sendPrompt(prompt: string): void {
    if (!this.proc?.stdin?.writable) {
      throw new Error('Session process is not running or stdin is not writable');
    }
    // For -p mode, we spawn a new process per prompt.
    // Instead, let's write to stdin if in streaming mode.
    this.proc.stdin.write(prompt + '\n');
  }

  kill(): void {
    if (this.proc && this._alive) {
      this.proc.kill('SIGTERM');
      this._alive = false;
    }
  }
}

/**
 * Spawn a one-shot claude process that runs a prompt and returns the result.
 * This is used for individual prompt executions since the CLI's -p flag
 * is designed for single-turn interactions.
 */
export function spawnClaudeOneShot(config: {
  sessionId: string;
  resumeSessionId?: string;
  sessionName?: string;
  cwd: string;
  model: string;
  prompt: string;
  images?: ImageAttachment[];
  permissionMode?: string;
}): ClaudeProcess {
  const proc = new ClaudeProcess({
    id: config.sessionId,
    claudeSessionId: config.sessionId,
    name: config.sessionName ?? '',
    cwd: config.cwd,
    model: config.model,
  });

  // Build MCP config JSON for the friendlist server
  const mcpConfig = JSON.stringify({
    mcpServers: {
      friendlist: {
        type: 'stdio',
        command: 'npx',
        args: ['tsx', MCP_SERVER_PATH],
        env: {
          FRIENDLIST_SESSION_ID: config.sessionId,
          FRIENDLIST_SESSION_NAME: config.sessionName ?? '',
          FRIENDLIST_API: `http://localhost:${process.env.PORT ?? '3456'}/api`,
        },
      },
    },
  });

  // Write images to temp files so Claude can read them via its Read tool
  const tempImagePaths: string[] = [];
  let prompt = config.prompt;

  if (config.images && config.images.length > 0) {
    const tempDir = join(tmpdir(), 'friendlist-images');
    mkdirSync(tempDir, { recursive: true });

    const ext: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp',
    };

    for (let i = 0; i < config.images.length; i++) {
      const img = config.images[i];
      const suffix = ext[img.mediaType] ?? '.png';
      const filePath = join(tempDir, `${config.sessionId}-${Date.now()}-${i}${suffix}`);
      writeFileSync(filePath, Buffer.from(img.data, 'base64'));
      tempImagePaths.push(filePath);
    }

    const imageRefs = tempImagePaths.map((p) => p).join('\n');
    prompt = `${config.prompt}\n\n[The user has attached ${tempImagePaths.length} image(s). Read them with the Read tool before responding.]\n${imageRefs}`;
  }

  const args = [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--model', config.model,
    '--permission-mode', config.permissionMode ?? 'bypassPermissions',
    '--mcp-config', mcpConfig,
  ];

  if (config.resumeSessionId) {
    // Continue conversation context from the original session
    args.push('--resume', config.resumeSessionId);
  } else {
    args.push('--session-id', config.sessionId);
  }

  const child = spawn('claude', args, {
    cwd: config.cwd,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Clean up temp images when process exits
  if (tempImagePaths.length > 0) {
    child.on('exit', () => {
      for (const p of tempImagePaths) {
        try { unlinkSync(p); } catch { /* ignore */ }
      }
    });
  }

  // Manually wire up the same event handling
  if (child.stdout) {
    const rl = createInterface({ input: child.stdout });
    rl.on('line', (line) => {
      try {
        const msg: ClaudeStreamMessage = JSON.parse(line);
        proc.emit('message', msg);
        if (msg.type === 'result') proc.emit('result', msg);
        else if (msg.type === 'assistant') proc.emit('assistant', msg);
        else if (msg.type === 'system') proc.emit('system', msg);
      } catch {
        proc.emit('raw', line);
      }
    });
  }

  if (child.stderr) {
    const rl = createInterface({ input: child.stderr });
    rl.on('line', (line) => proc.emit('stderr', line));
  }

  child.on('exit', (code, signal) => proc.emit('exit', { code, signal }));
  child.on('error', (err) => proc.emit('error', err));

  return proc;
}
