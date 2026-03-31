import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  toolUse?: { name: string; input: string }[];
  timestamp: string;
}

interface JSONLRecord {
  type: string;
  subtype?: string;
  message?: {
    role?: string;
    content?: string | Array<{ type: string; text?: string; name?: string; input?: unknown }>;
  };
  timestamp?: string;
  [key: string]: unknown;
}

/** Convert an absolute cwd path to Claude CLI's project directory name */
function cwdToProjectDir(cwd: string): string {
  return cwd.replace(/\//g, '-');
}

/** Get the path to a Claude CLI JSONL conversation file */
function getJsonlPath(realClaudeSessionId: string, cwd: string): string {
  const projectDir = cwdToProjectDir(cwd);
  return join(homedir(), '.claude', 'projects', projectDir, `${realClaudeSessionId}.jsonl`);
}

/** Extract text content from a message's content field */
function extractText(content: string | Array<{ type: string; text?: string }>): string {
  if (typeof content === 'string') return content;
  return content
    .filter(b => b.type === 'text' && b.text)
    .map(b => b.text!)
    .join('');
}

/** Extract thinking content from content blocks */
function extractThinking(content: Array<{ type: string; text?: string }>): string | undefined {
  const parts = content
    .filter(b => b.type === 'thinking' && b.text)
    .map(b => b.text!);
  return parts.length > 0 ? parts.join('\n') : undefined;
}

/** Extract tool use from content blocks */
function extractToolUse(content: Array<{ type: string; name?: string; input?: unknown }>): { name: string; input: string }[] | undefined {
  const tools = content
    .filter(b => b.type === 'tool_use' && b.name)
    .map(b => ({
      name: b.name!,
      input: typeof b.input === 'string' ? b.input : JSON.stringify(b.input ?? {}),
    }));
  return tools.length > 0 ? tools : undefined;
}

/**
 * Read chat history from a Claude CLI JSONL file.
 * Returns structured messages suitable for display.
 */
export function getSessionHistory(realClaudeSessionId: string, cwd: string): HistoryMessage[] {
  const filePath = getJsonlPath(realClaudeSessionId, cwd);

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const messages: HistoryMessage[] = [];

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;

    let record: JSONLRecord;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    if (record.type !== 'user' && record.type !== 'assistant') continue;
    if (!record.message?.content) continue;

    const content = record.message.content;
    const text = extractText(content);
    if (!text) continue;

    const msg: HistoryMessage = {
      role: record.type as 'user' | 'assistant',
      content: text,
      timestamp: record.timestamp ?? '',
    };

    if (Array.isArray(content)) {
      msg.thinking = extractThinking(content);
      msg.toolUse = extractToolUse(content);
    }

    messages.push(msg);
  }

  return messages;
}

/**
 * Count tool usage from a Claude CLI JSONL file.
 * Returns a map of tool name → invocation count.
 */
export function getSessionToolUsage(realClaudeSessionId: string, cwd: string): Record<string, number> {
  const filePath = getJsonlPath(realClaudeSessionId, cwd);

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    return {};
  }

  const counts: Record<string, number> = {};

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;

    let record: JSONLRecord;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    if (record.type !== 'assistant') continue;
    const content = record.message?.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (block.type === 'tool_use' && block.name) {
        counts[block.name] = (counts[block.name] ?? 0) + 1;
      }
    }
  }

  return counts;
}

export interface DiscoveredSession {
  realClaudeSessionId: string;
  cwd: string;
  name: string;
  model: string;
  createdAt: string;
  lastActivityAt: string;
}

/**
 * Scan ~/.claude/projects/ for all JSONL conversation files.
 * Returns metadata for each discovered session.
 */
export function discoverClaudeSessions(): DiscoveredSession[] {
  const projectsDir = join(homedir(), '.claude', 'projects');
  let projectDirs: string[];
  try {
    projectDirs = readdirSync(projectsDir).filter(d => {
      try {
        return statSync(join(projectsDir, d)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }

  const discovered: DiscoveredSession[] = [];

  for (const dir of projectDirs) {
    const dirPath = join(projectsDir, dir);

    let files: string[];
    try {
      files = readdirSync(dirPath).filter(f => f.endsWith('.jsonl'));
    } catch {
      continue;
    }

    for (const file of files) {
      const sessionId = basename(file, '.jsonl');
      const filePath = join(dirPath, file);

      // Read just enough of the file to extract metadata
      let raw: string;
      try {
        raw = readFileSync(filePath, 'utf-8');
      } catch {
        continue;
      }

      let name: string | null = null;
      let cwd: string | null = null;
      let model: string | null = null;
      let firstTimestamp: string | null = null;
      let lastTimestamp: string | null = null;

      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        try {
          const rec = JSON.parse(line);
          if (rec.type === 'custom-title' && rec.customTitle) {
            name = rec.customTitle;
          }
          if (!name && rec.slug) {
            name = rec.slug;
          }
          if (!cwd && rec.cwd) {
            cwd = rec.cwd;
          }
          if (!model && rec.message?.model) {
            model = rec.message.model;
          }
          if (!firstTimestamp && rec.timestamp) {
            firstTimestamp = rec.timestamp;
          }
          if (rec.timestamp) {
            lastTimestamp = rec.timestamp;
          }
        } catch {
          continue;
        }
      }

      if (!cwd) continue; // Can't determine working directory, skip

      discovered.push({
        realClaudeSessionId: sessionId,
        cwd,
        name: name ?? sessionId.slice(0, 8),
        model: model ?? 'sonnet',
        createdAt: firstTimestamp ?? new Date().toISOString(),
        lastActivityAt: lastTimestamp ?? new Date().toISOString(),
      });
    }
  }

  return discovered;
}
