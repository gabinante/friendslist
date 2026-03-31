import type { ExitCondition } from '../../shared/types.js';

export interface LoopContext {
  iteration: number;
  lastResult: string | null;
  prompt: string;
  exitCondition: ExitCondition;
}
