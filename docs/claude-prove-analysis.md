# Claude Prove Integration Analysis

## Executive Summary

`claude-prove` is a mature, production-ready Claude Code plugin for autonomous task orchestration. It provides a complete plan-to-implementation lifecycle that's significantly more sophisticated than Friendlist's current flows system. The key question is: should we integrate it, or learn from it?

**Recommendation**: **Learn from it, don't integrate directly**. The architectures are fundamentally incompatible, but claude-prove provides excellent patterns we should adopt.

---

## Architecture Comparison

### Friendlist Flows (Current)

```
┌─────────────────────────────────────────┐
│  React UI (port 5173)                   │
│  - Flow visualization                   │
│  - Session management                   │
│  - Task tracking                        │
└────────────┬────────────────────────────┘
             │ WebSocket + REST API
┌────────────▼────────────────────────────┐
│  Fastify Backend (port 3456)            │
│  - Flow engine (TypeScript)             │
│  - Session manager (spawn Claude CLI)   │
│  - SQLite database (Drizzle ORM)        │
│  - MCP server injection                 │
└────────────┬────────────────────────────┘
             │ stdio
┌────────────▼────────────────────────────┐
│  Multiple Claude CLI Processes          │
│  - Each with injected MCP server        │
│  - Prompts via stdin                    │
│  - Outputs captured from stdout         │
└─────────────────────────────────────────┘
```

**Philosophy**: External control plane orchestrating multiple Claude sessions like a conductor.

### Claude Prove (Analyzed)

```
┌─────────────────────────────────────────┐
│  Claude Code Session (Single)           │
│  - Skills (slash commands)              │
│  - Agents (spawned via Agent tool)      │
│  - Hooks (pre/post tool execution)      │
└────────────┬────────────────────────────┘
             │ git worktrees
┌────────────▼────────────────────────────┐
│  Isolated Worktrees per Task            │
│  - orchestrator/<slug> branches         │
│  - .claude/worktrees/<task>/ dirs       │
│  - Parallel agent execution             │
└────────────┬────────────────────────────┘
             │ file-based state
┌────────────▼────────────────────────────┐
│  .prove/ Directory Structure            │
│  - runs/<slug>/ (namespaced per run)    │
│  - context/<slug>/ (handoff protocol)   │
│  - TASK_PLAN.md, PROGRESS.md            │
│  - reports/, decisions/, learning/      │
└─────────────────────────────────────────┘
```

**Philosophy**: Native Claude Code integration using worktrees for isolation and file-based state.

---

## Key Conceptual Differences

| Aspect | Friendlist Flows | Claude Prove |
|--------|------------------|--------------|
| **Control Model** | External orchestrator | Self-orchestrating (meta-agent) |
| **Session Model** | Multi-session (named, persistent) | Single session with spawned agents |
| **Isolation** | Process-based (multiple CLIs) | Git worktree-based |
| **State Storage** | SQLite database | File system (.prove/) |
| **Context Passing** | Template variables `{{alias.output}}` | Handoff protocol + context files |
| **Execution Scope** | Generic workflows | Software dev lifecycle |
| **UI** | Rich React dashboard | Terminal + file-based reports |
| **Integration** | Standalone application | Claude Code plugin |

---

## What Claude Prove Does Better

### 1. **Validation System** ⭐⭐⭐

**Problem in Friendlist**: Basic validators (`testsPass`, `containsPattern`) that don't actually execute commands.

**Claude Prove Solution**:
```json
{
  "validators": [
    { "name": "build", "command": "go build ./...", "phase": "build" },
    { "name": "lint",  "command": "go vet ./...",   "phase": "lint" },
    { "name": "tests", "command": "go test ./...",  "phase": "test" },
    { "name": "doc-quality", "prompt": ".prove/prompts/doc-quality.md", "phase": "llm" }
  ]
}
```

- **Phases**: build → lint → test → custom → llm (ordered)
- **Auto-detection**: Scans for `go.mod`, `Cargo.toml`, `package.json`, etc.
- **LLM validators**: Prompt-based validation using haiku model
- **Retry logic**: One auto-fix attempt, then halt (no infinite loops)

**Adoption Path**: Implement similar validator system with shell command execution and phase ordering.

---

### 2. **Handoff Protocol** ⭐⭐⭐

**Problem in Friendlist**: Template variables are fragile for complex context.

**Claude Prove Solution**: Structured handoff at `.prove/context/<slug>/`

```markdown
# Handoff Log

## Step 1: Database Schema
**Agent**: db-designer
**Completed**: 2026-03-31T10:15:00Z

### What was done
Created user and session tables with proper indexes

### What the next step needs to know
- User.email must be unique (enforced at DB level)
- Session.token is SHA-256 hash, store raw token in client
- Migration applied as 0001_initial_schema.sql

### Files touched
- db/migrations/0001_initial_schema.sql — created
- db/schema.ts — updated with new types
```

**Optional structured files**:
- `api-contracts.md` — interfaces for downstream steps
- `discoveries.md` — findings that change the approach
- `decisions.md` — choices not in original plan
- `gotchas.md` — counter-intuitive things

**Adoption Path**: Add handoff protocol to flow engine, store in database or files.

---

### 3. **Auto-Scaling Execution Modes** ⭐⭐

**Problem in Friendlist**: All flows use same execution model.

**Claude Prove Solution**:
- **Simple mode** (≤3 steps): Sequential, no worktrees, lightweight
- **Full mode** (4+ steps): Parallel worktrees, architect review, wave-based

This avoids over-engineering small tasks while scaling to complex ones.

**Adoption Path**: Detect flow complexity and use different execution strategies.

---

### 4. **Wave-Based Parallelism** ⭐⭐

**Problem in Friendlist**: Parallel steps are explicitly declared.

**Claude Prove Solution**: Automatic dependency resolution into waves.

```
Wave 1 (parallel):
  - Task 1.1: Database schema
  - Task 1.2: API design spec
  - Task 1.3: UI mockups

Wave 2 (parallel, depends on Wave 1):
  - Task 2.1: API implementation (needs 1.1, 1.2)
  - Task 2.2: UI components (needs 1.2, 1.3)

Wave 3 (sequential):
  - Task 3.1: Integration tests (needs 2.1, 2.2)
```

**Adoption Path**: Add dependency tracking to flow steps, topological sort into waves.

---

### 5. **Principal Architect Review** ⭐⭐⭐

**Problem in Friendlist**: No code review before merging parallel work.

**Claude Prove Solution**: Every full-mode task requires architect approval.

**Review loop** (max 3 iterations):
1. Generate review prompt from diff + task plan
2. `principal-architect` agent returns APPROVED or CHANGES_REQUIRED
3. If approved → merge
4. If changes needed → scoped fix agent addresses only flagged items
5. After 3 rejections → ask user (force-approve / fix manually / abort)

**What architect checks**:
- Scope compliance (only listed files touched)
- Correctness (matches task description)
- Code quality (no dead code, proper naming, DRY)
- Error handling (edge cases covered)
- Tests (exist and cover happy + error paths)
- Consistency (follows existing patterns)
- No regressions

**Adoption Path**: Add review step to flows, implement review agent.

---

### 6. **Reporter Protocol** ⭐⭐

**Problem in Friendlist**: Hardcoded WebSocket notifications.

**Claude Prove Solution**: Declarative reporters triggered by hooks.

```json
{
  "reporters": [
    {
      "name": "slack-notify",
      "command": "./.prove/notify-slack.sh",
      "events": ["step-complete", "step-halted", "wave-complete"]
    },
    {
      "name": "discord-notify",
      "command": "./.prove/notify-discord.sh",
      "events": ["execution-complete"]
    }
  ]
}
```

**Environment variables passed**:
- `PROVE_EVENT`: event name
- `PROVE_TASK`: task slug
- `PROVE_STEP`: step number
- `PROVE_STATUS`: current status
- `PROVE_BRANCH`: branch name
- `PROVE_DETAIL`: one-line summary

**Hook-based dispatch** (automatic via Claude Code hooks):
- `PostToolUse` → detects git commits
- `SubagentStop` → detects review/validation verdicts
- `Stop` → dispatches execution-complete

**Adoption Path**: Add reporter configuration to database, invoke on flow events.

---

### 7. **Git-Based Rollback** ⭐⭐

**Problem in Friendlist**: No rollback mechanism.

**Claude Prove Solution**: Every step is committed individually.

```bash
# Revert step 3
git revert <step-3-commit-sha>

# Reset to step 2
git reset --hard <step-2-commit-sha>

# View step history
git log --oneline orchestrator/<slug>
```

**Adoption Path**: Could be adopted by having sessions commit after each step.

---

### 8. **File-Based State Management** ⭐

**Problem in Friendlist**: SQLite database can get out of sync with actual work.

**Claude Prove Solution**: `.prove/` directory as single source of truth.

```
.prove/
├── runs/<slug>/              # Per-run namespacing
│   ├── TASK_PLAN.md         # The plan being executed
│   ├── PROGRESS.md          # Live progress tracking
│   ├── PRD.md               # Product requirements (full-auto)
│   ├── reports/
│   │   ├── run-log.md       # Append-only audit trail
│   │   └── report.md        # Final summary
│   └── context/
│       └── handoff-log.md   # Inter-agent context
├── decisions/                # Brainstorming records
├── plans/                    # Step-level planning
├── learning/                 # Comprehension sessions
└── archive/                  # Completed tasks
```

**Trade-offs**:
- ✅ Git-friendly (text files, easy to inspect/edit)
- ✅ Survives database corruption
- ✅ Portable (copy .prove/ to share state)
- ❌ No transactional integrity
- ❌ Harder to query across runs
- ❌ Race conditions in parallel access

**Adoption Path**: Hybrid approach — database for queries, files for artifacts.

---

## What Friendlist Does Better

### 1. **Multi-Session Management** ⭐⭐⭐

Claude Prove spawns agents ephemerally per task. Friendlist maintains **persistent named sessions** that can accumulate context across multiple flows.

**Use case**: Backend developer session that participates in multiple flows over time, building deep context about the backend codebase.

---

### 2. **Real-Time UI** ⭐⭐⭐

Friendlist has a rich React dashboard with:
- Live flow visualization
- Session management
- Task tracking
- WebSocket updates

Claude Prove relies on terminal output and file inspection.

---

### 3. **Declarative Flow DSL** ⭐⭐

Friendlist's TypeScript DSL is more ergonomic for programmatic flow definition:

```typescript
flow('feature-dev', (f) => {
  f.session('planner', 'Design the feature')
   .parallel(
     (b) => b.session('backend', 'Implement API'),
     (f) => f.session('frontend', 'Build UI')
   )
   .validate(validators.testsPass('npm test'), 'retry')
   .gate({ type: 'manual', title: 'Deploy approval' })
});
```

Claude Prove uses markdown-based TASK_PLAN.md which is less composable.

---

### 4. **API-First Design** ⭐⭐

Friendlist exposes REST + WebSocket APIs, enabling:
- Programmatic flow creation
- External integrations (CI/CD, Slack bots, etc.)
- Multiple frontends (web, CLI, API clients)

Claude Prove is tightly coupled to Claude Code CLI.

---

## Integration Strategy: Learn, Don't Merge

### Why Direct Integration Won't Work

1. **Architectural Mismatch**: Friendlist is a control plane (external), claude-prove is a plugin (internal)
2. **Session Models**: Multi-session vs single-session with agents
3. **State Management**: Database vs file-based
4. **Deployment Context**: Web app vs CLI plugin
5. **Scope**: Generic workflows vs software dev lifecycle

### Recommended Approach: Feature Adoption

Extract claude-prove's best patterns and adapt them to Friendlist's architecture:

#### Phase 1: Foundation (Week 1-2)

1. **Validation System**
   - Add `.claude/.prove.json` config support
   - Implement phase-based command execution (build/lint/test/custom)
   - Add auto-detection for common project types
   - File: `src/server/validation/` module

2. **Handoff Protocol**
   - Add `handoff` field to flow step records
   - Store handoff logs in database or `.friendlist/handoffs/`
   - Update flow engine to pass context to next steps
   - File: `src/server/flow/handoff.ts`

#### Phase 2: Advanced Orchestration (Week 3-4)

3. **Auto-Scaling Modes**
   - Detect flow complexity (step count, dependencies)
   - Simple mode: sequential execution (current behavior)
   - Full mode: wave-based parallelism with review gates
   - File: `src/server/flow/modes.ts`

4. **Dependency Resolution**
   - Add `dependsOn: string[]` to flow steps
   - Topological sort into waves
   - Detect parallel opportunities automatically
   - File: `src/server/flow/dependencies.ts`

5. **Review Gates**
   - Add `review` step type to flow DSL
   - Create `code-reviewer` agent (principal-architect equivalent)
   - Review loop: max 3 iterations, then user decision
   - File: `src/server/flow/review.ts`

#### Phase 3: Production Hardening (Week 5-6)

6. **Reporter System**
   - Add `reporters` to `.claude/.prove.json`
   - Hook system for flow events
   - Environment variable passing
   - File: `src/server/notify/reporters.ts`

7. **Git Integration**
   - Per-step commits in sessions
   - Rollback commands in API
   - Branch management per flow
   - File: `src/server/git/` module

8. **LLM Validators**
   - Add `prompt` field to validator config
   - Spawn validation agent (haiku) with prompt + diff
   - Parse structured verdict (PASS/FAIL + findings)
   - File: `src/server/validation/llm-validator.ts`

---

## Proof-of-Concept: Hybrid Validator

Here's how we'd adapt claude-prove's validation to Friendlist:

```typescript
// src/server/validation/config.ts
interface ValidatorConfig {
  name: string;
  phase: 'build' | 'lint' | 'test' | 'custom' | 'llm';
  command?: string;  // Shell command
  prompt?: string;   // Path to LLM prompt file
}

interface ProveConfig {
  schema_version: string;
  validators: ValidatorConfig[];
  reporters?: ReporterConfig[];
}

// src/server/validation/runner.ts
export class ValidationRunner {
  async runValidators(
    sessionId: string,
    validators: ValidatorConfig[]
  ): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    // Group by phase and execute in order
    const phases = ['build', 'lint', 'test', 'custom', 'llm'];
    for (const phase of phases) {
      const phaseValidators = validators.filter(v => v.phase === phase);

      for (const validator of phaseValidators) {
        const result = validator.command
          ? await this.runCommandValidator(sessionId, validator)
          : await this.runLlmValidator(sessionId, validator);

        results.push(result);

        if (!result.passed) {
          // One retry attempt
          const retryResult = await this.retry(sessionId, validator, result);
          if (!retryResult.passed) {
            throw new ValidationError(validator.name, retryResult.output);
          }
        }
      }
    }

    return results;
  }

  private async runCommandValidator(
    sessionId: string,
    validator: ValidatorConfig
  ): Promise<ValidationResult> {
    const session = await sessionManager.getSession(sessionId);
    const cwd = session.cwd;

    const startTime = Date.now();
    const result = await exec(validator.command!, { cwd });
    const duration = Date.now() - startTime;

    return {
      name: validator.name,
      passed: result.exitCode === 0,
      duration,
      output: result.stderr || result.stdout,
    };
  }

  private async runLlmValidator(
    sessionId: string,
    validator: ValidatorConfig
  ): Promise<ValidationResult> {
    // Read prompt file
    const promptPath = path.join(process.cwd(), validator.prompt!);
    const prompt = await fs.readFile(promptPath, 'utf-8');

    // Get diff of recent changes
    const session = await sessionManager.getSession(sessionId);
    const diff = await this.getSessionDiff(sessionId);

    // Spawn validation agent (haiku for speed + cost)
    const agentPrompt = `
${prompt}

# Recent Changes
\`\`\`diff
${diff}
\`\`\`

Provide a verdict in this format:
**VERDICT**: PASS or FAIL
**FINDINGS**: (if FAIL) list issues with file:line references
`;

    const result = await sessionManager.sendPrompt(
      sessionId,
      agentPrompt,
      { model: 'haiku' }
    );

    const passed = /\*\*VERDICT\*\*:\s*PASS/i.test(result);
    const findings = passed
      ? null
      : result.match(/\*\*FINDINGS\*\*:\s*(.+)/s)?.[1];

    return {
      name: validator.name,
      passed,
      duration: 0, // LLM time not tracked separately
      output: findings || 'Validation passed',
    };
  }
}
```

---

## Timeline Estimate

| Phase | Duration | Effort | Risk |
|-------|----------|--------|------|
| Phase 1: Foundation | 2 weeks | Medium | Low |
| Phase 2: Advanced | 2 weeks | High | Medium |
| Phase 3: Hardening | 2 weeks | Medium | Low |
| **Total** | **6 weeks** | - | - |

---

## Open Questions

1. **Do we need LLM validators?**
   - Pro: Catches documentation quality, naming conventions, domain-specific issues
   - Con: Adds latency and cost (even with haiku)
   - Decision: Start with command validators, add LLM as opt-in

2. **How to handle concurrent flow runs?**
   - Claude Prove: Namespaced `.prove/runs/<slug>/` directories
   - Friendlist: SQLite with flow IDs
   - Hybrid: Both (DB for queries, files for artifacts)

3. **Should we support git worktrees?**
   - Pro: True isolation, native git semantics
   - Con: Requires git knowledge, complicates UI
   - Decision: No — our process-based isolation is simpler

4. **File-based vs database state?**
   - Prove: File-based (git-friendly, portable, fragile)
   - Friendlist: Database (queryable, transactional, opaque)
   - Hybrid: Database primary, files for reports/artifacts

---

## Conclusion

**Do not integrate claude-prove directly** — the architectures are too different. Instead:

1. **Extract patterns**: Validation system, handoff protocol, review gates, reporters
2. **Adapt to Friendlist**: Implement as TypeScript modules in existing flow engine
3. **Preserve strengths**: Multi-session model, real-time UI, API-first design
4. **Add capabilities**: Phase-based validation, wave parallelism, architect review

**Next Steps**:
1. Review this analysis with team
2. Prioritize which features to adopt (start with validation system)
3. Create implementation tickets for Phase 1
4. Prototype hybrid validator in separate branch

**Key Insight**: Claude Prove solves "how to orchestrate complex software tasks autonomously" while Friendlist solves "how to manage multiple Claude sessions doing various work". These are complementary goals — adopt Prove's orchestration patterns without abandoning Friendlist's multi-session control plane.
