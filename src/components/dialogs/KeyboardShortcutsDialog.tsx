import { useEffect, useState } from 'react';
import { useUIStore, type ShortcutBindings } from '../../store/uiStore';

type ShortcutAction = keyof ShortcutBindings;

const ACTION_LABELS: Record<ShortcutAction, string> = {
  playPause: 'Play / Pause',
  deleteSelected: 'Delete selected clips',
};

function formatKeyCode(code: string): string {
  if (code === 'Space') return 'Space';
  if (code === 'Backspace') return 'Backspace';
  if (code === 'Delete') return 'Delete';
  if (code.startsWith('Key')) return code.slice(3).toUpperCase();
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

export function KeyboardShortcutsDialog() {
  const show = useUIStore((s) => s.showKeyboardShortcutsDialog);
  const setShow = useUIStore((s) => s.setShowKeyboardShortcutsDialog);
  const shortcutBindings = useUIStore((s) => s.shortcutBindings);
  const setShortcutBinding = useUIStore((s) => s.setShortcutBinding);
  const resetShortcutBindings = useUIStore((s) => s.resetShortcutBindings);
  const [capturingAction, setCapturingAction] = useState<ShortcutAction | null>(null);

  useEffect(() => {
    if (!show || !capturingAction) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.code === 'Escape') {
        setCapturingAction(null);
        return;
      }
      setShortcutBinding(capturingAction, e.code);
      setCapturingAction(null);
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [capturingAction, setShortcutBinding, show]);

  useEffect(() => {
    if (!show) setCapturingAction(null);
  }, [show]);

  if (!show) return null;

  const startCapture = (action: ShortcutAction) => setCapturingAction(action);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70">
      <div className="w-[420px] bg-daw-surface rounded-lg border border-daw-border shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <h2 className="text-sm font-medium">Keyboard Shortcuts</h2>
          <button
            onClick={() => setShow(false)}
            className="text-zinc-500 hover:text-zinc-300 text-lg leading-none"
            title="Close"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-2">
          {(Object.keys(ACTION_LABELS) as ShortcutAction[]).map((action) => {
            const waiting = capturingAction === action;
            return (
              <div key={action} className="rounded border border-daw-border bg-daw-bg px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-zinc-300">{ACTION_LABELS[action]}</span>
                  <kbd className="rounded bg-daw-surface-2 px-2 py-1 text-xs text-zinc-100">
                    {formatKeyCode(shortcutBindings[action])}
                  </kbd>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => startCapture(action)}
                    className={`px-2 py-1 text-[11px] rounded transition-colors ${
                      waiting
                        ? 'bg-amber-600 text-white'
                        : 'bg-daw-surface-2 hover:bg-zinc-600 text-zinc-200'
                    }`}
                  >
                    {waiting ? 'Press a key...' : 'Change'}
                  </button>
                  {waiting && (
                    <span className="text-[10px] text-zinc-500">Press `Esc` to cancel</span>
                  )}
                </div>
              </div>
            );
          })}
          <p className="text-[10px] text-zinc-500">
            Shortcut actions are disabled while typing in input fields.
          </p>
        </div>

        <div className="flex justify-end px-4 py-3 border-t border-daw-border gap-2">
          <button
            onClick={() => resetShortcutBindings()}
            className="px-4 py-1.5 text-xs font-medium bg-daw-surface-2 hover:bg-zinc-600 rounded transition-colors"
          >
            Reset Defaults
          </button>
          <button
            onClick={() => setShow(false)}
            className="px-4 py-1.5 text-xs font-medium bg-daw-accent hover:bg-daw-accent-hover text-white rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
