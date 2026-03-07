import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDuplicateShortcutAction } from './duplicateShortcut.ts';

test('resolveDuplicateShortcutAction matches Ctrl+D', () => {
  const action = resolveDuplicateShortcutAction({
    code: 'KeyD',
    ctrlKey: true,
    shiftKey: false,
    altKey: false,
    metaKey: false,
  });
  assert.equal(action, 'duplicate');
});

test('resolveDuplicateShortcutAction matches Ctrl+Shift+D', () => {
  const action = resolveDuplicateShortcutAction({
    code: 'KeyD',
    ctrlKey: true,
    shiftKey: true,
    altKey: false,
    metaKey: false,
  });
  assert.equal(action, 'duplicate_to_new_layer');
});

test('resolveDuplicateShortcutAction ignores unsupported modifiers or keys', () => {
  assert.equal(
    resolveDuplicateShortcutAction({
      code: 'KeyD',
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
    }),
    null,
  );
  assert.equal(
    resolveDuplicateShortcutAction({
      code: 'KeyD',
      ctrlKey: true,
      shiftKey: false,
      altKey: true,
      metaKey: false,
    }),
    null,
  );
  assert.equal(
    resolveDuplicateShortcutAction({
      code: 'KeyK',
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
      metaKey: false,
    }),
    null,
  );
});
