import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldSelectClipOnPointerDown } from './clipPointerDownSelection.ts';

test('shouldSelectClipOnPointerDown selects unselected clip on normal move press', () => {
  assert.equal(
    shouldSelectClipOnPointerDown({
      mode: 'move',
      isSelected: false,
      additive: false,
    }),
    true,
  );
});

test('shouldSelectClipOnPointerDown does not replace selection for additive move press', () => {
  assert.equal(
    shouldSelectClipOnPointerDown({
      mode: 'move',
      isSelected: false,
      additive: true,
    }),
    false,
  );
});

test('shouldSelectClipOnPointerDown does not select on resize handles', () => {
  assert.equal(
    shouldSelectClipOnPointerDown({
      mode: 'resize-left',
      isSelected: false,
      additive: false,
    }),
    false,
  );
  assert.equal(
    shouldSelectClipOnPointerDown({
      mode: 'resize-right',
      isSelected: false,
      additive: false,
    }),
    false,
  );
});
