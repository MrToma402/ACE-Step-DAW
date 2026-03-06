import { useState } from 'react';
import { analyzeProjectStarterAudio, type ProjectStarterAnalysis } from '../../services/projectStarterAnalysis';

type AnalysisStatus = 'idle' | 'running' | 'succeeded' | 'failed';

interface NewProjectAnalysisPanelProps {
  onApplyDetectedSettings: (result: ProjectStarterAnalysis) => string;
}

export function NewProjectAnalysisPanel({ onApplyDetectedSettings }: NewProjectAnalysisPanelProps) {
  const [analysisFile, setAnalysisFile] = useState<File | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>('idle');
  const [analysisMessage, setAnalysisMessage] = useState<string>('Upload a vocal to detect BPM, key, and time signature.');
  const [analysisResult, setAnalysisResult] = useState<ProjectStarterAnalysis | null>(null);

  const handleAnalyze = async () => {
    if (!analysisFile || analysisStatus === 'running') {
      return;
    }

    setAnalysisStatus('running');
    setAnalysisResult(null);
    setAnalysisMessage(`Uploading ${analysisFile.name}...`);

    try {
      const result = await analyzeProjectStarterAudio(analysisFile, (message) => {
        setAnalysisMessage(message);
      });
      setAnalysisResult(result);
      setAnalysisMessage(onApplyDetectedSettings(result));
      setAnalysisStatus('succeeded');
    } catch (error) {
      setAnalysisStatus('failed');
      setAnalysisMessage(error instanceof Error ? error.message : 'Audio analysis failed.');
      setAnalysisResult(null);
    }
  };

  return (
    <div className="rounded border border-daw-border bg-daw-bg p-3">
      <p className="text-xs text-zinc-400 mb-2">Project Starter Analysis</p>
      <div
        className={`text-[11px] rounded border px-2 py-1.5 ${
          analysisStatus === 'failed'
            ? 'border-red-900/40 bg-red-900/20 text-red-300'
            : analysisStatus === 'succeeded'
              ? 'border-emerald-900/40 bg-emerald-900/20 text-emerald-300'
              : 'border-daw-border bg-daw-surface-2 text-zinc-400'
        }`}
      >
        {analysisMessage}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="px-3 py-1.5 text-xs font-medium bg-daw-surface-2 hover:bg-zinc-600 rounded transition-colors cursor-pointer">
          Upload Vocal
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(event) => {
              setAnalysisFile(event.target.files?.[0] ?? null);
              setAnalysisStatus('idle');
              setAnalysisResult(null);
              setAnalysisMessage('Ready to analyze the selected vocal.');
              event.currentTarget.value = '';
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => void handleAnalyze()}
          disabled={!analysisFile || analysisStatus === 'running'}
          className="px-3 py-1.5 text-xs font-medium bg-daw-accent hover:bg-daw-accent-hover text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {analysisStatus === 'running' ? 'Analyzing...' : 'Analyze'}
        </button>
        {analysisFile ? (
          <button
            type="button"
            onClick={() => {
              setAnalysisFile(null);
              setAnalysisResult(null);
              setAnalysisStatus('idle');
              setAnalysisMessage('Upload a vocal to detect BPM, key, and time signature.');
            }}
            className="px-3 py-1.5 text-xs font-medium bg-daw-surface-2 hover:bg-zinc-600 rounded transition-colors"
          >
            Clear
          </button>
        ) : null}
      </div>

      <p className="text-[11px] text-zinc-500 mt-2">{analysisFile?.name ?? 'No file selected'}</p>

      {analysisResult ? (
        <p className="text-[11px] text-zinc-400 mt-2">
          Detected: BPM {analysisResult.bpm ?? 'n/a'} • Key {analysisResult.keyScale ?? 'n/a'} • Time{' '}
          {analysisResult.rawTimeSignature ?? 'n/a'}
        </p>
      ) : null}
    </div>
  );
}
