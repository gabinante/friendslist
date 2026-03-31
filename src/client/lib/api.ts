import type {
  SessionInfo,
  CreateSessionRequest,
  TaskInfo,
  CreateTaskRequest,
  GossipMessageInfo,
  SendGossipRequest,
  LoopConfigInfo,
  StartLoopRequest,
  TaskPhase,
  ImageAttachment,
} from '../../shared/types.js';

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Sessions
export const getSessions = (tracked?: boolean) =>
  request<SessionInfo[]>(`/sessions${tracked !== undefined ? `?tracked=${tracked}` : ''}`);
export const getAllSessions = () => request<SessionInfo[]>('/sessions');
export const getTrackedSessions = () => request<SessionInfo[]>('/sessions?tracked=true');
export const createSession = (data: CreateSessionRequest) =>
  request<SessionInfo>('/sessions', { method: 'POST', body: JSON.stringify(data) });
export const deleteSession = (id: string) =>
  request<{ ok: boolean }>(`/sessions/${id}`, { method: 'DELETE' });
export const untrackSession = (id: string) =>
  request<SessionInfo>(`/sessions/${id}/untrack`, { method: 'POST', body: '{}' });
export const trackSession = (id: string) =>
  request<SessionInfo>(`/sessions/${id}/track`, { method: 'POST', body: '{}' });
export const updateSession = (id: string, data: { name?: string; alias?: string }) =>
  request<SessionInfo>(`/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const sendPrompt = (id: string, prompt: string, images?: ImageAttachment[]) =>
  request<{ result: string }>(`/sessions/${id}/prompt`, {
    method: 'POST',
    body: JSON.stringify({ prompt, images: images?.length ? images : undefined }),
  });
export const getSessionOutput = (id: string) =>
  request<{ output: string[] }>(`/sessions/${id}/output`);

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  toolUse?: { name: string; input: string }[];
  timestamp: string;
}
export const getSessionHistory = (id: string) =>
  request<{ messages: HistoryMessage[] }>(`/sessions/${id}/history`);

// Tasks
export const getTasks = (phase?: TaskPhase) =>
  request<TaskInfo[]>(`/tasks${phase ? `?phase=${phase}` : ''}`);
export const createTask = (data: CreateTaskRequest) =>
  request<TaskInfo>('/tasks', { method: 'POST', body: JSON.stringify(data) });
export const updateTask = (id: string, data: { phase?: TaskPhase; title?: string; description?: string; priority?: number }) =>
  request<TaskInfo>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteTask = (id: string) =>
  request<{ ok: boolean }>(`/tasks/${id}`, { method: 'DELETE' });
export const assignTask = (id: string, sessionId: string | null) =>
  request<TaskInfo>(`/tasks/${id}/assign`, { method: 'POST', body: JSON.stringify({ sessionId }) });
export const getSubtasks = (id: string) =>
  request<TaskInfo[]>(`/tasks/${id}/subtasks`);

// Gossip
export const getGossipMessages = (sessionId?: string) =>
  request<GossipMessageInfo[]>(`/gossip${sessionId ? `?sessionId=${sessionId}` : ''}`);
export const sendGossip = (data: SendGossipRequest) =>
  request<GossipMessageInfo>('/gossip', { method: 'POST', body: JSON.stringify(data) });

// Loops
export const getLoops = () => request<LoopConfigInfo[]>('/loops');
export const startLoop = (data: StartLoopRequest) =>
  request<LoopConfigInfo>('/loops', { method: 'POST', body: JSON.stringify(data) });
export const pauseLoop = (id: string) =>
  request<LoopConfigInfo>(`/loops/${id}/pause`, { method: 'POST' });
export const resumeLoop = (id: string) =>
  request<LoopConfigInfo>(`/loops/${id}/resume`, { method: 'POST' });
export const stopLoop = (id: string) =>
  request<LoopConfigInfo>(`/loops/${id}/stop`, { method: 'POST' });

// Flows
export const getFlows = () => request<unknown[]>('/flows');
export const runFlow = (id: string) =>
  request<{ status: string }>(`/flows/${id}/run`, { method: 'POST' });

// Notifications
export const testNotification = (title: string, body: string) =>
  request<{ ok: boolean }>('/notify/test', { method: 'POST', body: JSON.stringify({ title, body }) });

// Directories
export interface DirEntry {
  path: string;
  name: string;
  isGitRepo: boolean;
}
export interface BrowseResult {
  path: string;
  parent: string;
  entries: DirEntry[];
}
// Tags
export interface TagInfo {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}
export interface SessionTagAssignment {
  id: string;
  sessionId: string;
  tagId: string;
}
export const getTags = () => request<TagInfo[]>('/tags');
export const createTag = (name: string, color?: string) =>
  request<TagInfo>('/tags', { method: 'POST', body: JSON.stringify({ name, color }) });
export const deleteTag = (id: string) =>
  request<{ ok: boolean }>(`/tags/${id}`, { method: 'DELETE' });
export const assignTag = (tagId: string, sessionId: string) =>
  request<{ ok: boolean }>(`/tags/${tagId}/sessions/${sessionId}`, { method: 'POST', body: '{}' });
export const removeTag = (tagId: string, sessionId: string) =>
  request<{ ok: boolean }>(`/tags/${tagId}/sessions/${sessionId}`, { method: 'DELETE' });
export const getSessionTags = (sessionId: string) =>
  request<TagInfo[]>(`/sessions/${sessionId}/tags`);
export const getTagAssignments = () =>
  request<SessionTagAssignment[]>('/tags/assignments');

// Directories
export const getRepos = () => request<DirEntry[]>('/dirs/repos');
export const browseDirs = (path?: string) =>
  request<BrowseResult>(`/dirs/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`);

// Tools & MCP
export interface MCPServerInfo {
  name: string;
  source: 'friendlist' | 'user-configured';
  transport: string;
  command?: string;
  tools: { name: string; description: string }[];
}
export interface ToolInfo {
  name: string;
  description: string;
  source: string;
}
export interface ToolUsageResponse {
  aggregate: Record<string, number>;
  bySession: { sessionId: string; sessionName: string; usage: Record<string, number> }[];
}
export const getMCPServers = () => request<MCPServerInfo[]>('/tools/servers');
export const getToolCatalog = () => request<ToolInfo[]>('/tools/catalog');
export const getToolUsage = (sessionId?: string) =>
  request<ToolUsageResponse>(`/tools/usage${sessionId ? `?sessionId=${sessionId}` : ''}`);
