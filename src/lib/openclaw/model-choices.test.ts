import test from 'node:test';
import assert from 'node:assert/strict';
import { modelChoices } from './model-choices';

for (const provider of ['minimax', 'minimax-cn', 'minimax-portal', 'minimax-portal-cn', 'openrouter/minimax']) {
  test(`${provider} offers current text models with Flash first`, () => {
    const flash = `${provider}/MiniMax-M3.1-Flash${provider === 'openrouter/minimax' ? ':free' : ''}`;
    const m3 = `${provider}/MiniMax-M3`;
    const legacy = `${provider}/MiniMax-M2.7`;
    assert.deepEqual(modelChoices([m3, legacy, flash, m3]), [flash, m3]);
    assert.deepEqual(modelChoices([m3, legacy, flash], legacy), [flash, m3, legacy]);
  });
}

test('discovered OpenCode Flash IDs retain their gateway-specific suffix', () => {
  assert.deepEqual(modelChoices(['opencode/minimax-m2.5', 'opencode/minimax-m3', 'opencode/minimax-m3.1-flash-free']), [
    'opencode/minimax-m3.1-flash-free', 'opencode/minimax-m3',
  ]);
});

test('custom, unrelated and nontext model IDs survive unchanged', () => {
  const models = ['custom/MiniMax-M2.7', 'minimax/custom-model', 'minimax/MiniMax-M3-custom', 'minimax/image-01', 'minimax/MiniMax-VL-01', 'minimax/speech-02-hd', 'minimax/MiniMax-Hailuo-2.3'];
  assert.deepEqual(modelChoices(models), models);
  assert.deepEqual(modelChoices(models, 'private/saved-alias'), [...models, 'private/saved-alias']);
  assert.deepEqual(modelChoices(models, models[0]), models);
});

test('legacy text suggestions are removed without inventing undiscovered replacements', () => {
  assert.deepEqual(modelChoices(['minimax/MiniMax-Text-01', 'minimax/MiniMax-M1', 'minimax/MiniMax-M2.5', 'minimax/MiniMax-M3.1-Flash-Preview']), []);
});
