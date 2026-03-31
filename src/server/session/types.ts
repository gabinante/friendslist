import type { SessionStatus } from '../../shared/types.js';

export interface SessionConfig {
  id: string;
  claudeSessionId: string;
  name: string;
  alias?: string;
  cwd: string;
  model: string;
}

export interface ClaudeStreamMessage {
  type: 'system' | 'assistant' | 'result';
  subtype?: string;
  message?: {
    role?: string;
    content?: Array<{ type: string; text?: string; name?: string; input?: unknown }>;
    model?: string;
  };
  result?: {
    text?: string;
    cost_usd?: number;
    duration_ms?: number;
    session_id?: string;
  };
  [key: string]: unknown;
}

export interface SessionState {
  config: SessionConfig;
  status: SessionStatus;
  pid: number | null;
  createdAt: Date;
  lastActivityAt: Date;
  currentTaskId: string | null;
  outputBuffer: string[];
  /** The actual Claude CLI session ID returned from the first invocation */
  realClaudeSessionId: string | null;
  tracked: boolean;
  summary: string | null;
}
