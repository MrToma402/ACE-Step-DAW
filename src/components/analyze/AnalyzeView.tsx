import { useMemo, useState } from 'react';
import { analyzeProjectStarterAudio, type ProjectStarterAnalysis } from '../../services/projectStarterAnalysis';

type AnalysisStatus = 'idle' | 'running' | 'succeeded' | 'failed';

function formatTimeSignature(result: ProjectStarterAnalysis): string {
  if (result.rawTimeSignature) return result.rawTimeSignature;
  if (result.timeSignature !== null) return `${result.timeSignature}/4`;
  return 'n/a';
}

export function AnalyzeView() {
  const [analysisFile, setAnalysisFile] = useState<File | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>('idle');
  const [analysisMessage, setAnalysisMessage] = useState<string>('Upload audio and run ACE-Step analysis.');
  const [analysisResult, setAnalysisResult] = useState<ProjectStarterAnalysis | null>(null);

  const styleValue = useMemo(() => {
    if (!analysisResult) return 'n/a';
    if (analysisResult.genres.length > 0) return analysisResult.genres.join(', ');
    return analysisResult.genre ?? 'n/a';
  }, [analysisResult]);

  const instrumentsValue = useMemo(() => {
    if (!analysisResult || analysisResult.instruments.length === 0) return 'n/a';
    return analysisResult.instruments.join(', ');
  }, [analysisResult]);

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
      setAnalysisStatus('succeeded');
      setAnalysisMessage('Analysis completed.');
    } catch (error) {
      setAnalysisStatus('failed');
      setAnalysisMessage(error instanceof Error ? error.message : 'Audio analysis failed.');
      setAnalysisResult(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-daw-bg p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-5">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.18em] text-daw-accent flex items-center gap-2">
            <span className="material-symbols-outlined text-base">analytics</span>
            Audio Analyze
          </h2>
          <p className="text-[11px] text-zinc-500 mt-1">
            Upload any audio file and let ACE-Step infer musical metadata and descriptive tags.
          </p>
        </div>

        <div className="rounded border border-daw-border bg-daw-surface p-4">
          <div
            className={`text-[11px] rounded border px-3 py-2 ${
              analysisStatus === 'failed'
                ? 'border-red-900/40 bg-red-900/20 text-red-300'
                : analysisStatus === 'succeeded'
                  ? 'border-emerald-900/40 bg-emerald-900/20 text-emerald-300'
                  : 'border-daw-border bg-daw-surface-2 text-zinc-400'
            }`}
          >
            {analysisMessage}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="px-3 py-1.5 text-xs font-medium bg-daw-surface-2 hover:bg-zinc-600 rounded transition-colors cursor-pointer">
              Upload Audio
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(event) => {
                  setAnalysisFile(event.target.files?.[0] ?? null);
                  setAnalysisStatus('idle');
                  setAnalysisResult(null);
                  setAnalysisMessage('Ready to analyze the selected file.');
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
                  setAnalysisMessage('Upload audio and run ACE-Step analysis.');
                }}
                className="px-3 py-1.5 text-xs font-medium bg-daw-surface-2 hover:bg-zinc-600 rounded transition-colors"
              >
                Clear
              </button>
            ) : null}
          </div>

          <p className="text-[11px] text-zinc-500 mt-2">{analysisFile?.name ?? 'No file selected'}</p>
        </div>

        {analysisResult ? (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded border border-daw-border bg-daw-surface p-3 text-[11px]">
              <p className="text-zinc-500 uppercase tracking-wider text-[10px]">Tempo</p>
              <p className="text-zinc-100 mt-1">{analysisResult.bpm ?? 'n/a'} BPM</p>
            </div>
            <div className="rounded border border-daw-border bg-daw-surface p-3 text-[11px]">
              <p className="text-zinc-500 uppercase tracking-wider text-[10px]">Key</p>
              <p className="text-zinc-100 mt-1">{analysisResult.keyScale ?? 'n/a'}</p>
            </div>
            <div className="rounded border border-daw-border bg-daw-surface p-3 text-[11px]">
              <p className="text-zinc-500 uppercase tracking-wider text-[10px]">Time Signature</p>
              <p className="text-zinc-100 mt-1">{formatTimeSignature(analysisResult)}</p>
            </div>
            <div className="rounded border border-daw-border bg-daw-surface p-3 text-[11px]">
              <p className="text-zinc-500 uppercase tracking-wider text-[10px]">Duration</p>
              <p className="text-zinc-100 mt-1">
                {analysisResult.durationSeconds !== null ? `${analysisResult.durationSeconds.toFixed(1)}s` : 'n/a'}
              </p>
            </div>
            <div className="rounded border border-daw-border bg-daw-surface p-3 text-[11px]">
              <p className="text-zinc-500 uppercase tracking-wider text-[10px]">Style</p>
              <p className="text-zinc-100 mt-1">{styleValue}</p>
            </div>
            <div className="rounded border border-daw-border bg-daw-surface p-3 text-[11px]">
              <p className="text-zinc-500 uppercase tracking-wider text-[10px]">Instruments</p>
              <p className="text-zinc-100 mt-1">{instrumentsValue}</p>
            </div>
            <div className="rounded border border-daw-border bg-daw-surface p-3 text-[11px] md:col-span-2">
              <p className="text-zinc-500 uppercase tracking-wider text-[10px]">Caption</p>
              <p className="text-zinc-100 mt-1 whitespace-pre-wrap break-words">{analysisResult.caption ?? 'n/a'}</p>
              <p className="text-zinc-500 uppercase tracking-wider text-[10px] mt-3">Language</p>
              <p className="text-zinc-100 mt-1">{analysisResult.language ?? 'n/a'}</p>
              <p className="text-zinc-500 uppercase tracking-wider text-[10px] mt-3">Lyrics Preview</p>
              <p className="text-zinc-100 mt-1 whitespace-pre-wrap break-words">
                {analysisResult.lyrics ? analysisResult.lyrics.slice(0, 500) : 'n/a'}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
