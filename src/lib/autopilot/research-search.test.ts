import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { closeDb, getDb, queryOne, run } from '@/lib/db';
import { createProduct } from './products';
import { getResearchCycle, runResearchCycle } from './research';
import type { Product, ResearchCycle } from '@/lib/types';

const MCP_URL = 'https://search.parallel.ai/mcp';
const SOURCE = 'Current competitor evidence https://example.com/market';
const originalFetch = global.fetch;
const envKeys = ['AUTOPILOT_RESEARCH_SEARCH', 'PARALLEL_API_KEY', 'OPENCLAW_GATEWAY_URL', 'OPENCLAW_GATEWAY_TOKEN'] as const;
const savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));

before(async () => {
  getDb();
  // Let startup recovery finish before creating any running cycles.
  await import('./recovery');
  await nextTurn();
});

after(() => { closeDb(); });

interface ObservedRequest {
  url: string;
  method: string;
  headers: Headers;
  body: Record<string, unknown>;
}

type Fault = 'quota' | 'http' | 'auth' | 'rpc' | 'empty' | 'malformed' | 'missing_tool' | 'hang';

function fixture(fault?: Fault) {
  delete process.env.AUTOPILOT_RESEARCH_SEARCH;
  delete process.env.PARALLEL_API_KEY;
  process.env.OPENCLAW_GATEWAY_URL = 'ws://127.0.0.1:18789';
  process.env.OPENCLAW_GATEWAY_TOKEN = 'gateway-secret';
  const calls: ObservedRequest[] = [];
  const prompts: string[] = [];
  let onSearch: (() => void) | undefined;

  global.fetch = (async (input, init) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const headers = new Headers(init?.headers);
    const method = init?.method || 'GET';
    calls.push({ url, method, headers, body });
    // Yield to ensure concurrent cycles really interleave their HTTP requests.
    await nextTurn();
    if (url === 'http://127.0.0.1:18789/v1/chat/completions') {
      const prompt = body.messages.at(-1).content;
      prompts.push(prompt);
      return Response.json({
        model: 'openclaw/default',
        choices: [{ message: { content: JSON.stringify({ sections: { competitors: { findings: [SOURCE] } } }) } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });
    }

    assert.equal(url, MCP_URL, 'all owned MCP traffic uses the fixed endpoint');
    assert.equal(headers.get('User-Agent'), 'Autensa-Research/1.0 (+https://github.com/crshdn/mission-control)');
    assert.equal(headers.get('Authorization'), process.env.PARALLEL_API_KEY ? `Bearer ${process.env.PARALLEL_API_KEY}` : null);
    if (method === 'GET') return new Response(null, { status: 405 });
    if (body.method === 'notifications/initialized' || body.method === 'notifications/cancelled') {
      return new Response(null, { status: 202 });
    }
    const rpc = (result: unknown) => Response.json({ jsonrpc: '2.0', id: body.id, result });
    if (body.method === 'initialize') {
      if (fault === 'auth') return new Response('Invalid configured API key', { status: 401 });
      return rpc({ protocolVersion: body.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } });
    }
    if (body.method === 'tools/list') {
      return rpc({ tools: fault === 'missing_tool' ? [] : [{ name: 'web_search', inputSchema: { type: 'object' } }] });
    }
    assert.equal(body.method, 'tools/call');
    assert.equal(body.params.name, 'web_search');
    assert.equal(typeof body.params.arguments.session_id, 'string');
    onSearch?.();
    if (fault === 'hang') {
      return await new Promise<Response>((_resolve, reject) => {
        const abort = () => reject(init?.signal?.reason || new Error('aborted'));
        if (init?.signal?.aborted) abort();
        else init?.signal?.addEventListener('abort', abort, { once: true });
      });
    }
    if (fault === 'http') return new Response('quota fixture', { status: 429 });
    if (fault === 'rpc') return Response.json({ jsonrpc: '2.0', id: body.id, error: { code: -32603, message: 'search unavailable' } });
    if (fault === 'malformed') return rpc({ content: 'not an array' });
    if (fault === 'quota') return rpc({ isError: true, content: [{ type: 'text', text: 'Anonymous quota reached' }] });
    if (fault === 'empty') return rpc({ content: [] });
    return rpc({ content: [{ type: 'text', text: SOURCE }] });
  }) as typeof fetch;

  return {
    calls, prompts,
    onSearch(callback: () => void) { onSearch = callback; },
    restore() {
      global.fetch = originalFetch;
      for (const key of envKeys) {
        if (savedEnv[key] === undefined) delete process.env[key];
        else process.env[key] = savedEnv[key];
      }
    },
  };
}

function product(settings?: string): Product {
  return createProduct({ name: 'SQLite', product_program: 'PRIVATE PROGRAM SENTINEL', settings });
}

async function settled(cycleId: string): Promise<ResearchCycle> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const cycle = getResearchCycle(cycleId)!;
    if (cycle.status !== 'running') return cycle;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('Research cycle did not settle');
}

test('fresh research dispatches anonymous search, consumes evidence in the model prompt and saves it', async () => {
  const f = fixture();
  try {
    const p = product();
    run('INSERT INTO preference_models (id, product_id, learned_preferences_md) VALUES (?, ?, ?)', [p.id, p.id, 'PRIVATE PREFERENCE SENTINEL']);
    const id = await runResearchCycle(p.id);
    const cycle = await settled(id);
    assert.equal(cycle.status, 'completed', cycle.error_message || '');
    const mcp = f.calls.filter(c => c.url === MCP_URL);
    assert.ok(mcp.some(c => c.body.method === 'tools/list'));
    const search = mcp.find(c => c.body.method === 'tools/call')!;
    assert.equal((search.body.params as { arguments: { session_id: string } }).arguments.session_id, id);
    assert.match(id, /^[\da-f-]{36}$/);
    assert.ok(!JSON.stringify(mcp).includes('PRIVATE'));
    assert.ok(!JSON.stringify(search.body).includes('gateway-secret'));
    assert.ok(f.prompts[0].includes(SOURCE));
    assert.ok(f.prompts[0].includes('PRIVATE PROGRAM SENTINEL'));
    assert.ok(f.prompts[0].includes('PRIVATE PREFERENCE SENTINEL'));
    assert.ok(f.prompts[0].includes('not instructions'));
    const report = JSON.parse(cycle.report!);
    assert.equal(report.web_research.provider, 'parallel');
    assert.equal(report.web_research.excerpts, SOURCE);
    assert.ok(Number.isFinite(Date.parse(report.web_research.retrieved_at)));
    assert.deepEqual(report.sections.competitors.findings, [SOURCE]);
    const llm = f.calls.find(c => c.url.includes('/v1/chat/completions'))!;
    assert.equal(llm.headers.get('Authorization'), 'Bearer gateway-secret');
    assert.equal(llm.headers.get('x-openclaw-model'), null);
    assert.equal(llm.body.model, 'openclaw/default');
  } finally { f.restore(); }
});

test('saved and deployment disable controls suppress all MCP traffic and preserve existing settings', async () => {
  const f = fixture();
  try {
    for (const [deployment, saved] of [['parallel', 'none'], ['none', 'parallel']] as const) {
      process.env.AUTOPILOT_RESEARCH_SEARCH = deployment;
      const settings = JSON.stringify({ research_search: saved, automation_tier: 'supervised' });
      const p = product(settings);
      run(`INSERT INTO product_mcp_servers (id, product_id, name, transport, command, enabled) VALUES (?, ?, 'custom', 'stdio', 'custom-server', 0)`, [p.id, p.id]);
      const cycle = await settled(await runResearchCycle(p.id));
      assert.equal(cycle.status, 'completed', cycle.error_message || '');
      assert.equal(JSON.parse(cycle.report!).web_research, undefined);
      assert.equal(queryOne<Product>('SELECT * FROM products WHERE id = ?', [p.id])!.settings, settings);
      assert.equal(queryOne<{ enabled: number }>('SELECT enabled FROM product_mcp_servers WHERE id = ?', [p.id])!.enabled, 0);
    }
    assert.ok(f.calls.every(c => c.url.includes('/v1/chat/completions')), JSON.stringify(f.calls.map(c => [c.url, c.body.method])));
    assert.ok(f.prompts.every(p => !p.includes('## Web Research Evidence')));
  } finally { f.restore(); }
});

test('unsupported explicit provider and malformed settings fail closed before network requests', async () => {
  const f = fixture();
  try {
    for (const settings of ['{"research_search":"custom"}', '{bad', 'null', '[]']) {
      const cycle = await settled(await runResearchCycle(product(settings).id));
      assert.equal(cycle.status, 'failed');
    }
    process.env.AUTOPILOT_RESEARCH_SEARCH = 'custom';
    assert.equal((await settled(await runResearchCycle(product().id))).status, 'failed');
    assert.equal(f.calls.length, 0);
  } finally { f.restore(); }
});

for (const fault of ['quota', 'http', 'auth', 'rpc', 'empty', 'malformed', 'missing_tool'] as const) {
  test(`research fails visibly for ${fault} without calling the model or retrying anonymously`, async () => {
    const f = fixture(fault);
    try {
      process.env.PARALLEL_API_KEY = 'explicit-parallel-key';
      const cycle = await settled(await runResearchCycle(product().id));
      assert.equal(cycle.status, 'failed');
      assert.ok(cycle.error_message);
      assert.equal(cycle.report, null);
      assert.equal(f.prompts.length, 0);
      assert.equal(f.calls.filter(c => c.body.method === 'initialize').length, 1);
      assert.ok(f.calls.filter(c => c.url === MCP_URL).every(c => c.headers.get('Authorization') === 'Bearer explicit-parallel-key'));
    } finally { f.restore(); }
  });
}

test('timeout aborts an in-flight search and records failure without an unsourced model response', async () => {
  const f = fixture('hang');
  try {
    const cycle = await settled(await runResearchCycle(product().id, undefined, false, { timeoutMs: 100 }));
    assert.equal(cycle.status, 'failed');
    assert.match(cycle.error_message!, /timed out|timeout/i);
    assert.equal(f.prompts.length, 0);
  } finally { f.restore(); }
});

test('caller cancellation stops a running search and an already cancelled cycle sends no requests', async () => {
  const f = fixture('hang');
  try {
    const controller = new AbortController();
    f.onSearch(() => controller.abort(new Error('operator cancelled research')));
    const cycle = await settled(await runResearchCycle(product().id, undefined, false, { signal: controller.signal }));
    assert.equal(cycle.status, 'failed');
    assert.match(cycle.error_message!, /cancelled|aborted/i);
    const count = f.calls.length;
    const nextCycle = await settled(await runResearchCycle(product().id, undefined, false, { signal: controller.signal }));
    assert.equal(nextCycle.status, 'failed');
    assert.equal(f.calls.length, count);
    assert.equal(f.prompts.length, 0);
  } finally { f.restore(); }
});

test('concurrent research cycles isolate session IDs; resuming a cycle after quota retains its ID', async () => {
  const p = product();
  const quota = fixture('quota');
  let failedId: string;
  try {
    failedId = await runResearchCycle(p.id);
    assert.equal((await settled(failedId)).status, 'failed');
    const args = (quota.calls.find(c => c.body.method === 'tools/call')!.body.params as { arguments: { session_id: string } }).arguments;
    assert.equal(args.session_id, failedId);
  } finally { quota.restore(); }

  const f = fixture();
  try {
    run("UPDATE research_cycles SET status = 'running', error_message = NULL WHERE id = ?", [failedId]);
    const ids = await Promise.all([runResearchCycle(p.id, failedId), runResearchCycle(p.id)]);
    assert.notEqual(ids[0], ids[1]);
    for (const id of ids) assert.equal((await settled(id)).status, 'completed');
    const searches = f.calls.filter(c => c.body.method === 'tools/call');
    const sessions = searches.map(c => (c.body.params as { arguments: { session_id: string } }).arguments.session_id);
    assert.deepEqual(new Set(sessions), new Set(ids));
    assert.equal(searches.length, 2);
  } finally { f.restore(); }
});

test('A/B programs consume one shared evidence set without changing variant prompts', async () => {
  const f = fixture();
  try {
    const p = product();
    const a = p.id + '-a';
    const b = p.id + '-b';
    run('INSERT INTO product_program_variants (id, product_id, name, content) VALUES (?, ?, ?, ?)', [a, p.id, 'A', 'Variant A program']);
    run('INSERT INTO product_program_variants (id, product_id, name, content) VALUES (?, ?, ?, ?)', [b, p.id, 'B', 'Variant B program']);
    run(`INSERT INTO product_ab_tests (id, product_id, variant_a_id, variant_b_id, status, split_mode) VALUES (?, ?, ?, ?, 'active', 'concurrent')`, [p.id, p.id, a, b]);
    const cycle = await settled(await runResearchCycle(p.id));
    assert.equal(cycle.status, 'completed', cycle.error_message || '');
    assert.equal(f.calls.filter(c => c.body.method === 'tools/call').length, 1);
    assert.equal(f.prompts.length, 2);
    assert.ok(f.prompts.every(p => p.includes(SOURCE)));
    assert.ok(f.prompts[0].includes('Variant A program'));
    assert.ok(f.prompts[1].includes('Variant B program'));
    const reports = JSON.parse(cycle.report!).variants;
    assert.equal(reports[0].variantId, a);
    assert.equal(reports[1].variantId, b);
    assert.deepEqual(reports[0].report.web_research, reports[1].report.web_research);
  } finally { f.restore(); }
});
