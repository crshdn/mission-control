import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { modelChoices } from '@/lib/openclaw/model-choices';

const flash = 'minimax/MiniMax-M3.1-Flash';
const m3 = 'minimax/MiniMax-M3';
const legacy = 'minimax/MiniMax-M2.7';

test('discovery filters catalogs while preserving configured defaults and saved selections', async (t) => {
  const originalMode = process.env.MODEL_DISCOVERY;
  process.env.MODEL_DISCOVERY = 'auto';
  // Isolate device identity and local discovery from the developer configuration.
  fs.mkdirSync('.tmp', { recursive: true });
  const fixtureHome = fs.mkdtempSync(path.resolve('.tmp/model-discovery-'));
  t.mock.method(os, 'homedir', () => fixtureHome);
  const { OpenClawClient, getOpenClawClient } = await import('@/lib/openclaw/client');
  t.mock.method(OpenClawClient.prototype, 'isConnected', () => true);
  t.mock.method(OpenClawClient.prototype, 'connect', async () => { throw new Error('Unexpected network connection'); });
  let catalog = [m3, legacy, flash, 'minimax/image-01', 'custom/model'];
  t.mock.method(OpenClawClient.prototype, 'listModels', async () => catalog.map(id => ({ id, name: id, provider: 'minimax' })));
  t.mock.method(OpenClawClient.prototype, 'getConfig', async () => ({ config: { agents: { defaults: { model: { primary: legacy } } } } }));

  try {
    const { GET } = await import('./route');
    const remote = await GET();
    assert.equal(remote.status, 200);
    const remoteBody = await remote.json();
    assert.equal(remoteBody.source, 'remote');
    assert.equal(remoteBody.defaultModel, legacy);
    assert.deepEqual(remoteBody.availableModels.filter((id: string) => id.startsWith('minimax/MiniMax-M')), [flash, m3]);
    assert.ok(remoteBody.availableModels.includes('minimax/image-01'));
    assert.ok(remoteBody.availableModels.includes('custom/model'));
    assert.ok(modelChoices(remoteBody.availableModels, legacy).includes(legacy));

    catalog = [];
    fs.mkdirSync(path.join(fixtureHome, '.openclaw'));
    fs.writeFileSync(path.join(fixtureHome, '.openclaw/openclaw.json'), JSON.stringify({
      agents: { defaults: { model: { primary: legacy }, models: { 'custom/local-alias': {} } } },
      models: { providers: { minimax: { models: [
        { id: 'MiniMax-M2.7' }, { id: 'MiniMax-M3' }, { id: 'MiniMax-M3.1-Flash' }, { id: 'speech-02-hd' },
      ] } } },
    }));
    const localBody = await (await GET()).json();
    assert.equal(localBody.source, 'local');
    assert.equal(localBody.defaultModel, legacy);
    assert.deepEqual(localBody.availableModels, ['custom/local-alias', flash, m3, 'minimax/speech-02-hd']);

    fs.writeFileSync(path.join(fixtureHome, '.openclaw/openclaw.json'), '{}');
    const fallbackBody = await (await GET()).json();
    assert.equal(fallbackBody.source, 'fallback');
    assert.deepEqual(fallbackBody.availableModels.filter((id: string) => id.startsWith('minimax/')), [m3]);
    assert.equal(fallbackBody.defaultModel, undefined);
  } finally {
    getOpenClawClient().disconnect();
    const globals = globalThis as unknown as Record<string, NodeJS.Timeout>;
    clearInterval(globals.__openclaw_cache_cleanup_timer__);
    delete globals.__openclaw_cache_cleanup_timer__;
    if (originalMode === undefined) delete process.env.MODEL_DISCOVERY;
    else process.env.MODEL_DISCOVERY = originalMode;
  }
});
