export type DispatchCallbackRole = 'builder' | 'tester' | 'verifier' | 'fallback';

export interface MissionControlCurlOptions {
  authEnabled: boolean;
  method: 'POST' | 'PATCH';
  url: string;
  body: string;
}

export interface DispatchCallbackInstructionOptions {
  role: DispatchCallbackRole;
  authEnabled: boolean;
  missionControlUrl: string;
  taskId: string;
  nextStatus: string;
  outputPath?: string;
}

export function buildCallbackAuthPreflight(authEnabled: boolean): string {
  if (!authEnabled) {
    return '**Callback Auth:** Mission Control API auth is disabled for this deployment. No Authorization header is required.';
  }

  return `**Callback Auth:** Mission Control API auth is enabled for this deployment. Before any callback, verify that \`MC_API_TOKEN\` is present in your environment. If not, source the temporary auth file provided in your workspace.

\`\`\`bash
if [ -z "\${MC_API_TOKEN:-}" ] && [ -f "./.env.mc-token-temp" ]; then
  source ./.env.mc-token-temp
  export MC_API_TOKEN
fi

if [ -z "\${MC_API_TOKEN:-}" ]; then
  echo "MC_API_TOKEN is missing from the agent runtime environment." >&2
  exit 1
fi
\`\`\``;
}

export function buildMissionControlCurlCommand(options: MissionControlCurlOptions): string {  const lines = [
    `curl -sS -X ${options.method} "${options.url}" \\`,
    ...(options.authEnabled ? ['  -H "Authorization: Bearer $MC_API_TOKEN" \\'] : []),
    '  -H "Content-Type: application/json" \\',
    `  -d '${options.body}'`,
  ];

  return ['```bash', ...lines, '```'].join('\n');
}

export function buildTaskCompletionInstructions(
  options: DispatchCallbackInstructionOptions,
): string {
  const activityCommand = buildMissionControlCurlCommand({
    authEnabled: options.authEnabled,
    method: 'POST',
    url: `${options.missionControlUrl}/api/tasks/${options.taskId}/activities`,
    body: options.role === 'builder'
      ? '{"activity_type":"completed","message":"Description of what was done"}'
      : options.role === 'tester'
        ? '{"activity_type":"completed","message":"Tests passed: [summary]"}'
        : '{"activity_type":"completed","message":"Verification passed: [summary]"}',
  });

  const statusCommand = buildMissionControlCurlCommand({
    authEnabled: options.authEnabled,
    method: 'PATCH',
    url: `${options.missionControlUrl}/api/tasks/${options.taskId}`,
    body: `{"status":"${options.nextStatus}"}`,
  });

  const failCommand = buildMissionControlCurlCommand({
    authEnabled: options.authEnabled,
    method: 'POST',
    url: `${options.missionControlUrl}/api/tasks/${options.taskId}/fail`,
    body: '{"reason":"Detailed description of what failed and what needs fixing"}',
  });

  if (options.role === 'builder') {
    const deliverableCommand = buildMissionControlCurlCommand({
      authEnabled: options.authEnabled,
      method: 'POST',
      url: `${options.missionControlUrl}/api/tasks/${options.taskId}/deliverables`,
      body: `{"deliverable_type":"file","title":"File name","path":"${options.outputPath || './filename.html'}"}`,
    });

    return `**IMPORTANT:** After completing work, you MUST call these Mission Control APIs.

${buildCallbackAuthPreflight(options.authEnabled)}

1. Log activity:
${activityCommand}
2. Register deliverable:
${deliverableCommand}
3. Update status:
${statusCommand}

When complete, reply with:
\`TASK_COMPLETE: [brief summary of what you did]\``;
  }

  if (options.role === 'tester') {
    return `**YOUR ROLE: TESTER** — Test the deliverables for this task.

Review the output directory for deliverables and run any applicable tests.

${buildCallbackAuthPreflight(options.authEnabled)}

**If tests PASS:**
1. Log activity:
${activityCommand}
2. Update status:
${statusCommand}

**If tests FAIL:**
1. Report the failure:
${failCommand}

Reply with: \`TEST_PASS: [summary]\` or \`TEST_FAIL: [what failed]\``;
  }

  if (options.role === 'verifier') {
    return `**YOUR ROLE: VERIFIER** — Verify that all work meets quality standards.

Review deliverables, test results, and task requirements.

${buildCallbackAuthPreflight(options.authEnabled)}

**If verification PASSES:**
1. Log activity:
${activityCommand}
2. Update status:
${statusCommand}

**If verification FAILS:**
1. Report the failure:
${failCommand}

Reply with: \`VERIFY_PASS: [summary]\` or \`VERIFY_FAIL: [what failed]\``;
  }

  return `**IMPORTANT:** After completing work:

${buildCallbackAuthPreflight(options.authEnabled)}

1. Update status:
${statusCommand}`;
}
