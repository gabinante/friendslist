#!/usr/bin/env node

/**
 * Friendlist MCP Server
 *
 * Exposes control plane tools to Claude Code sessions so they can:
 * - List and read tasks, pick up work, update task phases
 * - Send gossip messages to other sessions
 * - Check other sessions' status
 * - Report their own completion
 *
 * Runs as a stdio MCP server. The Friendlist backend passes this to
 * each Claude session via --mcp-config.
 *
 * Communicates with the main Friendlist server via its REST API.
 */

import { createInterface } from 'readline';

const API_BASE = process.env.FRIENDLIST_API ?? 'http://localhost:3456/api';
const SESSION_ID = process.env.FRIENDLIST_SESSION_ID ?? '';
const SESSION_NAME = process.env.FRIENDLIST_SESSION_NAME ?? '';

// --- MCP Protocol helpers ---

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

function respond(id: number | string, result: unknown): void {
  const msg: JsonRpcResponse = { jsonrpc: '2.0', id, result };
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function respondError(id: number | string, code: number, message: string): void {
  const msg: JsonRpcResponse = { jsonrpc: '2.0', id, error: { code, message } };
  process.stdout.write(JSON.stringify(msg) + '\n');
}

async function apiCall(path: string, options?: RequestInit): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return res.json();
}

// --- Tool definitions ---

const TOOLS = [
  {
    name: 'friendlist_list_tasks',
    description: 'List all tasks in the Friendlist control plane. Optionally filter by phase (backlog, in_progress, testing, completed).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        phase: {
          type: 'string',
          enum: ['backlog', 'in_progress', 'testing', 'completed'],
          description: 'Filter tasks by phase',
        },
      },
    },
  },
  {
    name: 'friendlist_get_task',
    description: 'Get details of a specific task by ID, including its description and current phase.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        task_id: { type: 'string', description: 'The task ID' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'friendlist_update_task_phase',
    description: 'Update a task\'s phase. Valid transitions: backlog->in_progress, in_progress->testing, in_progress->completed, testing->completed, testing->in_progress.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        task_id: { type: 'string', description: 'The task ID' },
        phase: {
          type: 'string',
          enum: ['backlog', 'in_progress', 'testing', 'completed'],
          description: 'The new phase',
        },
      },
      required: ['task_id', 'phase'],
    },
  },
  {
    name: 'friendlist_pick_up_task',
    description: 'Pick up the highest-priority backlog task and assign it to this session. Moves the task to in_progress.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'friendlist_send_gossip',
    description: 'Send a message to another Claude Code session. Use this to ask questions, share information, or coordinate work. Leave to_session empty to broadcast to all sessions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        message: { type: 'string', description: 'The message to send' },
        to_session: { type: 'string', description: 'Target session name/alias (empty for broadcast)' },
      },
      required: ['message'],
    },
  },
  {
    name: 'friendlist_list_sessions',
    description: 'List all active Claude Code sessions and their current status.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'friendlist_read_gossip',
    description: 'Read recent gossip messages for this session.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'friendlist_report_done',
    description: 'Report that you have completed your current work. This triggers a notification to the user.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        summary: { type: 'string', description: 'Brief summary of what was accomplished' },
      },
      required: ['summary'],
    },
  },
  {
    name: 'friendlist_create_task',
    description: 'Create a new task in the Friendlist task board.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Task description' },
        parent_id: { type: 'string', description: 'Parent task ID (for subtasks)' },
      },
      required: ['title', 'description'],
    },
  },
];

// --- Tool execution ---

async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'friendlist_list_tasks': {
      const phase = args.phase as string | undefined;
      return apiCall(`/tasks${phase ? `?phase=${phase}` : ''}`);
    }

    case 'friendlist_get_task': {
      return apiCall(`/tasks/${args.task_id}`);
    }

    case 'friendlist_update_task_phase': {
      return apiCall(`/tasks/${args.task_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ phase: args.phase }),
      });
    }

    case 'friendlist_pick_up_task': {
      // Get backlog tasks sorted by priority
      const tasks = (await apiCall('/tasks?phase=backlog')) as { id: string; title: string; priority: number }[];
      if (!Array.isArray(tasks) || tasks.length === 0) {
        return { message: 'No backlog tasks available' };
      }
      const task = tasks.sort((a, b) => a.priority - b.priority)[0];
      // Assign to this session and move to in_progress
      await apiCall(`/tasks/${task.id}/assign`, {
        method: 'POST',
        body: JSON.stringify({ sessionId: SESSION_ID }),
      });
      await apiCall(`/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ phase: 'in_progress' }),
      });
      return { message: `Picked up task: ${task.title}`, task };
    }

    case 'friendlist_send_gossip': {
      // Resolve session name/alias to ID
      let toSessionId: string | undefined;
      if (args.to_session) {
        const sessions = (await apiCall('/sessions')) as { id: string; name: string; alias: string | null }[];
        const target = sessions.find(
          s => s.name === args.to_session || s.alias === args.to_session
        );
        if (!target) {
          return { error: `Session "${args.to_session}" not found. Available: ${sessions.map(s => s.name).join(', ')}` };
        }
        toSessionId = target.id;
      }
      return apiCall('/gossip', {
        method: 'POST',
        body: JSON.stringify({
          fromSessionId: SESSION_ID,
          toSessionId,
          content: args.message,
        }),
      });
    }

    case 'friendlist_list_sessions': {
      const sessions = (await apiCall('/sessions')) as { id: string; name: string; alias: string | null; status: string; cwd: string }[];
      return sessions.map(s => ({
        name: s.name,
        alias: s.alias,
        status: s.status,
        cwd: s.cwd,
        isMe: s.id === SESSION_ID,
      }));
    }

    case 'friendlist_read_gossip': {
      return apiCall(`/gossip?sessionId=${SESSION_ID}`);
    }

    case 'friendlist_report_done': {
      await apiCall('/notify/test', {
        method: 'POST',
        body: JSON.stringify({
          title: `Session "${SESSION_NAME}" completed`,
          body: args.summary,
          level: 'success',
        }),
      });
      return { message: 'User has been notified' };
    }

    case 'friendlist_create_task': {
      return apiCall('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: args.title,
          description: args.description,
          parentId: args.parent_id,
        }),
      });
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// --- MCP message handling ---

async function handleMessage(msg: JsonRpcRequest): Promise<void> {
  try {
    switch (msg.method) {
      case 'initialize':
        respond(msg.id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'friendlist', version: '0.1.0' },
        });
        break;

      case 'notifications/initialized':
        // No response needed for notifications
        break;

      case 'tools/list':
        respond(msg.id, { tools: TOOLS });
        break;

      case 'tools/call': {
        const { name, arguments: args } = msg.params as { name: string; arguments: Record<string, unknown> };
        const result = await executeTool(name, args ?? {});
        respond(msg.id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        });
        break;
      }

      default:
        respondError(msg.id, -32601, `Method not found: ${msg.method}`);
    }
  } catch (err) {
    respondError(msg.id, -32603, err instanceof Error ? err.message : 'Internal error');
  }
}

// --- Main loop ---

const rl = createInterface({ input: process.stdin });

rl.on('line', (line) => {
  try {
    const msg = JSON.parse(line) as JsonRpcRequest;
    handleMessage(msg);
  } catch {
    // Ignore malformed input
  }
});
