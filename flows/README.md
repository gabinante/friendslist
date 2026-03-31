# Friendlist Flows

Flows are declarative orchestration scripts for coordinating multiple Claude Code sessions to accomplish complex, multi-phase software engineering tasks.

## Flow Architecture

A flow consists of **steps** that can be:

1. **Session steps** - Execute a prompt in a named Claude session
2. **Parallel steps** - Run multiple steps concurrently
3. **Loop steps** - Repeat steps until a condition is met
4. **Gate steps** - Approval checkpoints (manual or automatic)
5. **Validator steps** - Check outputs and conditionally retry
6. **Branch steps** - Conditional execution based on previous outputs
7. **Decompose steps** - Break down large tasks into subtasks

## DSL Reference

### Basic Session Step

```typescript
f.session('architect', 'Design the API schema for user profiles')
```

### Parallel Execution

```typescript
f.parallel(
  (backend) => backend.session('backend-dev', 'Implement API endpoints'),
  (frontend) => frontend.session('frontend-dev', 'Build UI components'),
  (docs) => docs.session('documenter', 'Write documentation')
)
```

### Loops (Code/Test Cycles)

```typescript
f.loop(
  {
    maxIterations: 5,
    exitCondition: {
      type: 'validator',
      validator: validators.testsPass('npm test')
    }
  },
  (loop) => {
    loop.session('dev', 'Run tests and fix issues')
  }
)
```

### Gates (Approval Checkpoints)

```typescript
// Automatic gate
f.gate({
  type: 'automatic',
  title: 'Code Review Gate',
  message: 'Code must pass review',
  validator: (output) => ({
    passed: output.includes('PASS'),
    message: 'Review result'
  })
})

// Manual gate (requires user approval)
f.gate({
  type: 'manual',
  title: 'Deployment Approval',
  message: 'Ready to deploy. Please approve.',
})
```

### Validators

```typescript
f.validate(
  validators.testsPass('npm test'),
  'fail' // 'fail' | 'retry' | 'skip'
)

f.validate(
  validators.containsPattern(/success/i),
  'retry',
  (retry) => {
    retry.session('dev', 'Fix the issue and retry')
  }
)
```

### Conditional Branches

```typescript
f.branch(
  (outputs) => outputs.get('tester')?.includes('FAIL') || false,
  // If true
  (fix) => {
    fix.session('dev', 'Fix the failing tests')
  },
  // If false (optional)
  (success) => {
    success.session('reporter', 'Generate success report')
  }
)
```

### Task Decomposition

```typescript
f.decompose(
  'planner',
  'Break this feature down into 5-10 concrete work units',
  false // executeSubtasks: whether to automatically create and execute subtasks
)
```

### Template Variables

Reference previous step outputs using `{{alias.output}}`:

```typescript
f.session('planner', 'Create a project plan')
f.session('implementer', 'Implement based on: {{planner.output}}')
```

## Built-in Validators

- `validators.testsPass(testCommand)` - Check if tests pass
- `validators.containsPattern(pattern)` - Check if output matches pattern
- `validators.noErrors()` - Check for error keywords
- `validators.custom(fn, message)` - Custom validation function

## Example Flows

### Simple Feature Flow

```typescript
import { flow, validators } from '../src/server/flow/dsl.js';

export default flow('simple-feature', (f) => {
  f.session('planner', 'Design the feature')
   .session('dev', 'Implement: {{planner.output}}')
   .session('tester', 'Test the implementation')
   .validate(validators.testsPass('npm test'), 'fail');
});
```

### End-to-End Project Flow

See `project-e2e.flow.ts` for a comprehensive example demonstrating:
- ✅ Planning & Decomposition
- ✅ Research & Exploration
- ✅ Parallel Development (backend, frontend, docs)
- ✅ Code/Test Loop
- ✅ Code Review Gate
- ✅ Deployment with Approval
- ✅ Enhancement Identification

## Running Flows

### Via API

```bash
# Create a flow from a flow file
POST /api/flows
{
  "name": "project-e2e",
  "steps": [...]
}

# Run a flow
POST /api/flows/{flowId}/run

# Get flow status
GET /api/flows/{flowId}

# List all flows
GET /api/flows
```

### Prerequisites

Before running a flow:

1. **Create sessions** with the required aliases:
   ```bash
   POST /api/sessions
   {
     "name": "Backend Developer",
     "alias": "backend-dev",
     "cwd": "/path/to/project",
     "model": "sonnet"
   }
   ```

2. **Load the flow definition** (automatically loaded from `flows/` directory)

3. **Start the flow** and monitor progress via WebSocket events

## Flow Lifecycle

```
draft → running → completed
                 ↘ failed
```

Each step goes through:
```
pending → running → completed
                   ↘ failed
```

## WebSocket Events

Subscribe to real-time flow updates:

```typescript
ws.on('message', (event) => {
  if (event.type === 'flow:update') {
    console.log('Flow status:', event.flow.status)
  }
  if (event.type === 'notification') {
    console.log(event.title, event.body, event.level)
  }
})
```

## Best Practices

1. **Name sessions by role**, not by task (e.g., `backend-dev`, `tester`, `reviewer`)
2. **Use loops for iterative tasks** like code/test cycles
3. **Add gates before risky operations** like deployments
4. **Validate critical conditions** with automatic gates
5. **Leverage parallel execution** for independent work streams
6. **Keep prompts focused** - one clear objective per step
7. **Use template variables** to pass context between steps
8. **Set reasonable loop limits** (3-5 iterations typical)
9. **Test flows incrementally** - start with simple flows, add complexity

## Limitations

- Sessions must be created before running flows
- Manual gates currently auto-approve (UI approval coming soon)
- Loop exit conditions evaluated after each iteration
- No cross-flow dependencies yet
- No flow composition/nesting yet

## Future Enhancements

- [ ] Flow composition (call flows from flows)
- [ ] Cross-flow task dependencies
- [ ] Manual gate approval UI
- [ ] Flow templates library
- [ ] Rollback/checkpoint support
- [ ] Flow visualization
- [ ] Dry-run mode
- [ ] Resource constraints (max parallel sessions)
