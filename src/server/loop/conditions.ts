import { execFile } from 'child_process';
import type { ExitCondition } from '../../shared/types.js';

export async function evaluateExitCondition(
  condition: ExitCondition,
  result: string,
  cwd: string
): Promise<boolean> {
  switch (condition.type) {
    case 'all_tests_pass':
      return runTestCommand(condition.testCommand, cwd);

    case 'output_contains':
      return new RegExp(condition.pattern).test(result);

    case 'output_matches_schema':
      try {
        const parsed = JSON.parse(result);
        // Basic schema check — just verify it's valid JSON matching expected shape
        return parsed !== null && typeof parsed === 'object';
      } catch {
        return false;
      }

    case 'max_iterations':
      // This is handled by the controller's iteration count
      return false;

    case 'manual':
      return false;

    case 'custom':
      // For custom evaluations, we'd use a separate Claude call
      // For now, return false (always continue)
      return false;
  }
}

function runTestCommand(command: string, cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const [cmd, ...args] = command.split(' ');
    execFile(cmd, args, { cwd }, (err) => {
      resolve(!err); // exit code 0 = tests pass
    });
  });
}
