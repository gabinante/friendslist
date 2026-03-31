import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { TOOLS } from './tools.js';
import { getSessionToolUsage } from '../session/history.js';
import type { SessionManager } from '../session/manager.js';

interface MCPServerInfo {
  name: string;
  source: 'friendlist' | 'user-configured';
  transport: string;
  command?: string;
  tools: { name: string; description: string }[];
}

interface ToolInfo {
  name: string;
  description: string;
  source: string;
}

interface ToolUsageResponse {
  aggregate: Record<string, number>;
  bySession: { sessionId: string; sessionName: string; usage: Record<string, number> }[];
}

const CLAUDE_BUILTIN_TOOLS: ToolInfo[] = [
  { name: 'Bash', description: 'Execute shell commands', source: 'claude-builtin' },
  { name: 'Read', description: 'Read file contents', source: 'claude-builtin' },
  { name: 'Write', description: 'Write file contents', source: 'claude-builtin' },
  { name: 'Edit', description: 'Edit files with string replacement', source: 'claude-builtin' },
  { name: 'Grep', description: 'Search file contents with regex', source: 'claude-builtin' },
  { name: 'Glob', description: 'Find files by pattern', source: 'claude-builtin' },
  { name: 'Agent', description: 'Launch subagents for complex tasks', source: 'claude-builtin' },
  { name: 'WebFetch', description: 'Fetch web content', source: 'claude-builtin' },
  { name: 'WebSearch', description: 'Search the web', source: 'claude-builtin' },
  { name: 'TodoRead', description: 'Read task list', source: 'claude-builtin' },
  { name: 'TodoWrite', description: 'Write to task list', source: 'claude-builtin' },
  { name: 'NotebookEdit', description: 'Edit Jupyter notebooks', source: 'claude-builtin' },
];

/** Read user-configured MCP servers from ~/.claude/settings.json */
function getUserMCPServers(): MCPServerInfo[] {
  try {
    const raw = readFileSync(join(homedir(), '.claude', 'settings.json'), 'utf-8');
    const settings = JSON.parse(raw);
    const servers = settings.mcpServers ?? {};
    return Object.entries(servers).map(([name, cfg]: [string, unknown]) => {
      const config = cfg as Record<string, unknown>;
      return {
        name,
        source: 'user-configured' as const,
        transport: (config.type as string) ?? 'stdio',
        command: config.command as string | undefined,
        tools: [], // Can't query without connecting
      };
    });
  } catch {
    return [];
  }
}

// Simple cache for tool usage aggregation
let usageCache: { data: ToolUsageResponse; timestamp: number } | null = null;
const CACHE_TTL_MS = 30_000;

export function registerToolRoutes(app: FastifyInstance, sessionManager: SessionManager): void {
  // List MCP servers
  app.get('/api/tools/servers', async () => {
    const friendlistServer: MCPServerInfo = {
      name: 'friendlist',
      source: 'friendlist',
      transport: 'stdio',
      command: 'npx tsx src/server/mcp/server.ts',
      tools: TOOLS.map(t => ({ name: t.name, description: t.description })),
    };

    const userServers = getUserMCPServers();
    return [friendlistServer, ...userServers];
  });

  // Full tool catalog
  app.get('/api/tools/catalog', async () => {
    const friendlistTools: ToolInfo[] = TOOLS.map(t => ({
      name: t.name,
      description: t.description,
      source: 'friendlist',
    }));

    return [...CLAUDE_BUILTIN_TOOLS, ...friendlistTools];
  });

  // Tool usage aggregation
  app.get<{ Querystring: { sessionId?: string } }>('/api/tools/usage', async (req) => {
    const { sessionId } = req.query;

    // Single session
    if (sessionId) {
      const info = sessionManager.getSessionHistoryInfo(sessionId);
      if (!info?.realClaudeSessionId) return { aggregate: {}, bySession: [] };
      const usage = getSessionToolUsage(info.realClaudeSessionId, info.cwd);
      const session = sessionManager.getSession(sessionId);
      return {
        aggregate: usage,
        bySession: [{ sessionId, sessionName: session?.name ?? sessionId, usage }],
      };
    }

    // All sessions — use cache
    if (usageCache && Date.now() - usageCache.timestamp < CACHE_TTL_MS) {
      return usageCache.data;
    }

    const sessions = sessionManager.listSessions();
    const aggregate: Record<string, number> = {};
    const bySession: ToolUsageResponse['bySession'] = [];

    for (const session of sessions) {
      const info = sessionManager.getSessionHistoryInfo(session.id);
      if (!info?.realClaudeSessionId) continue;

      const usage = getSessionToolUsage(info.realClaudeSessionId, info.cwd);
      if (Object.keys(usage).length === 0) continue;

      bySession.push({ sessionId: session.id, sessionName: session.name, usage });
      for (const [tool, count] of Object.entries(usage)) {
        aggregate[tool] = (aggregate[tool] ?? 0) + count;
      }
    }

    const data: ToolUsageResponse = { aggregate, bySession };
    usageCache = { data, timestamp: Date.now() };
    return data;
  });
}
