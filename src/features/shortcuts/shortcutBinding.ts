export interface ShortcutEventLike {
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

interface ParsedShortcutBinding {
  code: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

const MODIFIER_ALIASES: Record<string, keyof Omit<ParsedShortcutBinding, 'code'>> = {
  ctrl: 'ctrl',
  control: 'ctrl',
  shift: 'shift',
  alt: 'alt',
  option: 'alt',
  meta: 'meta',
  cmd: 'meta',
  command: 'meta',
};

function parseShortcutBinding(binding: string): ParsedShortcutBinding | null {
  const parts = binding
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) return null;

  const parsed: ParsedShortcutBinding = {
    code: '',
    ctrl: false,
    shift: false,
    alt: false,
    meta: false,
  };

  for (const part of parts) {
    const modifier = MODIFIER_ALIASES[part.toLowerCase()];
    if (modifier) {
      parsed[modifier] = true;
      continue;
    }
    if (parsed.code.length > 0) return null;
    parsed.code = part;
  }

  if (parsed.code.length === 0) return null;
  return parsed;
}

function formatCode(code: string): string {
  if (code === 'Space') return 'Space';
  if (code === 'Backspace') return 'Backspace';
  if (code === 'Delete') return 'Delete';
  if (code.startsWith('Key')) return code.slice(3).toUpperCase();
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

function isModifierCode(code: string): boolean {
  return code.startsWith('Shift') || code.startsWith('Control') || code.startsWith('Alt') || code.startsWith('Meta');
}

export function matchesShortcutBinding(
  event: ShortcutEventLike,
  binding: string,
): boolean {
  const parsed = parseShortcutBinding(binding);
  if (!parsed) return false;
  const codeMatches = event.code === parsed.code || (parsed.code === 'Delete' && event.code === 'Backspace');
  return (
    codeMatches
    && event.ctrlKey === parsed.ctrl
    && event.shiftKey === parsed.shift
    && event.altKey === parsed.alt
    && event.metaKey === parsed.meta
  );
}

export function buildShortcutBindingFromKeyboardEvent(
  event: ShortcutEventLike,
): string | null {
  if (isModifierCode(event.code)) return null;
  const parts: string[] = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Meta');
  parts.push(event.code);
  return parts.join('+');
}

export function formatShortcutBinding(binding: string): string {
  const parsed = parseShortcutBinding(binding);
  if (!parsed) return binding;
  const parts: string[] = [];
  if (parsed.ctrl) parts.push('Ctrl');
  if (parsed.alt) parts.push('Alt');
  if (parsed.shift) parts.push('Shift');
  if (parsed.meta) parts.push('Meta');
  parts.push(formatCode(parsed.code));
  return parts.join(' + ');
}
