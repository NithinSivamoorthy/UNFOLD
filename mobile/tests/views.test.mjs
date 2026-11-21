import assert from 'node:assert/strict';
import { test } from 'node:test';

const { autoPickViews, swapSides, reindexAfterRemoval, isComplete } = await import('../src/scan/views.ts');

test('auto-pick spreads views evenly across the sequence', () => {
  assert.deepEqual(autoPickViews(24), { front: 0, left: 6, back: 12, right: 18 });
  assert.deepEqual(autoPickViews(4), { front: 0, left: 1, back: 2, right: 3 });
  assert.deepEqual(autoPickViews(0), { front: null, left: null, back: null, right: null });
  const few = autoPickViews(2);
  for (const v of Object.values(few)) assert.ok(v != null && v >= 0 && v < 2);
});

test('swap flips only left/right', () => {
  assert.deepEqual(swapSides({ front: 0, left: 6, back: 12, right: 18 }), { front: 0, left: 18, back: 12, right: 6 });
});

test('removing a frame clears or shifts dependent slots', () => {
  const sel = reindexAfterRemoval({ front: 0, left: 6, back: 12, right: 18 }, 6);
  assert.deepEqual(sel, { front: 0, left: null, back: 11, right: 17 });
  assert.equal(isComplete(sel), false);
  assert.equal(isComplete({ front: 0, left: 1, back: 2, right: 3 }), true);
});
