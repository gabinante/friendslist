export const TOOLS = [
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
