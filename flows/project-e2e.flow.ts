import { flow, validators } from '../src/server/flow/dsl.js';

/**
 * Comprehensive End-to-End Project Flow
 *
 * Demonstrates: Plan → Research → Orchestrate → Validate → Execute → Enhance
 *
 * This flow orchestrates multiple Claude Code sessions to:
 * 1. PLAN: Decompose large tasks into specific objectives
 * 2. RESEARCH: Explore and understand the codebase
 * 3. ORCHESTRATE: Assign units of work to specialized sessions
 * 4. VALIDATE: Enter code/test loop until requirements are met
 * 5. EXECUTE: Deploy with gates and approval
 * 6. ENHANCE: Identify improvements for future iterations
 */
export default flow(
  'project-e2e',
  (f) => {
    // ========================================
    // PHASE 1: PLANNING & DECOMPOSITION
    // ========================================
    f.session(
      'planner',
      `You are the project architect. Analyze this feature request and break it down into specific, actionable objectives.

Feature Request: {{feature_request}}

Please provide:
1. High-level objectives (3-5 clear goals)
2. Technical requirements and constraints
3. Success criteria (how we'll know it's done)
4. Risk areas that need extra attention

Output your plan as structured markdown.`
    );

    // Decompose the plan into concrete work units
    f.decompose(
      'planner',
      `Based on your plan above, break this down into 5-10 concrete work units. Each unit should be:
- Independently executable
- Testable
- Assigned to a specific role (backend, frontend, testing, etc.)

Output as a numbered list with [role] prefix for each item.`,
      false // Don't auto-execute subtasks yet
    );

    // ========================================
    // PHASE 2: RESEARCH & EXPLORATION
    // ========================================
    f.session(
      'researcher',
      `You are the codebase expert. Based on this plan:

{{planner.output}}

Research the existing codebase to understand:
1. Relevant files and modules that need to be modified
2. Existing patterns and conventions to follow
3. Dependencies and integration points
4. Potential conflicts or breaking changes

Provide a detailed technical brief with file paths and specific recommendations.`
    );

    // ========================================
    // PHASE 3: ORCHESTRATION (PARALLEL WORK)
    // ========================================
    // Execute multiple work streams in parallel
    f.parallel(
      // Backend development
      (backend) =>
        backend.session(
          'backend-dev',
          `You are the backend developer. Implement the server-side components based on:

PLAN: {{planner.output}}
RESEARCH: {{researcher.output}}

Focus on:
- API endpoints
- Database schema changes
- Business logic
- Error handling

Write clean, tested code following project conventions.`
        ),

      // Frontend development
      (frontend) =>
        frontend.session(
          'frontend-dev',
          `You are the frontend developer. Implement the UI components based on:

PLAN: {{planner.output}}
RESEARCH: {{researcher.output}}

Focus on:
- React components
- State management
- API integration
- User experience

Follow the existing design system and patterns.`
        ),

      // Documentation
      (docs) =>
        docs.session(
          'documenter',
          `You are the documentation specialist. Create documentation for:

PLAN: {{planner.output}}

Include:
- API documentation
- User-facing feature docs
- Architecture decision records (if applicable)
- Code comments for complex logic`
        )
    );

    // ========================================
    // PHASE 4: VALIDATION LOOP (CODE/TEST)
    // ========================================
    // Enter iterative loop until all tests pass
    f.loop(
      {
        maxIterations: 5,
        exitCondition: {
          type: 'validator',
          validator: validators.testsPass('npm test'),
        },
      },
      (loop) => {
        // Run tests
        loop.session(
          'tester',
          `Run the full test suite and analyze results:

1. Execute: npm test
2. Review all test failures
3. Identify the root cause of each failure
4. Report findings clearly

If tests pass, confirm success. If tests fail, provide detailed error analysis.`
        );

        // Conditional: fix issues if tests failed
        loop.branch(
          (outputs) => {
            const testOutput = outputs.get('tester') || '';
            return testOutput.includes('FAIL') || testOutput.includes('✗');
          },
          // If tests failed: fix them
          (fixBranch) => {
            fixBranch.session(
              'backend-dev',
              `Tests are failing. Based on this test output:

{{tester.output}}

Fix the backend issues. Focus on:
- Test failures in server code
- API contract mismatches
- Database/schema issues`
            );

            fixBranch.session(
              'frontend-dev',
              `Tests are failing. Based on this test output:

{{tester.output}}

Fix the frontend issues. Focus on:
- Component test failures
- Integration issues
- UI/UX bugs`
            );
          }
          // If tests passed: do nothing, exit loop
        );
      }
    );

    // Validate test success before proceeding
    f.validate(
      validators.testsPass('npm test'),
      'fail' // Fail the entire flow if tests don't pass
    );

    // ========================================
    // PHASE 5: CODE REVIEW GATE
    // ========================================
    f.session(
      'reviewer',
      `You are the code reviewer. Review all changes made in this flow:

BACKEND: {{backend-dev.output}}
FRONTEND: {{frontend-dev.output}}
TESTS: {{tester.output}}

Check for:
1. Code quality and maintainability
2. Security vulnerabilities
3. Performance concerns
4. Adherence to project conventions
5. Test coverage

Provide a thorough review with specific feedback and a PASS/FAIL verdict.`
    );

    // Gate: must pass code review to continue
    f.gate({
      type: 'automatic',
      title: 'Code Review Gate',
      message: 'Code must pass review before deployment',
      validator: (output) => {
        const passed = output.includes('PASS') && !output.includes('FAIL');
        return {
          passed,
          message: passed
            ? 'Code review passed - ready for deployment'
            : 'Code review failed - address issues before deploying',
        };
      },
    });

    // ========================================
    // PHASE 6: DEPLOYMENT (GATED)
    // ========================================
    // Manual gate for deployment approval
    f.gate({
      type: 'manual',
      title: 'Deployment Approval',
      message: 'Ready to deploy to production. Please approve to continue.',
      approverPrompt: 'Review all changes and approve deployment',
    });

    // Execute deployment
    f.session(
      'deployer',
      `You are the deployment engineer. Deploy the changes:

1. Run build: npm run build
2. Verify build artifacts
3. Execute deployment script
4. Verify deployment health
5. Report deployment status

Provide detailed deployment logs and verification results.`
    );

    // Validate deployment success
    f.validate(
      validators.custom(
        (output) => output.includes('Deployment successful') || output.includes('✓'),
        'Deployment verification'
      ),
      'fail'
    );

    // ========================================
    // PHASE 7: ENHANCEMENT IDENTIFICATION
    // ========================================
    f.session(
      'enhancer',
      `You are the continuous improvement specialist. Now that the feature is deployed, identify:

DEPLOYED FEATURE: {{planner.output}}
IMPLEMENTATION: {{backend-dev.output}} {{frontend-dev.output}}

Analyze and suggest:
1. Performance optimizations
2. UX improvements
3. Technical debt to address
4. Future enhancements
5. Monitoring and observability needs

Prioritize suggestions by impact and effort. Output as a structured list.`
    );

    // Create backlog tasks for enhancements
    f.session(
      'planner',
      `Based on the enhancement suggestions:

{{enhancer.output}}

Create 3-5 concrete backlog items for future work. Each should have:
- Title
- Description
- Priority (high/medium/low)
- Estimated complexity

These will be tracked for the next iteration.`
    );
  },
  'End-to-end project flow: Plan → Research → Orchestrate → Validate → Execute → Enhance'
);
