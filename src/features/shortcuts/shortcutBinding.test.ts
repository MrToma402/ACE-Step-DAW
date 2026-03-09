import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildShortcutBindingFromKeyboardEvent,
  formatShortcutBinding,
  matchesShortcutBinding,
} from './shortcutBinding.ts';

test('matches shortcut binding for Shift+Delete', () => {
  const matches = matchesShortcutBinding(
    {
      code: 'Delete',
      ctrlKey: false,
      shiftKey: true,
      altKey: false,
      metaKey: false,
    },
    'Shift+Delete',
  );

  assert.equal(matches, true);
});

test('builds shortcut binding with modifiers from keyboard event', () => {
  const binding = buildShortcutBindingFromKeyboardEvent({
    code: 'Delete',
    ctrlKey: false,
    shiftKey: true,
    altKey: false,
    metaKey: false,
  });

  assert.equal(binding, 'Shift+Delete');
});

test('formats shortcut bindings for display labels', () => {
  assert.equal(formatShortcutBinding('Shift+Delete'), 'Shift + Delete');
  assert.equal(formatShortcutBinding('KeyP'), 'P');
});
