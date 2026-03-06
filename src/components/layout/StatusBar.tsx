import { useState, useEffect } from 'react';
import { healthCheck } from '../../services/aceStepApi';
import { modalHealthCheck } from '../../services/modalApi';
import { useGenerationStore } from '../../store/generationStore';
import { useProjectStore } from '../../store/projectStore';

export function StatusBar() {
  const [connected, setConnected] = useState(false);
  const jobs = useGenerationStore((s) => s.jobs);
  const activeJobs = jobs.filter((j) => j.status === 'generating' || j.status === 'queued');
  const model = useProjectStore((s) => s.project?.generationDefaults.model);
  const useModal = useProjectStore((s) => s.project?.generationDefaults.useModal) ?? true;

  useEffect(() => {
    let active = true;
    const check = async () => {
      const ok = useModal ? await modalHealthCheck() : await healthCheck();
      if (active) setConnected(ok);
    };
    check();
    const interval = setInterval(check, 30000);
    return () => { active = false; clearInterval(interval); };
  }, [useModal]);

  return (
    <footer className="h-7 bg-black border-t border-daw-border px-4 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.2em] text-slate-600 shrink-0">
      <div className="flex gap-6">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]'}`} />
          {connected ? 'Engine Ready' : 'Disconnected'}
        </div>
        <div>{useModal ? 'ACE-Step API' : (model || 'Local')}</div>
        <div>48kHz / 24-bit</div>
      </div>
      <div className="flex gap-6">
        {activeJobs.length > 0 && (
          <div className="text-daw-accent">Queue: {activeJobs.length}</div>
        )}
        <div className="text-slate-400">Buffer: 128 spls</div>
      </div>
    </footer>
  );
}
