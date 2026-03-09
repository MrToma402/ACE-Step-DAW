import { useState, useEffect } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { listModels } from '../../services/aceStepApi';
import type { ModelEntry } from '../../types/api';

const DEFAULT_SETTINGS_VALUES = {
  inferenceSteps: 50,
  guidanceScale: 7.0,
  shift: 3.0,
  thinking: true,
  model: '',
} as const;

function normalizeModels(models: unknown): ModelEntry[] {
  if (!Array.isArray(models)) return [];
  return models
    .map((entry) => {
      if (typeof entry === 'string') {
        return { name: entry, is_default: false } satisfies ModelEntry;
      }
      if (!entry || typeof entry !== 'object') return null;
      const candidate = entry as Partial<ModelEntry>;
      if (!candidate.name || typeof candidate.name !== 'string') return null;
      return {
        name: candidate.name,
        is_default: Boolean(candidate.is_default),
      } satisfies ModelEntry;
    })
    .filter((entry): entry is ModelEntry => entry !== null);
}

export function SettingsDialog() {
  const show = useUIStore((s) => s.showSettingsDialog);
  const setShow = useUIStore((s) => s.setShowSettingsDialog);
  const setShowKeyboardShortcutsDialog = useUIStore((s) => s.setShowKeyboardShortcutsDialog);
  const project = useProjectStore((s) => s.project);

  const [steps, setSteps] = useState(50);
  const [guidance, setGuidance] = useState(7.0);
  const [shift, setShift] = useState(3.0);
  const [thinking, setThinking] = useState(true);
  const [model, setModel] = useState('');
  const [availableModels, setAvailableModels] = useState<ModelEntry[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  // Only sync form state when dialog opens, not on every project mutation
  useEffect(() => {
    if (show && project) {
      const defaults = project.generationDefaults ?? DEFAULT_SETTINGS_VALUES;
      setSteps(defaults.inferenceSteps ?? DEFAULT_SETTINGS_VALUES.inferenceSteps);
      setGuidance(defaults.guidanceScale ?? DEFAULT_SETTINGS_VALUES.guidanceScale);
      setShift(defaults.shift ?? DEFAULT_SETTINGS_VALUES.shift);
      setThinking(defaults.thinking ?? DEFAULT_SETTINGS_VALUES.thinking);
      setModel(defaults.model ?? DEFAULT_SETTINGS_VALUES.model);
    }
  }, [show, project]);

  useEffect(() => {
    if (!show) return;
    setModelsLoading(true);
    listModels()
      .then((resp) => setAvailableModels(normalizeModels(resp?.models)))
      .catch(() => setAvailableModels([]))
      .finally(() => setModelsLoading(false));
  }, [show]);

  if (!show) return null;

  const handleSave = () => {
    const store = useProjectStore.getState();
    if (store.project) {
      useProjectStore.setState({
        project: {
          ...store.project,
          updatedAt: Date.now(),
          generationDefaults: {
            ...(store.project.generationDefaults ?? DEFAULT_SETTINGS_VALUES),
            inferenceSteps: steps,
            guidanceScale: guidance,
            shift,
            thinking,
            model,
          },
        },
      });
    }
    setShow(false);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60">
      <div className="w-[400px] bg-daw-surface rounded-lg border border-daw-border shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <h2 className="text-sm font-medium">Settings</h2>
          <button
            onClick={() => setShow(false)}
            className="text-zinc-500 hover:text-zinc-300 text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-3">
          <h3 className="text-xs font-medium text-zinc-300">Generation Parameters</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="flex items-center gap-1 text-xs text-zinc-400 mb-1">
                <span>Inference Steps</span>
                <span
                  className="text-zinc-500 cursor-help"
                  title="How many denoising steps to run. More steps are slower and can improve stability."
                >
                  ⓘ
                </span>
              </label>
              <input
                type="number"
                value={steps}
                onChange={(e) => setSteps(parseInt(e.target.value) || 50)}
                min={10}
                max={200}
                className="w-full px-3 py-1.5 text-sm bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
              />
            </div>
            <div>
              <label className="flex items-center gap-1 text-xs text-zinc-400 mb-1">
                <span>Guidance Scale</span>
                <span
                  className="text-zinc-500 cursor-help"
                  title="How strongly generation follows your conditioning. Higher values can sound forced or artifacty."
                >
                  ⓘ
                </span>
              </label>
              <input
                type="number"
                value={guidance}
                onChange={(e) => setGuidance(parseFloat(e.target.value) || 7.0)}
                min={1}
                max={20}
                step={0.5}
                className="w-full px-3 py-1.5 text-sm bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="flex items-center gap-1 text-xs text-zinc-400 mb-1">
                <span>Shift</span>
                <span
                  className="text-zinc-500 cursor-help"
                  title="Sampling schedule offset. Changes character and clarity; keep near default unless A/B testing."
                >
                  ⓘ
                </span>
              </label>
              <input
                type="number"
                value={shift}
                onChange={(e) => setShift(parseFloat(e.target.value) || 3.0)}
                min={0}
                max={10}
                step={0.5}
                className="w-full px-3 py-1.5 text-sm bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={thinking}
                  onChange={(e) => setThinking(e.target.checked)}
                  className="w-4 h-4 rounded border-daw-border bg-daw-bg accent-daw-accent"
                />
                <span className="text-xs text-zinc-400">Thinking mode</span>
              </label>
            </div>
          </div>
          <p className="text-[10px] text-zinc-500">
            Note: timeline LEGO/Complete clip generation always runs with thinking off (Gradio-aligned).
          </p>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={modelsLoading}
              className="w-full px-3 py-1.5 text-sm bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
            >
              <option value="">Server Default</option>
              {availableModels.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}{m.is_default ? ' (default)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-1">
            <h3 className="text-xs font-medium text-zinc-300 mb-1.5">Keyboard Shortcuts</h3>
            <button
              onClick={() => setShowKeyboardShortcutsDialog(true)}
              className="text-xs text-daw-accent hover:text-daw-accent-hover underline underline-offset-2"
            >
              Open keyboard shortcuts editor
            </button>
          </div>
        </div>

        <div className="flex justify-end px-4 py-3 border-t border-daw-border gap-2">
          <button
            onClick={() => setShow(false)}
            className="px-4 py-1.5 text-xs font-medium bg-daw-surface-2 hover:bg-zinc-600 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 text-xs font-medium bg-daw-accent hover:bg-daw-accent-hover text-white rounded transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
