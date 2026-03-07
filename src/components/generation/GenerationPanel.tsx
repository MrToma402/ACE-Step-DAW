import { useUIStore } from '../../store/uiStore';
import { GenerateButton } from './GenerateButton';

export function GenerationPanel() {
  const showMixer = useUIStore((s) => s.showMixer);
  const toggleMixer = useUIStore((s) => s.toggleMixer);

  return (
    <div className="border-t border-daw-border bg-daw-panel shrink-0">
      <div className="flex items-center h-9 px-4 gap-3">
        <GenerateButton />

        {/* Mixer toggle */}
        <button
          onClick={toggleMixer}
          className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded border transition-colors ${showMixer
            ? 'bg-daw-accent/15 text-daw-accent border-daw-accent/30'
            : 'text-slate-500 border-daw-border hover:text-slate-300 hover:bg-white/5'
            }`}
        >
          <span className="material-symbols-outlined text-sm">equalizer</span>
          Mixer
        </button>

      </div>
    </div>
  );
}
