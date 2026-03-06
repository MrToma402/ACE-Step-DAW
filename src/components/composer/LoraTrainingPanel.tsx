import { useCallback, useRef, useState } from 'react';
import { useLoraStore } from '../../store/loraStore';
import { startUploadedLoraTraining } from '../../services/trainingApi';

interface TrainingFile {
  id: string;
  file: File;
  name: string;
  size: string;
}

interface TrainingJob {
  id: string;
  name: string;
  status: 'queued' | 'annotating' | 'training' | 'done' | 'error';
  progress: string;
  startedAt: number;
  error?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isAudioFile(file: File): boolean {
  if (file.type.startsWith('audio/')) return true;
  const name = file.name.toLowerCase();
  return ['.wav', '.mp3', '.flac', '.m4a', '.ogg', '.aac'].some((ext) => name.endsWith(ext));
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function LoraTrainingPanel() {
  const [files, setFiles] = useState<TrainingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const [loraName, setLoraName] = useState('');
  const [epochs, setEpochs] = useState(100);
  const [learningRate, setLearningRate] = useState(0.0001);
  const [loraRank, setLoraRank] = useState(16);
  const [batchSize, setBatchSize] = useState(1);
  const [saveEvery, setSaveEvery] = useState(50);

  const [training, setTraining] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const addLora = useLoraStore((s) => s.addLora);
  const updateLora = useLoraStore((s) => s.updateLora);
  const localLoras = useLoraStore((s) => s.localLoras);

  const [jobs, setJobs] = useState<TrainingJob[]>([]);

  const addFiles = useCallback((incoming: File[]) => {
    const accepted = incoming.filter(isAudioFile);
    if (accepted.length === 0) return;

    setFiles((prev) => {
      const existing = new Set(prev.map((f) => `${f.name}:${f.file.size}:${f.file.lastModified}`));
      const next: TrainingFile[] = [...prev];
      for (const file of accepted) {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (existing.has(key)) continue;
        existing.add(key);
        next.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
          name: file.name,
          size: formatFileSize(file.size),
        });
      }
      return next;
    });
  }, []);

  const handleFilesSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    addFiles(selectedFiles);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [addFiles]);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    const droppedFiles = Array.from(event.dataTransfer.files || []);
    addFiles(droppedFiles);
  }, [addFiles]);

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((file) => file.id !== id));
  };

  const updateJobStatus = useCallback((jobId: string, status: TrainingJob['status'], progress: string) => {
    setJobs((prev) => prev.map((job) => (
      job.id === jobId
        ? { ...job, status, progress, ...(status === 'error' ? { error: progress } : {}) }
        : job
    )));
  }, []);

  const handleStartTraining = async () => {
    if (files.length === 0) {
      setError('Please add at least one training audio file.');
      return;
    }
    if (!loraName.trim()) {
      setError('Please enter a name for the LoRA.');
      return;
    }

    setTraining(true);
    setError(null);

    const jobId = `job-${Date.now()}`;
    setJobs((prev) => [{
      id: jobId,
      name: loraName.trim(),
      status: 'queued',
      progress: 'Preparing training data...',
      startedAt: Date.now(),
    }, ...prev]);

    addLora({
      name: loraName.trim(),
      status: 'training',
      createdAt: Date.now(),
      epochs,
      rank: loraRank,
      numFiles: files.length,
    });

    try {
      setTrainingProgress('Encoding audio files...');
      updateJobStatus(jobId, 'annotating', 'Encoding audio files...');

      const audioFiles: { name: string; data: string }[] = [];
      for (const trainingFile of files) {
        const base64 = await blobToBase64(trainingFile.file);
        audioFiles.push({ name: trainingFile.name, data: base64 });
      }

      setTrainingProgress('Submitting training job...');
      updateJobStatus(jobId, 'training', 'Submitting training job...');

      const result = await startUploadedLoraTraining({
        lora_name: loraName.trim(),
        audio_files: audioFiles,
        epochs,
        learning_rate: learningRate,
        lora_rank: loraRank,
        batch_size: batchSize,
        save_every: saveEvery,
      });

      const status = (result.status || '').toLowerCase();
      const message = result.message || result.task_id || 'Training request accepted.';

      if (status === 'succeeded' || status === 'completed' || status === 'done') {
        updateJobStatus(jobId, 'done', message);
        setTrainingProgress('Training complete!');
      } else {
        // Some backends run training asynchronously after accepting the request.
        updateJobStatus(jobId, 'done', message);
        setTrainingProgress(message);
      }

      updateLora(loraName.trim(), { status: 'done' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setTrainingProgress('');
      updateJobStatus(jobId, 'error', message);
      updateLora(loraName.trim(), { status: 'error', error: message });
    } finally {
      setTraining(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <div className="px-6 py-4 border-b border-daw-border bg-daw-surface">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <span>🧠</span>
          LoRA Training
        </h2>
        <p className="text-[11px] text-zinc-500 mt-0.5">
          Train from dropped audio files using your configured ACE-Step API endpoint.
        </p>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium text-zinc-300">Training Audio Files</h3>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1 text-[11px] font-medium bg-daw-surface-2 hover:bg-zinc-600 rounded transition-colors"
              >
                + Add Files
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                multiple
                onChange={handleFilesSelect}
                className="hidden"
              />
            </div>

            {files.length === 0 ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setIsDragOver(false);
                }}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragOver
                    ? 'border-daw-accent bg-daw-accent/10'
                    : 'border-daw-border hover:border-daw-accent/50'
                }`}
              >
                <p className="text-xs text-zinc-500">Drop audio files here or click to browse</p>
                <p className="text-[10px] text-zinc-600 mt-1">Recommended: 4-16 songs in your target style</p>
              </div>
            ) : (
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setIsDragOver(false);
                }}
                onDrop={handleDrop}
                className={`space-y-1.5 max-h-48 overflow-y-auto rounded-lg p-2 ${
                  isDragOver ? 'bg-daw-accent/10' : ''
                }`}
              >
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between px-3 py-2 bg-daw-bg border border-daw-border rounded text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-zinc-500">🎵</span>
                      <span className="truncate text-zinc-300">{file.name}</span>
                      <span className="text-zinc-600 flex-shrink-0">{file.size}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(file.id)}
                      className="text-zinc-600 hover:text-red-400 ml-2 flex-shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <p className="text-[10px] text-zinc-600 pt-1">
                  {files.length} file{files.length !== 1 ? 's' : ''} selected
                </p>
              </div>
            )}
          </div>

          <div>
            <h3 className="text-xs font-medium text-zinc-300 mb-2">LoRA Configuration</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] text-zinc-500 mb-1">LoRA Name</label>
                <input
                  type="text"
                  value={loraName}
                  onChange={(event) => setLoraName(event.target.value)}
                  placeholder="e.g. my-jazz-style"
                  className="w-full px-3 py-1.5 text-sm bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-zinc-500 mb-1">Epochs</label>
                  <input
                    type="number"
                    value={epochs}
                    onChange={(event) => setEpochs(parseInt(event.target.value, 10) || 100)}
                    min={10}
                    max={1000}
                    className="w-full px-2 py-1.5 text-sm bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-500 mb-1">Learning Rate</label>
                  <input
                    type="number"
                    value={learningRate}
                    onChange={(event) => setLearningRate(parseFloat(event.target.value) || 0.0001)}
                    min={0.000001}
                    max={0.01}
                    step={0.00001}
                    className="w-full px-2 py-1.5 text-sm bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] text-zinc-500 mb-1">LoRA Rank</label>
                  <select
                    value={loraRank}
                    onChange={(event) => setLoraRank(parseInt(event.target.value, 10))}
                    className="w-full px-2 py-1.5 text-sm bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
                  >
                    <option value={4}>4 (Fastest)</option>
                    <option value={8}>8</option>
                    <option value={16}>16 (Default)</option>
                    <option value={32}>32</option>
                    <option value={64}>64 (Highest Quality)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-500 mb-1">Batch Size</label>
                  <input
                    type="number"
                    value={batchSize}
                    onChange={(event) => setBatchSize(Math.max(1, Math.min(8, parseInt(event.target.value, 10) || 1)))}
                    min={1}
                    max={8}
                    className="w-full px-2 py-1.5 text-sm bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-500 mb-1">Save Every N</label>
                  <input
                    type="number"
                    value={saveEvery}
                    onChange={(event) => setSaveEvery(parseInt(event.target.value, 10) || 50)}
                    min={10}
                    max={500}
                    className="w-full px-2 py-1.5 text-sm bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => void handleStartTraining()}
              disabled={training || files.length === 0 || !loraName.trim()}
              className="w-full py-2.5 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors flex items-center justify-center gap-2"
            >
              {training ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {trainingProgress || 'Submitting...'}
                </>
              ) : (
                <>🧠 Start Training</>
              )}
            </button>
            {error ? (
              <p className="mt-2 text-xs text-red-400 bg-red-900/20 px-3 py-2 rounded">{error}</p>
            ) : null}
          </div>

          <div className="bg-daw-surface-2 rounded-lg p-4">
            <h4 className="text-[11px] font-semibold text-zinc-300 mb-2">Training Tips</h4>
            <ul className="space-y-1 text-[10px] text-zinc-500">
              <li>• Use 4-16 songs that represent your target style</li>
              <li>• Higher LoRA rank is more expressive but slower</li>
              <li>• 100 epochs is a practical starting point</li>
              <li>• Lower learning rate for subtle fine-tuning, higher for stronger style shift</li>
            </ul>
          </div>
        </div>

        <div className="w-80 flex-shrink-0 bg-daw-surface border-l border-daw-border overflow-y-auto">
          <div className="p-4">
            <h3 className="text-xs font-semibold text-zinc-300 mb-3">Training History ({jobs.length})</h3>
            {jobs.length === 0 ? (
              <p className="text-xs text-zinc-600 text-center py-8">Training jobs will appear here</p>
            ) : (
              <div className="space-y-2">
                {jobs.map((job) => (
                  <div key={job.id} className="bg-daw-bg rounded border border-daw-border p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-zinc-300">{job.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        job.status === 'done'
                          ? 'bg-emerald-900/50 text-emerald-300'
                          : job.status === 'error'
                            ? 'bg-red-900/50 text-red-300'
                            : job.status === 'training'
                              ? 'bg-indigo-900/50 text-indigo-300'
                              : 'bg-zinc-800 text-zinc-400'
                      }`}
                      >
                        {job.status}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500">{job.progress}</p>
                    <p className="text-[9px] text-zinc-600 mt-1">{new Date(job.startedAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}

            {localLoras.length > 0 ? (
              <>
                <div className="border-t border-daw-border my-4" />
                <h4 className="text-xs font-semibold text-zinc-300 mb-2">Local LoRA Entries</h4>
                <div className="space-y-1">
                  {localLoras.map((lora) => (
                    <div key={lora.name} className="text-[10px] text-zinc-400">
                      {lora.name} - {lora.status}
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
