export type SongSectionKind =
  | 'intro'
  | 'verse'
  | 'pre_chorus'
  | 'chorus'
  | 'bridge'
  | 'outro'
  | 'custom';

export type SectionStatus = 'idle' | 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
export type StyleLockStrength = 'soft' | 'balanced' | 'strict';
export type GridResolution = '1_bar' | '1_2' | '1_4' | '1_8' | '1_16' | '1_32';
export type TimeDisplayMode = 'bars_beats' | 'seconds';
export type MasterTonePreset = 'clean' | 'punch' | 'warm';
export type LoudnessTarget = '-18' | '-14' | '-10';
export type ArrangementViewMode = 'track' | 'arrangement';

export interface SongSection {
  id: string;
  name: string;
  kind: SongSectionKind;
  startTime: number;
  endTime: number;
  targetEnergy: number; // 0..1
  lyricBlock: string;
  status: SectionStatus;
  locked: boolean;
  errorMessage?: string;
}

export interface SectionGenerationPlan {
  enabledTrackIds: string[];
  styleLock: StyleLockStrength;
  takesPerSection: number;
}

export interface SectionTake {
  id: string;
  sectionId: string;
  trackClipIds: string[];
  score: number | null;
  selected: boolean;
  status: SectionStatus;
  note: string;
  createdAt: number;
  errorMessage?: string;
}

export interface ArrangementSettings {
  viewMode: ArrangementViewMode;
  hideInactiveTakes: boolean;
  snapEnabled: boolean;
  snapResolution: GridResolution;
  timeDisplayMode: TimeDisplayMode;
  sectionCrossfadeSeconds: number;
  masterTonePreset: MasterTonePreset;
  loudnessTarget: LoudnessTarget;
}

export interface VocalProductionProfile {
  enabled: boolean;
  sourceFileName: string | null;
  languageHint: string;
  preserveLyrics: boolean;
}

export interface ArrangementWorkspace {
  sections: SongSection[];
  takesBySectionId: Record<string, SectionTake[]>;
  selectedTakeBySectionId: Record<string, string | null>;
  generationPlanBySectionId: Record<string, SectionGenerationPlan>;
  selectedSectionId: string | null;
  settings: ArrangementSettings;
  vocalProfile: VocalProductionProfile;
}
