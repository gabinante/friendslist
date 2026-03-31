import type { TaskPhase } from '../../shared/types.js';

export const VALID_TRANSITIONS: Record<TaskPhase, TaskPhase[]> = {
  backlog: ['in_progress'],
  in_progress: ['testing', 'completed', 'backlog'],
  testing: ['completed', 'in_progress'],
  completed: ['backlog'],
};
