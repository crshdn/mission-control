import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowReviewAll } from './swipeDeck-utils';

test('shouldShowReviewAll uses the original deck size threshold', () => {
  assert.equal(shouldShowReviewAll(10), true);
  assert.equal(shouldShowReviewAll(9), false);
});