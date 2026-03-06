# ACE-Step DAW

A browser-based Digital Audio Workstation that uses [ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5) for AI music generation. Tracks are generated sequentially in a "LEGO-style" pipeline — each new instrument layer is musically aware of everything generated before it.

## Requirements

- **Node.js** 18+
- **ACE-Step 1.5 API server** running on `localhost:7860` (default)
- If your API enforces bearer auth (`ACESTEP_API_KEY`), set `API_ACCESS_KEY` for the DAW environment

## Quick Start

```bash
npm install
npm run dev
```

Opens at [http://localhost:5176](http://localhost:5176). The app calls the ACE-Step API directly.

### Production Build

```bash
npm run build
npm run preview
```

## How It Works

### Generation Pipeline

ACE-Step DAW generates tracks bottom-to-top. Each step sends the cumulative mix of all previous tracks as context:

1. **Drums** — generated on silence
2. **Bass** — receives drums mix, generates bass on top
3. **Guitar** — receives drums+bass, generates guitar on top
4. ... and so on up through **Vocals**

After each generation, the app isolates the new track via wave subtraction (`currentMix - previousMix`) so you can control volume, mute, and solo individual tracks during playback.

### Workflow

1. **Create a project** — set name, BPM, key, time signature
2. **Add tracks** — pick from 13 instrument types (vocals, drums, bass, guitar, synth, strings, etc.)
3. **Create clips** — click an empty track lane; a clip appears snapped to the beat grid
4. **Write prompts** — double-click a clip to describe what it should sound like, optionally add lyrics
5. **Generate** — hit "Generate All" or right-click a single clip to generate just that one
6. **Mix** — adjust volume, mute/solo tracks, play back in the browser
7. **Export** — render all unmuted tracks to a stereo WAV file

### Musical Controls

Each clip has three tiers of musical control for BPM, key, and time signature:

| Mode        | Behavior                                   |
| ----------- | ------------------------------------------ |
| **Auto**    | ACE-Step 1.5 infers from the audio context |
| **Project** | Uses the project-level setting             |
| **Manual**  | Explicit per-clip override                 |

After generation, inferred values (BPM, key, time signature, genres, seed) are displayed on the clip.

### Sample Mode

Toggle "Sample Mode" in the clip editor to use ACE-Step 1.5's sample generation mode. The prompt field becomes a description field, lyrics are hidden, and the prompt is sent as a `sample_query`.

### Model Selection

Open **Settings** to pick from available models fetched from the ACE-Step 1.5 API. Leave it on "Server Default" to let the backend decide.

## Project Structure

```
src/
  components/
    dialogs/         # NewProjectDialog, SettingsDialog, ExportDialog
    generation/      # ClipPromptEditor, GenerationPanel
    layout/          # AppShell, Toolbar, StatusBar
    timeline/        # TimelineView, TimeRuler, ClipBlock
    tracks/          # TrackLane, TrackHeader, InstrumentPicker
    transport/       # TransportBar
  constants/         # Defaults, track definitions, key scales
  engine/            # AudioEngine, TrackNode, wave subtraction, export
  hooks/             # useAudioEngine, useGeneration, useTransport
  services/          # ACE-Step API client, generation pipeline, audio storage
  store/             # Zustand stores (project, transport, UI, generation)
  types/             # TypeScript interfaces (API, project)
  utils/             # WAV encoding, waveform peaks, color, time helpers
```

## Keyboard Shortcuts

| Key                 | Action        |
| ------------------- | ------------- |
| `Space`             | Play / Pause  |
| `Ctrl/Cmd + Scroll` | Zoom timeline |

## Configuration

Set the API base URL with Vite env vars:

- `VITE_ACESTEP_API_BASE` (preferred)
- `VITE_ACESTEP_API_KEY` (optional bearer key)

If none are set, the client falls back to `http://localhost:7860`.

## Tech Stack

- React 19, TypeScript, Vite
- Tailwind CSS v4
- Zustand (state management)
- Web Audio API (playback & rendering)
- IndexedDB via idb-keyval (audio blob storage)
