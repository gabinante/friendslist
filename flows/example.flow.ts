import { flow } from '../src/server/flow/dsl.js';

export default flow('feature_deploy', (f) => {
  f.session('architect', 'Design the API schema for user profiles. Output a clear specification.')
   .session('implementer', 'Implement the API based on this design: {{architect.output}}')
   .session('tester', 'Write and run tests for the implementation. Report pass/fail results.')
   .session('reviewer', 'Review the code for quality and security issues. Provide a summary.');
});
