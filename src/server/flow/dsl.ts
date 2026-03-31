import type { FlowDef, FlowStepDef, GateConfig, LoopConfig, ValidatorResult, BranchConfig } from './types.js';

class FlowBuilder {
  private steps: FlowStepDef[] = [];

  /**
   * Execute a prompt in a session
   */
  session(alias: string, prompt: string): FlowBuilder {
    this.steps.push({ sessionAlias: alias, prompt });
    return this;
  }

  /**
   * Execute multiple steps in parallel
   */
  parallel(...builders: (FlowBuilder | ((b: FlowBuilder) => FlowBuilder))[]): FlowBuilder {
    const parallelSteps = builders.flatMap(b => {
      if (typeof b === 'function') {
        const inner = new FlowBuilder();
        b(inner);
        return inner.build();
      }
      return b.build();
    });
    this.steps.push({
      parallel: parallelSteps,
    });
    return this;
  }

  /**
   * Execute steps in a loop until condition is met
   */
  loop(
    config: LoopConfig,
    configure: (builder: FlowBuilder) => void
  ): FlowBuilder {
    const loopBuilder = new FlowBuilder();
    configure(loopBuilder);
    this.steps.push({
      loop: {
        config,
        steps: loopBuilder.build(),
      },
    });
    return this;
  }

  /**
   * Add a gate (approval checkpoint) before continuing
   */
  gate(config: GateConfig): FlowBuilder {
    this.steps.push({ gate: config });
    return this;
  }

  /**
   * Validate output and optionally retry on failure
   */
  validate(
    validator: (output: string) => Promise<ValidatorResult> | ValidatorResult,
    onFail: 'retry' | 'fail' | 'skip' = 'fail',
    retrySteps?: (builder: FlowBuilder) => void
  ): FlowBuilder {
    const retryStepsArray = retrySteps ? (() => {
      const b = new FlowBuilder();
      retrySteps(b);
      return b.build();
    })() : undefined;

    this.steps.push({
      validate: {
        validator,
        onFail,
        retrySteps: retryStepsArray,
      },
    });
    return this;
  }

  /**
   * Conditional branching based on previous outputs
   */
  branch(
    condition: (outputs: Map<string, string>) => boolean | Promise<boolean>,
    ifTrue: (builder: FlowBuilder) => void,
    ifFalse?: (builder: FlowBuilder) => void
  ): FlowBuilder {
    const trueBuilder = new FlowBuilder();
    ifTrue(trueBuilder);

    const falseBuilder = ifFalse ? new FlowBuilder() : undefined;
    if (ifFalse && falseBuilder) {
      ifFalse(falseBuilder);
    }

    this.steps.push({
      branch: {
        condition,
        ifTrue: trueBuilder.build(),
        ifFalse: falseBuilder?.build(),
      },
    });
    return this;
  }

  /**
   * Decompose a large task into subtasks
   */
  decompose(
    sessionAlias: string,
    decomposePrompt: string,
    executeSubtasks: boolean = false
  ): FlowBuilder {
    this.steps.push({
      decompose: {
        sessionAlias,
        decomposePrompt,
        executeSubtasks,
      },
    });
    return this;
  }

  build(): FlowStepDef[] {
    return [...this.steps];
  }
}

export function flow(
  name: string,
  configure: (builder: FlowBuilder) => void,
  description?: string
): FlowDef {
  const builder = new FlowBuilder();
  configure(builder);
  return {
    name,
    description,
    steps: builder.build(),
  };
}

// Convenience helpers
export function session(alias: string, prompt: string): FlowBuilder {
  return new FlowBuilder().session(alias, prompt);
}

export function parallel(...builders: FlowBuilder[]): FlowBuilder {
  return new FlowBuilder().parallel(...builders);
}

// Common validators
export const validators = {
  testsPass: (testCommand: string) => async (output: string): Promise<ValidatorResult> => {
    // This would execute the test command and check results
    return { passed: output.includes('PASS') || output.includes('✓'), message: 'Tests validation' };
  },

  containsPattern: (pattern: string | RegExp) => (output: string): ValidatorResult => {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    const passed = regex.test(output);
    return { passed, message: passed ? 'Pattern found' : 'Pattern not found' };
  },

  noErrors: () => (output: string): ValidatorResult => {
    const hasError = /error|fail|exception/i.test(output);
    return { passed: !hasError, message: hasError ? 'Errors detected' : 'No errors found' };
  },

  custom: (fn: (output: string) => boolean | Promise<boolean>, message?: string) =>
    async (output: string): Promise<ValidatorResult> => {
      const passed = await Promise.resolve(fn(output));
      return { passed, message: message || 'Custom validation' };
    },
};
