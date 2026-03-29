import test from 'node:test';
import assert from 'node:assert/strict';

import { complete } from './llm';

test('complete sends OpenClaw-compatible chat completion requests for provider models', async () => {
  const originalFetch = global.fetch;
  const originalGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const originalGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  const originalAutopilotModel = process.env.AUTOPILOT_MODEL;

  process.env.OPENCLAW_GATEWAY_URL = 'ws://127.0.0.1:18789';
  process.env.OPENCLAW_GATEWAY_TOKEN = 'test-token';
  process.env.AUTOPILOT_MODEL = 'openai-codex/gpt-5.4';

  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  global.fetch = (async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({
      model: 'openclaw/default',
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const result = await complete('Say hi', { temperature: 0.1, maxTokens: 256 });

    assert.equal(result.content, '{"ok":true}');
    assert.equal(result.model, 'openai-codex/gpt-5.4');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'http://127.0.0.1:18789/v1/chat/completions');

    const headers = calls[0].init?.headers as Record<string, string>;
    assert.equal(headers['Authorization'], 'Bearer test-token');
    assert.equal(headers['x-openclaw-model'], 'openai-codex/gpt-5.4');

    const body = JSON.parse(String(calls[0].init?.body));
    assert.equal(body.model, 'openclaw/default');
    assert.equal(body.temperature, 0.1);
    assert.equal(body.max_tokens, 256);
    assert.deepEqual(body.messages, [{ role: 'user', content: 'Say hi' }]);
  } finally {
    global.fetch = originalFetch;
    if (originalGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = originalGatewayUrl;
    if (originalGatewayToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = originalGatewayToken;
    if (originalAutopilotModel === undefined) delete process.env.AUTOPILOT_MODEL;
    else process.env.AUTOPILOT_MODEL = originalAutopilotModel;
  }
});

test('complete preserves direct OpenClaw model requests without override header', async () => {
  const originalFetch = global.fetch;
  const originalGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const originalGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  process.env.OPENCLAW_GATEWAY_URL = 'ws://127.0.0.1:18789';
  process.env.OPENCLAW_GATEWAY_TOKEN = 'test-token';

  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  global.fetch = (async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({
      model: 'openclaw/researcher',
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const result = await complete('Say hi', { model: 'openclaw/researcher' });
    assert.equal(result.model, 'openclaw/researcher');

    const headers = calls[0].init?.headers as Record<string, string>;
    assert.equal(headers['x-openclaw-model'], undefined);

    const body = JSON.parse(String(calls[0].init?.body));
    assert.equal(body.model, 'openclaw/researcher');
  } finally {
    global.fetch = originalFetch;
    if (originalGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = originalGatewayUrl;
    if (originalGatewayToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = originalGatewayToken;
  }
});
