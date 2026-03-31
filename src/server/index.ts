import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { wsHub } from './ws/hub.js';
import { SessionManager } from './session/manager.js';
import { TaskTracker } from './task/tracker.js';
import { MessageBus } from './gossip/bus.js';
import { LoopController } from './loop/controller.js';
import { FlowEngine } from './flow/engine.js';
import { Notifier } from './notify/notifier.js';
import { registerSessionRoutes } from './session/router.js';
import { registerTaskRoutes } from './task/router.js';
import { registerGossipRoutes } from './gossip/router.js';
import { registerLoopRoutes } from './loop/router.js';
import { registerFlowRoutes } from './flow/router.js';
import { loadFlowsFromDisk } from './flow/loader.js';
import { registerNotifyRoutes } from './notify/router.js';
import { registerDirRoutes } from './dirs/router.js';
import { registerTagRoutes } from './tags/router.js';

// Ensure tables exist
import { db } from './db/connection.js';
import { sql } from 'drizzle-orm';

// Create tables if they don't exist (simple bootstrap — use migrations for production)
db.run(sql`CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  claude_session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  alias TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  cwd TEXT NOT NULL,
  pid INTEGER,
  model TEXT NOT NULL DEFAULT 'sonnet',
  created_at TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
  current_task_id TEXT,
  real_claude_session_id TEXT,
  tracked INTEGER NOT NULL DEFAULT 1,
  summary TEXT
)`);

// Migration: add real_claude_session_id column to existing databases
try {
  db.run(sql`ALTER TABLE sessions ADD COLUMN real_claude_session_id TEXT`);
} catch {
  // Column already exists
}

// Migrate existing sessions table to add new columns
try { db.run(sql`ALTER TABLE sessions ADD COLUMN tracked INTEGER NOT NULL DEFAULT 1`); } catch (_) { /* already exists */ }
try { db.run(sql`ALTER TABLE sessions ADD COLUMN summary TEXT`); } catch (_) { /* already exists */ }

db.run(sql`CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'backlog',
  assigned_session_id TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
)`);

db.run(sql`CREATE TABLE IF NOT EXISTS gossip_messages (
  id TEXT PRIMARY KEY,
  from_session_id TEXT NOT NULL,
  to_session_id TEXT,
  content TEXT NOT NULL,
  response_content TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  responded_at TEXT
)`);

db.run(sql`CREATE TABLE IF NOT EXISTS loop_configs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  exit_condition TEXT NOT NULL,
  max_iterations INTEGER NOT NULL DEFAULT 10,
  current_iteration INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  interval_ms INTEGER NOT NULL DEFAULT 1000,
  last_result TEXT,
  created_at TEXT NOT NULL
)`);

db.run(sql`CREATE TABLE IF NOT EXISTS flow_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  steps TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  current_step_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
)`);

db.run(sql`CREATE TABLE IF NOT EXISTS flow_steps (
  id TEXT PRIMARY KEY,
  flow_id TEXT NOT NULL,
  "index" INTEGER NOT NULL,
  session_alias TEXT NOT NULL,
  prompt TEXT NOT NULL,
  depends_on_output INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  output TEXT,
  started_at TEXT,
  completed_at TEXT
)`);

db.run(sql`CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TEXT NOT NULL
)`);

db.run(sql`CREATE TABLE IF NOT EXISTS session_tags (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  UNIQUE(session_id, tag_id)
)`);

db.run(sql`CREATE TABLE IF NOT EXISTS notification_preferences (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  config TEXT,
  events TEXT NOT NULL
)`);

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(websocket);

  // Initialize services
  const notifier = new Notifier();
  const sessionManager = new SessionManager();
  const taskTracker = new TaskTracker();
  const messageBus = new MessageBus();
  const loopController = new LoopController(sessionManager, notifier);
  const flowEngine = new FlowEngine(sessionManager, notifier);

  // Wire up WebSocket broadcasting
  sessionManager.on('session:created', (session) => wsHub.broadcast({ type: 'session:created', session }));
  sessionManager.on('session:updated', (session) => wsHub.broadcast({ type: 'session:updated', session }));
  sessionManager.on('session:deleted', (sessionId) => wsHub.broadcast({ type: 'session:deleted', sessionId }));
  sessionManager.on('session:output', (data) => wsHub.broadcast({ type: 'session:output', ...data }));
  sessionManager.on('session:thinking', (data) => wsHub.broadcast({ type: 'session:thinking', ...data }));
  sessionManager.on('session:tool_use', (data) => wsHub.broadcast({ type: 'session:tool_use', ...data }));
  sessionManager.on('session:result_meta', (data) => wsHub.broadcast({ type: 'session:result_meta', ...data }));

  taskTracker.on('task:created', (task) => wsHub.broadcast({ type: 'task:created', task }));
  taskTracker.on('task:updated', (task) => wsHub.broadcast({ type: 'task:updated', task }));

  messageBus.on('gossip:message', (message) => wsHub.broadcast({ type: 'gossip:message', message }));
  messageBus.on('gossip:response', (message) => wsHub.broadcast({ type: 'gossip:response', message }));

  loopController.on('loop:update', (loop) => wsHub.broadcast({ type: 'loop:update', loop }));

  // Notify when session goes idle with no task
  sessionManager.on('session:updated', async (session) => {
    if (session.status === 'idle' && !session.currentTaskId) {
      await notifier.notify({
        title: `Session "${session.name}" is idle`,
        body: 'Session has completed its work and has no more tasks.',
        level: 'info',
      });
    }
  });

  // Register routes
  registerSessionRoutes(app, sessionManager);
  registerTaskRoutes(app, taskTracker);
  registerGossipRoutes(app, messageBus);
  registerLoopRoutes(app, loopController);
  registerFlowRoutes(app, flowEngine);
  registerNotifyRoutes(app, notifier);
  registerDirRoutes(app);
  registerTagRoutes(app);

  // WebSocket endpoint
  app.get('/ws', { websocket: true }, (socket) => {
    wsHub.addClient(socket);
  });

  // Health check
  app.get('/api/health', async () => ({ ok: true, clients: wsHub.clientCount }));

  // Auto-load flow definitions from flows/ directory
  const flowsDir = new URL('../../../flows', import.meta.url).pathname;
  const loaded = await loadFlowsFromDisk(flowEngine, flowsDir);
  if (loaded > 0) console.log(`Auto-loaded ${loaded} flow(s) from ${flowsDir}`);

  const port = parseInt(process.env.PORT ?? '3456');
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`Friendlist server running on http://localhost:${port}`);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
