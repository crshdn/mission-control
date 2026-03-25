/**
 * Browser Test Context Builder
 *
 * Builds the browser testing context string that gets injected into
 * the Tester agent's dispatch message, giving it instructions on how
 * to use OpenClaw's built-in browser tool for visual verification.
 */

import { queryAll } from '@/lib/db';
import type { Task, TaskDeliverable } from '@/lib/types';

const DEFAULT_DEV_PORT_RANGE_START = 4200;
const DEFAULT_DEV_PORT_RANGE_END = 4299;

interface BrowserTestTask extends Task {
  planning_spec?: string;
  workspace_port?: number;
  browser_test_url?: string;
}

/**
 * Resolve the dev server URL for browser testing.
 * Priority: task.browser_test_url > workspace_port > default localhost:3000
 */
function resolveDevUrl(task: BrowserTestTask): string {
  if (task.browser_test_url) {
    return task.browser_test_url;
  }
  if (task.workspace_port && task.workspace_port >= DEFAULT_DEV_PORT_RANGE_START && task.workspace_port <= DEFAULT_DEV_PORT_RANGE_END) {
    return `http://localhost:${task.workspace_port}`;
  }
  return 'http://localhost:3000';
}

/**
 * Extract a readable planning spec summary from the task's planning_spec JSON.
 */
function extractPlanningSpec(task: BrowserTestTask): string {
  if (!task.planning_spec) return '';
  try {
    const spec = JSON.parse(task.planning_spec);
    const specText = typeof spec === 'string' ? spec : (spec.spec_markdown || JSON.stringify(spec, null, 2));
    return specText;
  } catch {
    return task.planning_spec;
  }
}

/**
 * Get deliverables registered by the builder for this task.
 */
function getDeliverables(taskId: string): TaskDeliverable[] {
  return queryAll<TaskDeliverable>(
    'SELECT * FROM task_deliverables WHERE task_id = ? ORDER BY created_at ASC',
    [taskId]
  );
}

/**
 * Build the full browser testing context block for injection into the tester dispatch.
 */
export function buildBrowserTestContext(task: BrowserTestTask): string {
  const devUrl = resolveDevUrl(task);
  const deliverables = getDeliverables(task.id);
  const planningSpec = extractPlanningSpec(task);

  const deliverablesList = deliverables.length > 0
    ? deliverables.map(d => `- **${d.title}** (${d.deliverable_type})${d.path ? `: ${d.path}` : ''}${d.description ? ` — ${d.description}` : ''}`).join('\n')
    : '- No deliverables registered yet — check the output directory for files';

  const specSection = planningSpec
    ? `\n### What Was Supposed to Be Built\n${planningSpec}\n`
    : '';

  return `
---
## 🌐 BROWSER TESTING CONTEXT

### Dev Server URL
**${devUrl}**

### Original Task
**Title:** ${task.title}
${task.description ? `**Description:** ${task.description}\n` : ''}${specSection}
### Builder Deliverables
${deliverablesList}

### Browser Tool Instructions
You have access to the **browser tool** for visual verification. Use it to test the app:

1. **Navigate:** \`browser navigate ${devUrl}\` — open the dev server
2. **Screenshot:** \`browser screenshot\` — capture the current visual state
3. **Snapshot:** \`browser snapshot\` — inspect the DOM structure and accessibility tree
4. **Click:** \`browser act click <element>\` — click on buttons, links, UI elements
5. **Type:** \`browser act type <element> <text>\` — fill in form fields
6. **Evaluate:** \`browser evaluate <js>\` — run JavaScript to check for console errors, DOM state

### Testing Checklist
- [ ] Navigate to the dev URL and take a screenshot
- [ ] Verify the page loads without errors (check console)
- [ ] Click through all relevant UI elements
- [ ] Fill and submit any forms if applicable
- [ ] Check visual layout — does it match the spec?
- [ ] Verify images, links, icons render correctly
- [ ] Check responsive behavior if relevant
- [ ] Use your vision to evaluate: does the output match what was requested?

### Reporting Results
- **TEST_PASS:** Include a summary of what you verified and confirm visual correctness
- **TEST_FAIL:** Include specific evidence — what you saw vs what was expected. Reference screenshots and DOM state.
---`;
}
