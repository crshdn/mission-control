import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveAgentSessionKeyPrefix, routePrefixForGatewayAgent } from './agent-routing';
import type { Agent } from './types';

function agent(overrides: Partial<Agent>): Agent {
  return {
    id: 'agent-1',
    name: 'Test Agent',
    role: 'tester',
    avatar_emoji: 'x',
    status: 'standby',
    is_master: false,
    workspace_id: 'default',
    source: 'local',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

test('resolveAgentSessionKeyPrefix derives prefix from gateway_agent_id', () => {
  assert.equal(
    resolveAgentSessionKeyPrefix(agent({ gateway_agent_id: 'linkedin-poster' })),
    routePrefixForGatewayAgent('linkedin-poster')
  );
});

test('resolveAgentSessionKeyPrefix rejects removed agent:main route', () => {
  assert.throws(
    () => resolveAgentSessionKeyPrefix(agent({ session_key_prefix: 'agent:main:' })),
    /removed OpenClaw route/
  );
});

test('resolveAgentSessionKeyPrefix fails fast when no route is configured', () => {
  assert.throws(
    () => resolveAgentSessionKeyPrefix(agent({ session_key_prefix: undefined, gateway_agent_id: undefined })),
    /has no OpenClaw route/
  );
});
