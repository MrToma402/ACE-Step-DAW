import { useState, useEffect } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { listModels } from '../../services/aceStepApi';
import type { ModelEntry } from '../../types/api';

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
  const [useModal, setUseModal] = useState(true);
  const [availableModels, setAvailableModels] = useState<ModelEntry[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  // Only sync form state when dialog opens, not on every project mutation
  useEffect(() => {
    if (show && project) {
      setSteps(project.generationDefaults.inferenceSteps);
      setGuidance(project.generationDefaults.guidanceScale);
      setShift(project.generationDefaults.shift);
      setThinking(project.generationDefaults.thinking);
      setModel(project.generationDefaults.model);
      setUseModal(project.generationDefaults.useModal ?? true);
    }
  }, [show]);

  useEffect(() => {
    if (!show || useModal) return;
    setModelsLoading(true);
    listModels()
      .then((resp) => setAvailableModels(resp.models))
      .catch(() => setAvailableModels([]))
      .finally(() => setModelsLoading(false));
  }, [show, useModal]);

  if (!show) return null;

  const handleSave = () => {
    const store = useProjectStore.getState();
    if (store.project) {
      useProjectStore.setState({
        project: {
          ...store.project,
          updatedAt: Date.now(),
          generationDefaults: {
            ...store.project.generationDefaults,
            inferenceSteps: steps,
            guidanceScale: guidance,
            shift,
            thinking,
            model,
            useModal,
          },
        },
      });
    }
    setShow(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
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
          <div className="flex items-center justify-between p-2 bg-daw-bg rounded border border-daw-border">
            <div>
              <span className="text-xs font-medium text-zinc-300">⚡ Fast Request Path</span>
              <p className="text-[10px] text-zinc-500 mt-0.5">Use JSON/base64 submission path for generation</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={useModal}
                onChange={(e) => setUseModal(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-zinc-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-daw-accent"></div>
            </label>
          </div>

          <h3 className="text-xs font-medium text-zinc-300">Generation Parameters</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Inference Steps</label>
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
              <label className="block text-xs text-zinc-400 mb-1">Guidance Scale</label>
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
              <label className="block text-xs text-zinc-400 mb-1">Shift</label>
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
