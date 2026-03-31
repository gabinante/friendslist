// Validator function result
export interface ValidatorResult {
  passed: boolean;
  message?: string;
  data?: any;
}

// Gate configuration for approval checkpoints
export interface GateConfig {
  type: 'manual' | 'automatic';
  title: string;
  message: string;
  // For automatic gates
  validator?: (output: string) => Promise<ValidatorResult> | ValidatorResult;
  // For manual gates
  approverPrompt?: string;
}

// Loop configuration for iterative execution
export interface LoopConfig {
  maxIterations: number;
  exitCondition: {
    type: 'validator' | 'manual' | 'output_contains';
    validator?: (output: string) => Promise<ValidatorResult> | ValidatorResult;
    pattern?: string;
  };
}

// Conditional branch configuration
export interface BranchConfig {
  condition: (outputs: Map<string, string>) => boolean | Promise<boolean>;
  ifTrue: FlowStepDef[];
  ifFalse?: FlowStepDef[];
}

// Enhanced flow step with new constructs
export interface FlowStepDef {
  // Basic step
  sessionAlias?: string;
  prompt?: string;

  // Parallel execution
  parallel?: FlowStepDef[];

  // Loop construct
  loop?: {
    config: LoopConfig;
    steps: FlowStepDef[];
  };

  // Gate construct
  gate?: GateConfig;

  // Validator construct
  validate?: {
    validator: (output: string) => Promise<ValidatorResult> | ValidatorResult;
    onFail?: 'retry' | 'fail' | 'skip';
    retrySteps?: FlowStepDef[];
  };

  // Conditional branch
  branch?: BranchConfig;

  // Task decomposition - prompts session to break down into subtasks
  decompose?: {
    sessionAlias: string;
    decomposePrompt: string;
    executeSubtasks?: boolean;
  };
}

export interface FlowDef {
  name: string;
  description?: string;
  steps: FlowStepDef[];
}
