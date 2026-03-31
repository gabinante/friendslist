import { flow, validators } from '../src/server/flow/dsl.js';

/**
 * SDLC Flow — V2MOM-driven software development lifecycle
 *
 * Maps to the SDLC chart:
 *   V2MOM → Decomposition/Research → Specific Objectives → Units of Work
 *   → Assignment → Actioned (code) ⟷ Reviewed/Tested → Deploy/Use
 *   → Identify Enhancements (feeds back)
 *
 * Sessions required:
 *   - planner: Breaks down goals into objectives and work units
 *   - researcher: Explores codebase and aggregates context
 *   - backend-dev: Backend implementation
 *   - frontend-dev: Frontend implementation
 *   - tester: Runs tests and reviews code
 *   - deployer: Handles deployment
 *   - enhancer: Identifies future improvements
 */
export default flow(
  'sdlc',
  (f) => {
    // ========================================
    // PHASE 1: V2MOM → DECOMPOSITION / RESEARCH
    // ========================================
    // The planner takes high-level goals and decomposes them
    f.session(
      'planner',
      `You are the project architect. You've been given high-level goals (V2MOM style).

GOALS: {{goals}}

Decompose these into:
1. Specific objectives (3-5 measurable outcomes)
2. Technical constraints and dependencies
3. Success criteria for each objective
4. Risk areas requiring investigation

Output structured markdown with clear sections.`
    );

    // Research phase — runs in parallel with analysis
    f.parallel(
      // Codebase exploration
      (research) =>
        research.session(
          'researcher',
          `You are the codebase researcher. Based on these objectives:

{{planner.output}}

Explore the existing codebase to understand:
1. Files and modules that will need changes
2. Existing patterns and conventions to follow
3. Integration points and dependencies
4. Data models and schemas involved

Provide a technical brief with file paths and specific recommendations.`
        ),

      // Data aggregation / analysis
      (analysis) =>
        analysis.session(
          'planner',
          `Based on your initial decomposition, now aggregate and analyze:

{{planner.output}}

Refine into:
1. Data flow diagrams (describe in text)
2. API contracts needed
3. State management requirements
4. Performance and scalability considerations

Output a concise technical analysis.`
        )
    );

    // ========================================
    // PHASE 2: SPECIFIC OBJECTIVES → UNITS OF WORK
    // ========================================
    f.decompose(
      'planner',
      `Based on the research and analysis:

RESEARCH: {{researcher.output}}

Create 5-10 concrete units of work. Each must be:
- Independently implementable
- Testable in isolation
- Tagged with a role: [backend], [frontend], [testing], or [infra]
- Ordered by dependency (what must be built first)

Output as a numbered list with [role] prefix.`,
      false
    );

    // ========================================
    // PHASE 3: ASSIGNMENT → ACTIONED (AUTOMATED)
    // ========================================
    // Parallel execution of assigned work
    f.parallel(
      (backend) =>
        backend.session(
          'backend-dev',
          `You are the backend developer. Implement your assigned work units:

PLAN: {{planner.output}}
RESEARCH: {{researcher.output}}

Focus on [backend] tagged items:
- API endpoints and routes
- Database schema and migrations
- Business logic and services
- Error handling and validation

Write clean, tested code following project conventions.`
        ),

      (frontend) =>
        frontend.session(
          'frontend-dev',
          `You are the frontend developer. Implement your assigned work units:

PLAN: {{planner.output}}
RESEARCH: {{researcher.output}}

Focus on [frontend] tagged items:
- React components and pages
- State management and data fetching
- UI/UX implementation
- API integration

Follow existing design patterns and component conventions.`
        )
    );

    // ========================================
    // PHASE 4: REVIEWED / TESTED ⟷ ACTIONED LOOP
    // ========================================
    // This is the automated cycle from the diagram — code gets reviewed/tested,
    // failures loop back to actioned (fix), until passing
    f.loop(
      {
        maxIterations: 5,
        exitCondition: {
          type: 'validator',
          validator: validators.testsPass('npm test'),
        },
      },
      (loop) => {
        // Review and test
        loop.session(
          'tester',
          `You are the reviewer and tester. Examine all recent changes and run tests:

1. Run: npm test
2. Review code quality, security, and conventions
3. Check for integration issues between backend and frontend
4. Verify error handling and edge cases

Report:
- Test results (PASS/FAIL with details)
- Code review findings
- Integration issues found`
        );

        // If tests/review failed, loop back to "Actioned" — fix the issues
        loop.branch(
          (outputs) => {
            const result = outputs.get('tester') || '';
            return result.includes('FAIL') || result.includes('✗') || result.includes('ERROR');
          },
          (fix) => {
            fix.parallel(
              (be) =>
                be.session(
                  'backend-dev',
                  `Review/test cycle found issues. Fix backend problems:

{{tester.output}}

Address all backend-related failures and review findings.`
                ),
              (fe) =>
                fe.session(
                  'frontend-dev',
                  `Review/test cycle found issues. Fix frontend problems:

{{tester.output}}

Address all frontend-related failures and review findings.`
                )
            );
          }
        );
      }
    );

    // Final validation gate — tests must pass before deployment
    f.validate(validators.testsPass('npm test'), 'fail');

    // ========================================
    // PHASE 5: DEPLOY / USE
    // ========================================
    // Manual approval gate before deployment
    f.gate({
      type: 'manual',
      title: 'Deployment Approval',
      message: 'All tests pass and code review is clean. Approve deployment?',
      approverPrompt: 'Review the completed work and approve for deployment.',
    });

    f.session(
      'deployer',
      `You are the deployment engineer. Deploy the changes:

1. Run the build: npm run build
2. Verify build artifacts are correct
3. Execute deployment steps
4. Run smoke tests against the deployed version
5. Verify health checks

Report deployment status with any warnings.`
    );

    f.validate(
      validators.custom(
        (output) => output.includes('Deployment successful') || output.includes('deployed'),
        'Deployment verification'
      ),
      'fail'
    );

    // ========================================
    // PHASE 6: IDENTIFY ENHANCEMENTS (→ feeds back)
    // ========================================
    f.session(
      'enhancer',
      `You are the continuous improvement analyst. The feature is deployed. Review everything:

ORIGINAL GOALS: {{goals}}
PLAN: {{planner.output}}
IMPLEMENTATION: {{backend-dev.output}} {{frontend-dev.output}}
TEST RESULTS: {{tester.output}}

Identify enhancements for the next cycle:
1. Performance optimizations
2. UX improvements
3. Technical debt introduced
4. Missing edge cases
5. Monitoring and observability gaps
6. Security hardening opportunities

Prioritize by impact (high/medium/low) and effort (small/medium/large).
These feed back into the next V2MOM cycle.`
    );
  },
  'V2MOM-driven SDLC: Decompose → Research → Assign → Code/Test Loop → Deploy → Enhance'
);
