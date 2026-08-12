import test from 'node:test';
import assert from 'node:assert/strict';

test('fallback model discovery includes current MiniMax models', async () => {
  const originalDiscoveryMode = process.env.MODEL_DISCOVERY;
  process.env.MODEL_DISCOVERY = 'fallback';

  try {
    const { GET } = await import('./route');
    const response = await GET();
    const payload = await response.json();

    assert.ok(payload.availableModels.includes('minimax/MiniMax-M3'));
    assert.ok(payload.availableModels.includes('minimax/MiniMax-M2.7'));
  } finally {
    if (originalDiscoveryMode === undefined) delete process.env.MODEL_DISCOVERY;
    else process.env.MODEL_DISCOVERY = originalDiscoveryMode;
  }
});
