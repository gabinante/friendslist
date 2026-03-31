# Validation System Proposal

Adapting claude-prove's validation system to Friendlist flows.

## Overview

Add a robust validation system that:
1. Executes shell commands after each flow step (build, lint, test)
2. Supports phase-based ordering
3. Auto-detects project type
4. Optionally supports LLM-based validation
5. Implements one-retry-then-halt logic

## Configuration Format

`.claude/.prove.json` (or `.friendlist/config.json`):

```json
{
  "schema_version": "1",
  "validators": [
    {
      "name": "typecheck",
      "command": "npx tsc --noEmit",
      "phase": "build"
    },
    {
      "name": "lint",
      "command": "npm run lint",
      "phase": "lint"
    },
    {
      "name": "tests",
      "command": "npm test",
      "phase": "test"
    },
    {
      "name": "e2e",
      "command": "npm run test:e2e",
      "phase": "custom"
    }
  ]
}
```

## Implementation Plan

### 1. Add Database Schema

```typescript
// src/server/db/schema.ts

export const validationResults = sqliteTable('validation_results', {
  id: text('id').primaryKey(),
  flowId: text('flow_id').references(() => flowDefinitions.id),
  stepIndex: integer('step_index').notNull(),
  validatorName: text('validator_name').notNull(),
  phase: text('phase').notNull(), // build, lint, test, custom, llm
  passed: integer('passed', { mode: 'boolean' }).notNull(),
  duration: integer('duration').notNull(), // milliseconds
  output: text('output'), // stdout/stderr
  attemptNumber: integer('attempt_number').notNull().default(1),
  createdAt: text('created_at').notNull(),
});
```

### 2. Create Validator Types

```typescript
// src/server/validation/types.ts

export type ValidatorPhase = 'build' | 'lint' | 'test' | 'custom' | 'llm';

export interface ValidatorConfig {
  name: string;
  phase: ValidatorPhase;
  command?: string;  // For shell validators
  prompt?: string;   // For LLM validators (future)
}

export interface ValidationResult {
  name: string;
  phase: ValidatorPhase;
  passed: boolean;
  duration: number;
  output?: string;
  attemptNumber: number;
}

export interface ProveConfig {
  schema_version: string;
  validators: ValidatorConfig[];
  reporters?: ReporterConfig[];
}

export class ValidationError extends Error {
  constructor(
    public validatorName: string,
    public output: string,
    public attemptNumber: number
  ) {
    super(`Validation failed: ${validatorName} (attempt ${attemptNumber})`);
    this.name = 'ValidationError';
  }
}
```

### 3. Config Loader with Auto-Detection

```typescript
// src/server/validation/config-loader.ts

import fs from 'fs/promises';
import path from 'path';

export class ConfigLoader {
  /**
   * Load validators from config file or auto-detect
   */
  async loadValidators(cwd: string): Promise<ValidatorConfig[]> {
    // Try to load from config file
    const configPath = path.join(cwd, '.claude/.prove.json');
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const config: ProveConfig = JSON.parse(content);
      return config.validators || [];
    } catch (err) {
      // Config not found, auto-detect
      return this.autoDetectValidators(cwd);
    }
  }

  /**
   * Auto-detect validators based on project structure
   */
  private async autoDetectValidators(cwd: string): Promise<ValidatorConfig[]> {
    const validators: ValidatorConfig[] = [];

    // Node/TypeScript
    if (await this.fileExists(path.join(cwd, 'package.json'))) {
      const pkg = JSON.parse(
        await fs.readFile(path.join(cwd, 'package.json'), 'utf-8')
      );

      // TypeScript
      if (await this.fileExists(path.join(cwd, 'tsconfig.json'))) {
        validators.push({
          name: 'typecheck',
          command: 'npx tsc --noEmit',
          phase: 'build',
        });
      }

      // ESLint
      if (
        await this.fileExists(path.join(cwd, '.eslintrc')) ||
        await this.fileExists(path.join(cwd, '.eslintrc.json')) ||
        pkg.eslintConfig
      ) {
        validators.push({
          name: 'lint',
          command: 'npm run lint',
          phase: 'lint',
        });
      }

      // Tests
      if (pkg.scripts?.test) {
        validators.push({
          name: 'test',
          command: 'npm test',
          phase: 'test',
        });
      }
    }

    // Go
    if (await this.fileExists(path.join(cwd, 'go.mod'))) {
      validators.push(
        { name: 'build', command: 'go build ./...', phase: 'build' },
        { name: 'vet', command: 'go vet ./...', phase: 'lint' },
        { name: 'test', command: 'go test ./...', phase: 'test' }
      );
    }

    // Rust
    if (await this.fileExists(path.join(cwd, 'Cargo.toml'))) {
      validators.push(
        { name: 'check', command: 'cargo check', phase: 'build' },
        { name: 'clippy', command: 'cargo clippy', phase: 'lint' },
        { name: 'test', command: 'cargo test', phase: 'test' }
      );
    }

    // Python
    if (
      await this.fileExists(path.join(cwd, 'pyproject.toml')) ||
      await this.fileExists(path.join(cwd, 'setup.py'))
    ) {
      validators.push(
        { name: 'test', command: 'pytest', phase: 'test' }
      );

      // Optional: mypy if installed
      if (await this.commandExists('mypy')) {
        validators.push({
          name: 'typecheck',
          command: 'mypy .',
          phase: 'lint',
        });
      }
    }

    return validators;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async commandExists(cmd: string): Promise<boolean> {
    try {
      const { execa } = await import('execa');
      await execa('which', [cmd]);
      return true;
    } catch {
      return false;
    }
  }
}
```

### 4. Validation Runner

```typescript
// src/server/validation/runner.ts

import { execa } from 'execa';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection.js';
import { validationResults } from '../db/schema.js';
import type { ValidatorConfig, ValidationResult } from './types.js';
import { ValidationError } from './types.js';

export class ValidationRunner {
  constructor(
    private cwd: string,
    private flowId: string,
    private stepIndex: number
  ) {}

  /**
   * Run all validators in phase order
   * Throws ValidationError if any validator fails after retry
   */
  async runAll(validators: ValidatorConfig[]): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    // Phase order
    const phases = ['build', 'lint', 'test', 'custom', 'llm'];

    for (const phase of phases) {
      const phaseValidators = validators.filter(v => v.phase === phase);

      for (const validator of phaseValidators) {
        const result = await this.runValidator(validator, 1);
        results.push(result);

        // Save to database
        this.saveResult(result);

        if (!result.passed) {
          // One retry attempt
          console.log(`[Validator] ${validator.name} failed, retrying...`);
          const retryResult = await this.runValidator(validator, 2);
          results.push(retryResult);
          this.saveResult(retryResult);

          if (!retryResult.passed) {
            // Halt - no more retries
            throw new ValidationError(
              validator.name,
              retryResult.output || '',
              2
            );
          }
        }
      }
    }

    return results;
  }

  /**
   * Run a single validator
   */
  private async runValidator(
    validator: ValidatorConfig,
    attemptNumber: number
  ): Promise<ValidationResult> {
    if (validator.command) {
      return this.runCommandValidator(validator, attemptNumber);
    } else if (validator.prompt) {
      return this.runLlmValidator(validator, attemptNumber);
    } else {
      throw new Error(`Validator ${validator.name} has no command or prompt`);
    }
  }

  /**
   * Run shell command validator
   */
  private async runCommandValidator(
    validator: ValidatorConfig,
    attemptNumber: number
  ): Promise<ValidationResult> {
    const startTime = Date.now();

    try {
      const result = await execa('bash', ['-c', validator.command!], {
        cwd: this.cwd,
        timeout: 5 * 60 * 1000, // 5 minute timeout
      });

      const duration = Date.now() - startTime;

      return {
        name: validator.name,
        phase: validator.phase,
        passed: true,
        duration,
        output: result.stdout,
        attemptNumber,
      };
    } catch (err: any) {
      const duration = Date.now() - startTime;

      return {
        name: validator.name,
        phase: validator.phase,
        passed: false,
        duration,
        output: err.stderr || err.stdout || err.message,
        attemptNumber,
      };
    }
  }

  /**
   * Run LLM validator (future implementation)
   */
  private async runLlmValidator(
    validator: ValidatorConfig,
    attemptNumber: number
  ): Promise<ValidationResult> {
    // TODO: Implement LLM validation
    // 1. Read prompt file
    // 2. Get git diff of recent changes
    // 3. Spawn validation agent with prompt + diff
    // 4. Parse PASS/FAIL verdict

    throw new Error('LLM validators not yet implemented');
  }

  /**
   * Save validation result to database
   */
  private saveResult(result: ValidationResult): void {
    db.insert(validationResults)
      .values({
        id: uuidv4(),
        flowId: this.flowId,
        stepIndex: this.stepIndex,
        validatorName: result.name,
        phase: result.phase,
        passed: result.passed,
        duration: result.duration,
        output: result.output,
        attemptNumber: result.attemptNumber,
        createdAt: new Date().toISOString(),
      })
      .run();
  }
}
```

### 5. Integrate with Flow Engine

```typescript
// src/server/flow/engine.ts (additions)

import { ConfigLoader } from '../validation/config-loader.js';
import { ValidationRunner } from '../validation/runner.js';
import { ValidationError } from '../validation/types.js';

export class FlowEngine extends EventEmitter {
  // ... existing code ...

  private async executeSessionStep(
    flowId: string,
    step: FlowStepDef,
    outputs: Map<string, string>,
    stepIndex: number
  ): Promise<{ alias: string; output: string }> {
    // ... existing prompt execution code ...

    const result = await this.sessionManager.sendPrompt(session.id, prompt);

    // NEW: Run validators after step completion
    const session = this.sessionManager.getSession(sessionId);
    const cwd = session.cwd;

    try {
      const configLoader = new ConfigLoader();
      const validators = await configLoader.loadValidators(cwd);

      if (validators.length > 0) {
        console.log(`[Flow] Running ${validators.length} validators...`);
        const runner = new ValidationRunner(cwd, flowId, stepIndex);
        const validationResults = await runner.runAll(validators);

        await this.notifier.notify({
          title: 'Validation passed',
          body: `All ${validationResults.length} validators passed`,
          level: 'success',
        });
      }
    } catch (err) {
      if (err instanceof ValidationError) {
        await this.notifier.notify({
          title: 'Validation failed',
          body: `${err.validatorName} failed after ${err.attemptNumber} attempts`,
          level: 'error',
        });

        // Mark step as failed
        if (stepRows.length > 0) {
          db.update(flowSteps)
            .set({ status: 'failed' as FlowStepStatus })
            .where(eq(flowSteps.id, stepRows[0].id))
            .run();
        }

        throw err;
      }
      throw err;
    }

    // ... existing completion code ...
  }
}
```

### 6. Add REST API Endpoints

```typescript
// src/server/index.ts (additions)

// Get validation results for a flow
fastify.get('/api/flows/:flowId/validations', async (request) => {
  const { flowId } = request.params as { flowId: string };

  const results = db
    .select()
    .from(validationResults)
    .where(eq(validationResults.flowId, flowId))
    .orderBy(
      asc(validationResults.stepIndex),
      asc(validationResults.createdAt)
    )
    .all();

  return { validations: results };
});

// Get validation results for a specific step
fastify.get(
  '/api/flows/:flowId/steps/:stepIndex/validations',
  async (request) => {
    const { flowId, stepIndex } = request.params as {
      flowId: string;
      stepIndex: string;
    };

    const results = db
      .select()
      .from(validationResults)
      .where(
        and(
          eq(validationResults.flowId, flowId),
          eq(validationResults.stepIndex, parseInt(stepIndex))
        )
      )
      .orderBy(asc(validationResults.createdAt))
      .all();

    return { validations: results };
  }
);
```

### 7. Update React UI

```typescript
// src/client/components/ValidationResults.tsx

interface ValidationResultsProps {
  flowId: string;
  stepIndex: number;
}

export function ValidationResults({ flowId, stepIndex }: ValidationResultsProps) {
  const { data } = useQuery({
    queryKey: ['validations', flowId, stepIndex],
    queryFn: () =>
      api.get(`/api/flows/${flowId}/steps/${stepIndex}/validations`),
  });

  if (!data?.validations?.length) return null;

  return (
    <div className="mt-4 border-t pt-4">
      <h4 className="font-medium mb-2">Validations</h4>
      <div className="space-y-2">
        {data.validations.map((result) => (
          <div
            key={result.id}
            className={cn(
              'p-3 rounded text-sm',
              result.passed
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            )}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'font-medium',
                    result.passed ? 'text-green-700' : 'text-red-700'
                  )}
                >
                  {result.validatorName}
                </span>
                <span className="text-gray-500">({result.phase})</span>
                {result.attemptNumber > 1 && (
                  <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                    Retry {result.attemptNumber}
                  </span>
                )}
              </div>
              <span className="text-gray-500">{result.duration}ms</span>
            </div>

            {!result.passed && result.output && (
              <pre className="mt-2 text-xs bg-white p-2 rounded overflow-x-auto">
                {result.output}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Usage Examples

### Example 1: Auto-Detected Node Project

```bash
# No config needed, auto-detects from package.json + tsconfig.json
cd my-project
npm run dev  # Friendlist server

# Validators automatically run:
# 1. npx tsc --noEmit (build phase)
# 2. npm run lint (lint phase)
# 3. npm test (test phase)
```

### Example 2: Custom Config

```json
// .claude/.prove.json
{
  "schema_version": "1",
  "validators": [
    {
      "name": "typecheck",
      "command": "npx tsc --noEmit",
      "phase": "build"
    },
    {
      "name": "unit-tests",
      "command": "npm run test:unit",
      "phase": "test"
    },
    {
      "name": "integration-tests",
      "command": "npm run test:integration",
      "phase": "test"
    },
    {
      "name": "security-audit",
      "command": "npm audit --audit-level=high",
      "phase": "custom"
    }
  ]
}
```

### Example 3: Flow with Validation

```typescript
// flows/validated-feature.flow.ts

import { flow, validators } from '../src/server/flow/dsl.js';

export default flow('validated-feature', (f) => {
  f.session('planner', 'Design the authentication feature')
    .session('backend', 'Implement: {{planner.output}}')
    // Validators run automatically here (typecheck, lint, test)
    .session('frontend', 'Build login form')
    // Validators run again
    .gate({
      type: 'manual',
      title: 'Ready to deploy?',
      message: 'All tests passed, ready for production',
    });
});
```

## Testing Strategy

1. **Unit tests**: Mock `execa` and test validator execution
2. **Integration tests**: Real project with failing validators
3. **E2E tests**: Full flow with validation failure → retry → success

## Migration Path

1. **Week 1**: Implement types + config loader + auto-detection
2. **Week 1**: Implement validation runner (command validators only)
3. **Week 2**: Integrate with flow engine
4. **Week 2**: Add database schema + API endpoints
5. **Week 2**: Update React UI to show validation results
6. **Week 3**: Testing + documentation
7. **Future**: Add LLM validators (haiku-based)

## Open Questions

1. **Should we support per-step validator overrides?**
   ```typescript
   f.session('backend', 'Implement API', {
     validators: ['build', 'test'], // Skip lint for this step
   });
   ```

2. **How to handle slow validators (10+ minutes)?**
   - Run in background with progress updates?
   - Stream output in real-time?

3. **Should validators be optional?**
   - Default: enabled (fail if validators fail)
   - Opt-out: Add `skipValidation: true` to flow config

4. **What about pre-step validation?**
   - E.g., check that dependencies are installed before starting
   - Add `pre` phase before `build`?

## Conclusion

This validation system gives Friendlist the same reliability as claude-prove's orchestrator while fitting naturally into our existing architecture. Start with Phase 1 (command validators + auto-detection) and add LLM validation later if needed.
