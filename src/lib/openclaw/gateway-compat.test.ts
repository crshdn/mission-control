import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractGatewayAgents,
  normalizeGatewayAgent,
  normalizeGatewayModel,
} from './gateway-compat';

test('extractGatewayAgents supports current gateway envelope', () => {
  const result = extractGatewayAgents({
    defaultId: 'main',
    agents: [{ id: 'main' }, { id: 'researcher' }],
  });

  assert.equal(result.length, 2);
  assert.deepEqual(result[0], { id: 'main' });
});

test('normalizeGatewayAgent handles modern OpenClaw agent payloads', () => {
  const normalized = normalizeGatewayAgent({
    id: 'main',
    workspace: '/Users/openclaw/.openclaw/workspace',
    model: {
      primary: 'nanogpt/minimax/minimax-m2.7',
      fallbacks: ['openai-codex/gpt-5.4'],
    },
  });

  assert.deepEqual(normalized, {
    id: 'main',
    name: 'main',
    label: undefined,
    model: 'nanogpt/minimax/minimax-m2.7',
    channel: undefined,
    status: undefined,
  });
});

test('normalizeGatewayAgent falls back to workspace basename when id is missing', () => {
  const normalized = normalizeGatewayAgent({
    workspace: '/Users/openclaw/.openclaw/workspace-general',
    model: 'openai/gpt-4o',
  });

  assert.deepEqual(normalized, {
    id: 'workspace-general',
    name: 'workspace-general',
    label: undefined,
    model: 'openai/gpt-4o',
    channel: undefined,
    status: undefined,
  });
});

test('normalizeGatewayModel tolerates nested and legacy model shapes', () => {
  assert.equal(normalizeGatewayModel('openai/gpt-4o'), 'openai/gpt-4o');
  assert.equal(
    normalizeGatewayModel({ provider: 'anthropic', id: 'claude-sonnet-4-5' }),
    'anthropic/claude-sonnet-4-5'
  );
  assert.equal(
    normalizeGatewayModel({ primary: { name: 'openai-codex/gpt-5.4' } }),
    'openai-codex/gpt-5.4'
  );
});

test('normalizeGatewayAgent rejects unusable payloads', () => {
  assert.equal(normalizeGatewayAgent(null), null);
  assert.equal(normalizeGatewayAgent({ model: { primary: 'x' } }), null);
});
