// Session status
export type SessionStatus = 'idle' | 'working' | 'waiting_input' | 'error' | 'loop' | 'stopped';

// Task phases
export type TaskPhase = 'backlog' | 'in_progress' | 'testing' | 'completed';

// Gossip message status
export type GossipStatus = 'pending' | 'delivered' | 'responded';

// Loop status
export type LoopStatus = 'running' | 'paused' | 'completed' | 'failed';

// Flow status
export type FlowStepStatus = 'pending' | 'running' | 'completed' | 'failed';
export type FlowStatus = 'draft' | 'running' | 'completed' | 'failed';

// Exit condition types for loops
export type ExitCondition =
  | { type: 'all_tests_pass'; testCommand: string }
  | { type: 'output_contains'; pattern: string }
  | { type: 'output_matches_schema'; schema: object }
  | { type: 'max_iterations'; count: number }
  | { type: 'manual' }
  | { type: 'custom'; evaluatorPrompt: string };

// --- API types ---

export interface SessionInfo {
  id: string;
  claudeSessionId: string;
  name: string;
  alias: string | null;
  status: SessionStatus;
  cwd: string;
  pid: number | null;
  model: string;
  createdAt: string;
  lastActivityAt: string;
  currentTaskId: string | null;
  tracked: boolean;
  summary: string | null;
  containerId?: string;
}

export interface CreateSessionRequest {
  name: string;
  alias?: string;
  cwd: string;
  model?: string;
}

export interface ImageAttachment {
  /** base64-encoded image data (no data-url prefix) */
  data: string;
  /** MIME type, e.g. "image/png" */
  mediaType: string;
}

export interface SendPromptRequest {
  prompt: string;
  images?: ImageAttachment[];
}

export interface TaskInfo {
  id: string;
  parentId: string | null;
  title: string;
  description: string;
  phase: TaskPhase;
  assignedSessionId: string | null;
  priority: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface CreateTaskRequest {
  title: string;
  description: string;
  parentId?: string;
  priority?: number;
}

export interface GossipMessageInfo {
  id: string;
  fromSessionId: string;
  toSessionId: string | null;
  content: string;
  responseContent: string | null;
  status: GossipStatus;
  createdAt: string;
  respondedAt: string | null;
}

export interface SendGossipRequest {
  fromSessionId: string;
  toSessionId?: string;
  content: string;
}

export interface LoopConfigInfo {
  id: string;
  sessionId: string;
  prompt: string;
  exitCondition: ExitCondition;
  maxIterations: number;
  currentIteration: number;
  status: LoopStatus;
  intervalMs: number;
  lastResult: string | null;
  createdAt: string;
}

export interface StartLoopRequest {
  sessionId: string;
  prompt: string;
  exitCondition: ExitCondition;
  maxIterations?: number;
  intervalMs?: number;
}

// WebSocket event types
export type WSEvent =
  | { type: 'session:created'; session: SessionInfo }
  | { type: 'session:updated'; session: SessionInfo }
  | { type: 'session:deleted'; sessionId: string }
  | { type: 'session:output'; sessionId: string; content: string; messageType: string }
  | { type: 'session:thinking'; sessionId: string; content: string }
  | { type: 'session:tool_use'; sessionId: string; tool: string; input: string }
  | { type: 'session:result_meta'; sessionId: string; costUsd: number; durationMs: number; model: string }
  | { type: 'task:created'; task: TaskInfo }
  | { type: 'task:updated'; task: TaskInfo }
  | { type: 'gossip:message'; message: GossipMessageInfo }
  | { type: 'gossip:response'; message: GossipMessageInfo }
  | { type: 'loop:update'; loop: LoopConfigInfo }
  | { type: 'notification'; title: string; body: string; level: 'info' | 'success' | 'error' };
