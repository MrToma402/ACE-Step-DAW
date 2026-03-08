import { useState, useEffect, useRef, useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';

interface MeterLevels {
    [trackId: string]: number;
}

export function MixerConsole() {
    const project = useProjectStore((s) => s.project);
    const updateTrack = useProjectStore((s) => s.updateTrack);
    const [levels, setLevels] = useState<MeterLevels>({});
    const [masterLevel, setMasterLevel] = useState(0);
    const rafRef = useRef<number>(0);
    const smoothedRef = useRef<MeterLevels>({});
    const smoothedMasterRef = useRef(0);

    // Animation loop for metering
    useEffect(() => {
        const engine = getAudioEngine();
        let running = true;

        const tick = () => {
            if (!running) return;

            const newLevels: MeterLevels = {};
            for (const [trackId, node] of engine.trackNodes.entries()) {
                const raw = node.getPeakLevel();
                const prev = smoothedRef.current[trackId] || 0;
                // Smooth: fast attack, slow release
                const smoothed = raw > prev ? raw * 0.7 + prev * 0.3 : prev * 0.92 + raw * 0.08;
                newLevels[trackId] = smoothed;
            }
            smoothedRef.current = newLevels;

            const rawMaster = engine.getMasterPeakLevel();
            const prevMaster = smoothedMasterRef.current;
            const smoothedMaster = rawMaster > prevMaster ? rawMaster * 0.7 + prevMaster * 0.3 : prevMaster * 0.92 + rawMaster * 0.08;
            smoothedMasterRef.current = smoothedMaster;

            setLevels({ ...newLevels });
            setMasterLevel(smoothedMaster);
            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
        return () => {
            running = false;
            cancelAnimationFrame(rafRef.current);
        };
    }, []);

    const volumeToDb = useCallback((vol: number) => {
        if (vol <= 0) return '-∞';
        const db = 20 * Math.log10(vol);
        return db.toFixed(1);
    }, []);

    const levelToPercent = useCallback((level: number) => {
        // Convert to dB, map -60..0 dB to 0..100%
        if (level <= 0.001) return 0;
        const db = 20 * Math.log10(level);
        const pct = ((db + 60) / 60) * 100;
        return Math.max(0, Math.min(100, pct));
    }, []);

    if (!project) return null;

    const sortedTracks = [...project.tracks]
      .filter((track) => !track.hidden)
      .sort((a, b) => a.order - b.order);
    const masterPct = levelToPercent(masterLevel);
    const masterDb = volumeToDb(masterLevel > 0.001 ? masterLevel : 0);

    return (
        <div className="h-full min-h-[160px] bg-daw-panel border-t border-daw-border flex flex-col shrink-0">
            {/* Header bar */}
            <div className="h-7 bg-daw-surface border-b border-daw-border flex items-center px-4">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-[0.2em]">Mixer Console</span>
                <div className="ml-auto flex gap-4">
                    <span className="text-[9px] text-daw-accent uppercase font-bold tracking-[0.15em]">Faders</span>
                </div>
            </div>

            {/* Channel strips */}
            <div className="flex-1 flex overflow-x-auto px-3 py-2 gap-1 items-stretch">
                {sortedTracks.map((track) => {
                    const trackLevel = levels[track.id] || 0;
                    const meterPct = levelToPercent(trackLevel);

                    return (
                        <div key={track.id} className="w-[76px] bg-daw-surface border border-daw-border rounded flex flex-col items-center px-1.5 py-1.5 shrink-0">
                            {/* Track name */}
                            <div className="text-[8px] text-center font-bold mb-1 truncate w-full tracking-[0.12em] uppercase" style={{ color: track.color }}>
                                {track.displayName}
                            </div>

                            {/* Fader + Meter area */}
                            <div className="flex-1 flex w-full gap-1 min-h-0">
                                {/* VU Meter L */}
                                <div className="w-2 bg-black/60 rounded-sm overflow-hidden flex flex-col-reverse">
                                    <div
                                        className="w-full transition-[height] duration-75"
                                        style={{
                                            height: `${meterPct}%`,
                                            background: track.muted ? '#333' : meterPct > 85 ? 'linear-gradient(to top, #10b981, #eab308, #ef4444)' : 'linear-gradient(to top, #10b981, #3b82f6)',
                                        }}
                                    />
                                </div>
                                {/* VU Meter R */}
                                <div className="w-2 bg-black/60 rounded-sm overflow-hidden flex flex-col-reverse">
                                    <div
                                        className="w-full transition-[height] duration-75"
                                        style={{
                                            height: `${Math.max(0, meterPct - 2)}%`,
                                            background: track.muted ? '#333' : meterPct > 85 ? 'linear-gradient(to top, #10b981, #eab308, #ef4444)' : 'linear-gradient(to top, #10b981, #3b82f6)',
                                        }}
                                    />
                                </div>

                                {/* Fader */}
                                <div className="flex-1 relative">
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={Math.round(track.volume * 100)}
                                        onChange={(e) => updateTrack(track.id, { volume: parseInt(e.target.value) / 100 })}
                                        className="mixer-fader"
                                        style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                                    />
                                </div>
                            </div>

                            {/* dB readout */}
                            <div className="text-[8px] font-mono mt-1 text-slate-500">{volumeToDb(track.volume)}</div>

                            {/* M/S */}
                            <div className="flex gap-0.5 mt-0.5">
                                <button
                                    onClick={() => updateTrack(track.id, { muted: !track.muted })}
                                    className={`w-5 h-3.5 text-[7px] font-bold flex items-center justify-center rounded transition-colors ${track.muted ? 'bg-amber-600/80 text-white' : 'bg-black/40 text-slate-600 hover:text-white'}`}
                                >
                                    M
                                </button>
                                <button
                                    onClick={() => updateTrack(track.id, { soloed: !track.soloed })}
                                    className={`w-5 h-3.5 text-[7px] font-bold flex items-center justify-center rounded transition-colors ${track.soloed ? 'bg-emerald-600/80 text-white' : 'bg-black/40 text-slate-600 hover:text-white'}`}
                                >
                                    S
                                </button>
                            </div>
                        </div>
                    );
                })}

                {/* Master channel */}
                <div className="w-24 bg-daw-panel-light border border-daw-accent/30 rounded flex flex-col items-center px-1.5 py-1.5 ml-auto shrink-0 shadow-lg">
                    <div className="text-[8px] text-center font-bold text-daw-accent mb-1 uppercase tracking-[0.2em]">Master</div>

                    <div className="flex-1 flex w-full gap-1 justify-center min-h-0">
                        {/* Master L meter */}
                        <div className="w-3 bg-black/60 rounded-sm overflow-hidden flex flex-col-reverse">
                            <div
                                className="w-full transition-[height] duration-75"
                                style={{
                                    height: `${masterPct}%`,
                                    background: masterPct > 85 ? 'linear-gradient(to top, #10b981, #eab308, #ef4444)' : 'linear-gradient(to top, #10b981, #3b82f6)',
                                }}
                            />
                        </div>
                        {/* Master R meter */}
                        <div className="w-3 bg-black/60 rounded-sm overflow-hidden flex flex-col-reverse">
                            <div
                                className="w-full transition-[height] duration-75"
                                style={{
                                    height: `${Math.max(0, masterPct - 1)}%`,
                                    background: masterPct > 85 ? 'linear-gradient(to top, #10b981, #eab308, #ef4444)' : 'linear-gradient(to top, #10b981, #3b82f6)',
                                }}
                            />
                        </div>

                        {/* Master fader (visual only for now) */}
                        <div className="w-4 bg-black/30 rounded-sm relative ml-1">
                            <div
                                className="absolute left-1/2 -translate-x-1/2 w-7 h-3.5 bg-daw-accent rounded-sm shadow-lg shadow-daw-accent/30 pointer-events-none flex items-center justify-center"
                                style={{ bottom: '75%', transform: 'translateX(-50%) translateY(50%)' }}
                            >
                                <div className="w-3 h-0.5 bg-white/50" />
                            </div>
                        </div>
                    </div>

                    <div className="text-[9px] font-mono mt-1 text-daw-accent font-bold">{masterDb} dB</div>
                </div>
            </div>
        </div>
    );
}
