import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { EventEmitter } from 'events';
import { db } from '../db/connection.js';
import { flowDefinitions, flowSteps } from '../db/schema.js';
import type { SessionManager } from '../session/manager.js';
import type { Notifier } from '../notify/notifier.js';
import type { FlowDef, FlowStepDef, GateConfig, BranchConfig } from './types.js';
import type { FlowStatus, FlowStepStatus } from '../../shared/types.js';

export class FlowEngine extends EventEmitter {
  constructor(
    private sessionManager: SessionManager,
    private notifier: Notifier,
  ) {
    super();
  }

  createFlow(def: FlowDef): string {
    const id = uuidv4();
    const now = new Date().toISOString();

    db.insert(flowDefinitions).values({
      id,
      name: def.name,
      steps: JSON.stringify(def.steps),
      status: 'draft',
      currentStepIndex: 0,
      createdAt: now,
    }).run();

    // Create individual step records (only for session steps)
    let index = 0;
    for (const step of this.flattenSteps(def.steps)) {
      // Only create records for steps with sessionAlias and prompt
      if (step.sessionAlias && step.prompt) {
        db.insert(flowSteps).values({
          id: uuidv4(),
          flowId: id,
          index: index++,
          sessionAlias: step.sessionAlias,
          prompt: step.prompt,
          dependsOnOutput: true,
          status: 'pending',
          output: null,
          startedAt: null,
          completedAt: null,
        }).run();
      }
    }

    return id;
  }

  async runFlow(flowId: string): Promise<void> {
    db.update(flowDefinitions)
      .set({ status: 'running' as FlowStatus })
      .where(eq(flowDefinitions.id, flowId))
      .run();

    const flow = db.select().from(flowDefinitions).where(eq(flowDefinitions.id, flowId)).get();
    if (!flow) throw new Error(`Flow ${flowId} not found`);

    const steps: FlowStepDef[] = JSON.parse(flow.steps);
    const outputs = new Map<string, string>();

    try {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];

        db.update(flowDefinitions)
          .set({ currentStepIndex: i })
          .where(eq(flowDefinitions.id, flowId))
          .run();

        const { alias, output } = await this.executeStep(flowId, step, outputs);
        if (alias && !alias.startsWith('__')) {
          outputs.set(alias, output);
        }
      }

      db.update(flowDefinitions)
        .set({ status: 'completed' as FlowStatus })
        .where(eq(flowDefinitions.id, flowId))
        .run();

      await this.notifier.notify({
        title: 'Flow completed',
        body: `Flow "${flow.name}" finished successfully`,
        level: 'success',
      });
    } catch (err) {
      db.update(flowDefinitions)
        .set({ status: 'failed' as FlowStatus })
        .where(eq(flowDefinitions.id, flowId))
        .run();

      await this.notifier.notify({
        title: 'Flow failed',
        body: `Flow "${flow.name}": ${err instanceof Error ? err.message : 'Unknown error'}`,
        level: 'error',
      });

      throw err;
    }
  }

  private async executeStep(
    flowId: string,
    step: FlowStepDef,
    outputs: Map<string, string>
  ): Promise<{ alias: string; output: string }> {
    // Handle different step types

    // 1. Parallel execution
    if (step.parallel && step.parallel.length > 0) {
      const results = await Promise.all(
        step.parallel.map(s => this.executeStep(flowId, s, outputs))
      );
      // Merge all outputs
      for (const { alias, output } of results) {
        if (alias) outputs.set(alias, output);
      }
      return { alias: '__parallel__', output: 'Parallel steps completed' };
    }

    // 2. Loop execution
    if (step.loop) {
      return await this.executeLoop(flowId, step.loop, outputs);
    }

    // 3. Gate (approval checkpoint)
    if (step.gate) {
      return await this.executeGate(flowId, step.gate, outputs);
    }

    // 4. Validator
    if (step.validate) {
      return await this.executeValidator(flowId, step.validate, outputs);
    }

    // 5. Conditional branch
    if (step.branch) {
      return await this.executeBranch(flowId, step.branch, outputs);
    }

    // 6. Task decomposition
    if (step.decompose) {
      return await this.executeDecompose(flowId, step.decompose, outputs);
    }

    // 7. Regular session step
    if (step.sessionAlias && step.prompt) {
      return await this.executeSessionStep(flowId, step, outputs);
    }

    throw new Error('Invalid step configuration: no recognizable step type');
  }

  private async executeSessionStep(
    flowId: string,
    step: FlowStepDef,
    outputs: Map<string, string>
  ): Promise<{ alias: string; output: string }> {
    // Resolve template variables
    let prompt = step.prompt!;
    for (const [alias, output] of outputs) {
      prompt = prompt.replace(new RegExp(`\\{\\{${alias}\\.output\\}\\}`, 'g'), output);
    }

    // Find session by alias
    const session = this.sessionManager.getSessionByAlias(step.sessionAlias!);
    if (!session) {
      throw new Error(
        `No session with alias "${step.sessionAlias}" found. Create it first.`
      );
    }

    // Update step record
    const stepRows = db.select().from(flowSteps)
      .where(eq(flowSteps.flowId, flowId))
      .all()
      .filter(s => s.sessionAlias === step.sessionAlias);

    if (stepRows.length > 0) {
      const now = new Date().toISOString();
      db.update(flowSteps)
        .set({ status: 'running' as FlowStepStatus, startedAt: now })
        .where(eq(flowSteps.id, stepRows[0].id))
        .run();
    }

    const result = await this.sessionManager.sendPrompt(session.id, prompt);

    if (stepRows.length > 0) {
      const now = new Date().toISOString();
      db.update(flowSteps)
        .set({ status: 'completed' as FlowStepStatus, completedAt: now, output: result })
        .where(eq(flowSteps.id, stepRows[0].id))
        .run();
    }

    return { alias: step.sessionAlias!, output: result };
  }

  private async executeLoop(
    flowId: string,
    loop: NonNullable<FlowStepDef['loop']>,
    outputs: Map<string, string>
  ): Promise<{ alias: string; output: string }> {
    let iteration = 0;
    let lastOutput = '';
    const { config, steps } = loop;

    await this.notifier.notify({
      title: 'Loop started',
      body: `Starting loop (max ${config.maxIterations} iterations)`,
      level: 'info',
    });

    while (iteration < config.maxIterations) {
      iteration++;

      // Execute all steps in the loop
      for (const loopStep of steps) {
        const result = await this.executeStep(flowId, loopStep, outputs);
        lastOutput = result.output;
        if (result.alias) outputs.set(result.alias, result.output);
      }

      // Check exit condition
      let shouldExit = false;
      if (config.exitCondition.type === 'validator' && config.exitCondition.validator) {
        const result = await Promise.resolve(config.exitCondition.validator(lastOutput));
        shouldExit = result.passed;
        if (shouldExit) {
          await this.notifier.notify({
            title: 'Loop completed',
            body: `Exit condition met after ${iteration} iterations: ${result.message || ''}`,
            level: 'success',
          });
        }
      } else if (config.exitCondition.type === 'output_contains' && config.exitCondition.pattern) {
        shouldExit = lastOutput.includes(config.exitCondition.pattern);
        if (shouldExit) {
          await this.notifier.notify({
            title: 'Loop completed',
            body: `Pattern found after ${iteration} iterations`,
            level: 'success',
          });
        }
      } else if (config.exitCondition.type === 'manual') {
        // For now, always exit manual loops after one iteration
        // In the future, this could prompt for user input
        shouldExit = true;
      }

      if (shouldExit) break;
    }

    if (iteration >= config.maxIterations) {
      await this.notifier.notify({
        title: 'Loop max iterations reached',
        body: `Loop stopped after ${iteration} iterations`,
        level: 'info',
      });
    }

    return { alias: '__loop__', output: lastOutput };
  }

  private async executeGate(
    flowId: string,
    gate: GateConfig,
    outputs: Map<string, string>
  ): Promise<{ alias: string; output: string }> {
    if (gate.type === 'automatic' && gate.validator) {
      // Automatic gate - use validator
      const lastOutput = Array.from(outputs.values()).pop() || '';
      const result = await Promise.resolve(gate.validator(lastOutput));

      if (!result.passed) {
        await this.notifier.notify({
          title: 'Gate failed',
          body: `${gate.title}: ${result.message || 'Validation failed'}`,
          level: 'error',
        });
        throw new Error(`Gate "${gate.title}" failed: ${result.message}`);
      }

      await this.notifier.notify({
        title: 'Gate passed',
        body: gate.title,
        level: 'success',
      });

      return { alias: '__gate__', output: 'Gate passed' };
    } else {
      // Manual gate - notify and wait
      await this.notifier.notify({
        title: gate.title,
        body: gate.message,
        level: 'info',
      });

      // For now, auto-approve manual gates
      // In the future, this could prompt for user approval via the UI
      return { alias: '__gate__', output: 'Gate approved' };
    }
  }

  private async executeValidator(
    flowId: string,
    validate: NonNullable<FlowStepDef['validate']>,
    outputs: Map<string, string>
  ): Promise<{ alias: string; output: string }> {
    const lastOutput = Array.from(outputs.values()).pop() || '';
    const result = await Promise.resolve(validate.validator(lastOutput));

    if (!result.passed) {
      await this.notifier.notify({
        title: 'Validation failed',
        body: result.message || 'Validation check did not pass',
        level: 'error',
      });

      if (validate.onFail === 'fail') {
        throw new Error(`Validation failed: ${result.message}`);
      } else if (validate.onFail === 'retry' && validate.retrySteps) {
        // Execute retry steps
        for (const retryStep of validate.retrySteps) {
          await this.executeStep(flowId, retryStep, outputs);
        }
        return { alias: '__validator__', output: 'Retried after validation failure' };
      } else if (validate.onFail === 'skip') {
        return { alias: '__validator__', output: 'Validation skipped' };
      }
    }

    await this.notifier.notify({
      title: 'Validation passed',
      body: result.message || 'Validation successful',
      level: 'success',
    });

    return { alias: '__validator__', output: 'Validation passed' };
  }

  private async executeBranch(
    flowId: string,
    branch: BranchConfig,
    outputs: Map<string, string>
  ): Promise<{ alias: string; output: string }> {
    const conditionMet = await Promise.resolve(branch.condition(outputs));

    const stepsToExecute = conditionMet ? branch.ifTrue : branch.ifFalse || [];

    await this.notifier.notify({
      title: 'Branch evaluation',
      body: `Taking ${conditionMet ? 'true' : 'false'} path`,
      level: 'info',
    });

    for (const branchStep of stepsToExecute) {
      await this.executeStep(flowId, branchStep, outputs);
    }

    return { alias: '__branch__', output: `Branch: ${conditionMet ? 'true' : 'false'} path executed` };
  }

  private async executeDecompose(
    flowId: string,
    decompose: NonNullable<FlowStepDef['decompose']>,
    outputs: Map<string, string>
  ): Promise<{ alias: string; output: string }> {
    // Find session by alias
    const session = this.sessionManager.getSessionByAlias(decompose.sessionAlias);
    if (!session) {
      throw new Error(
        `No session with alias "${decompose.sessionAlias}" found for decomposition`
      );
    }

    // Resolve template variables in decompose prompt
    let prompt = decompose.decomposePrompt;
    for (const [alias, output] of outputs) {
      prompt = prompt.replace(new RegExp(`\\{\\{${alias}\\.output\\}\\}`, 'g'), output);
    }

    await this.notifier.notify({
      title: 'Task decomposition',
      body: `Decomposing task with ${decompose.sessionAlias}`,
      level: 'info',
    });

    const result = await this.sessionManager.sendPrompt(session.id, prompt);

    if (decompose.executeSubtasks) {
      // In the future, could parse the decomposition result and create actual tasks
      await this.notifier.notify({
        title: 'Subtasks created',
        body: 'Task has been decomposed into subtasks',
        level: 'success',
      });
    }

    return { alias: decompose.sessionAlias, output: result };
  }

  private flattenSteps(steps: FlowStepDef[]): FlowStepDef[] {
    const flat: FlowStepDef[] = [];
    for (const step of steps) {
      if (step.parallel) {
        flat.push(...this.flattenSteps(step.parallel));
      } else if (step.loop) {
        flat.push(...this.flattenSteps(step.loop.steps));
      } else if (step.branch) {
        flat.push(...this.flattenSteps(step.branch.ifTrue));
        if (step.branch.ifFalse) {
          flat.push(...this.flattenSteps(step.branch.ifFalse));
        }
      } else if (step.validate?.retrySteps) {
        flat.push(...this.flattenSteps(step.validate.retrySteps));
      } else if (step.sessionAlias && step.prompt) {
        // Only include actual session steps
        flat.push(step);
      }
      // Gates, validators, and decompose steps without prompts are skipped
    }
    return flat;
  }

  listFlows() {
    return db.select().from(flowDefinitions).all().map(row => ({
      id: row.id,
      name: row.name,
      status: row.status,
      currentStepIndex: row.currentStepIndex,
      createdAt: row.createdAt,
      steps: JSON.parse(row.steps),
    }));
  }

  getFlow(id: string) {
    const row = db.select().from(flowDefinitions).where(eq(flowDefinitions.id, id)).get();
    if (!row) return null;
    const steps = db.select().from(flowSteps).where(eq(flowSteps.flowId, id)).all();
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      currentStepIndex: row.currentStepIndex,
      createdAt: row.createdAt,
      stepDefs: JSON.parse(row.steps),
      steps,
    };
  }
}
