import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  claudeSessionId: text('claude_session_id').notNull(),
  name: text('name').notNull(),
  alias: text('alias'),
  status: text('status').notNull().default('idle'),
  cwd: text('cwd').notNull(),
  pid: integer('pid'),
  model: text('model').notNull().default('sonnet'),
  createdAt: text('created_at').notNull(),
  lastActivityAt: text('last_activity_at').notNull(),
  currentTaskId: text('current_task_id'),
});

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  parentId: text('parent_id'),
  title: text('title').notNull(),
  description: text('description').notNull(),
  phase: text('phase').notNull().default('backlog'),
  assignedSessionId: text('assigned_session_id'),
  priority: integer('priority').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  completedAt: text('completed_at'),
});

export const gossipMessages = sqliteTable('gossip_messages', {
  id: text('id').primaryKey(),
  fromSessionId: text('from_session_id').notNull(),
  toSessionId: text('to_session_id'),
  content: text('content').notNull(),
  responseContent: text('response_content'),
  status: text('status').notNull().default('pending'),
  createdAt: text('created_at').notNull(),
  respondedAt: text('responded_at'),
});

export const loopConfigs = sqliteTable('loop_configs', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  prompt: text('prompt').notNull(),
  exitCondition: text('exit_condition').notNull(), // JSON string
  maxIterations: integer('max_iterations').notNull().default(10),
  currentIteration: integer('current_iteration').notNull().default(0),
  status: text('status').notNull().default('running'),
  intervalMs: integer('interval_ms').notNull().default(1000),
  lastResult: text('last_result'),
  createdAt: text('created_at').notNull(),
});

export const flowDefinitions = sqliteTable('flow_definitions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  steps: text('steps').notNull(), // JSON string
  status: text('status').notNull().default('draft'),
  currentStepIndex: integer('current_step_index').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

export const flowSteps = sqliteTable('flow_steps', {
  id: text('id').primaryKey(),
  flowId: text('flow_id').notNull(),
  index: integer('index').notNull(),
  sessionAlias: text('session_alias').notNull(),
  prompt: text('prompt').notNull(),
  dependsOnOutput: integer('depends_on_output', { mode: 'boolean' }).notNull().default(true),
  status: text('status').notNull().default('pending'),
  output: text('output'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
});

export const notificationPreferences = sqliteTable('notification_preferences', {
  id: text('id').primaryKey(),
  channel: text('channel').notNull(), // 'macos' | 'browser' | 'webhook'
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  config: text('config'), // JSON string (e.g., webhook URL)
  events: text('events').notNull(), // JSON array of event types
});
