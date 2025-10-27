# SDR Scanner - Project Documentation

## Project Overview

SDR Scanner is a cross-platform desktop application for software-defined radio (SDR) frequency monitoring, scanning, recording, transcription, and analysis. Built with Electron, it provides a modern interface for working with RTL-SDR devices.

## Core Features

1. **Radio Frequency Listening**: Real-time monitoring of radio frequencies using RTL-SDR devices
2. **Frequency Range Scanning**: User-configurable scanning of frequency ranges
3. **Audio Recording**: Capture and store demodulated audio data
4. **Speech Transcription**: Automatic transcription using OpenAI Whisper (or faster-whisper variant)
5. **Timeline & Search**: Browse and filter captured audio by:
   - Frequency
   - Date/time range
   - Transcription text search
   - Custom filters

## Technology Stack

### Core Framework
- **Electron**: Cross-platform desktop application framework
- **Vite**: Build tool and dev server
- **TypeScript**: Primary language with SWC transpilation
- **React**: UI framework for the renderer process

### Architecture
Based on [vite-electron-builder](https://github.com/cawa-93/vite-electron-builder) boilerplate:
- **Monorepo structure** using npm workspaces
- **Security-focused**: Context isolation, sandboxed renderer
- **IPC communication**: Between main and renderer processes

### Key Dependencies (Planned)
- **[rtlfmjs](https://github.com/qualitymanifest/rtlfmjs)**: SDR capture and FM demodulation
- **[timestampsdr](https://github.com/qualitymanifest/timestampsdr)**: Pattern for audio recording implementation
- **OpenAI Whisper**: Speech-to-text transcription engine

## Project Structure

```
sdr-scanner/
├── packages/
│   ├── main/           # Electron main process
│   ├── preload/        # Preload scripts (IPC bridge)
│   ├── renderer/       # React UI application
│   └── ...
├── tests/              # E2E tests (Playwright)
└── package.json        # Root package configuration
```

### Package Responsibilities

- **`@app/main`**: Electron main process, handles:
  - Window management
  - SDR device communication via rtlfmjs
  - Audio recording and file management
  - Database operations for timeline/search

- **`@app/preload`**: Bridge layer exposing:
  - SDR control APIs to renderer
  - File system operations for recordings
  - Database queries for search/filter

- **`@app/renderer`**: React-based UI for:
  - Frequency tuning controls
  - Scanner configuration
  - Audio playback
  - Timeline visualization
  - Search/filter interface

## Development Workflow

### Initial Setup
```bash
npm run init          # Create and integrate renderer package
npm install           # Install all dependencies
```

### Development
```bash
npm start             # Start dev mode with hot-reload
npm run typecheck     # Type checking across all packages
npm test              # Run E2E tests
```

### Production Build
```bash
npm run build         # Build all packages
npm run compile       # Create distributable executable
```

### Local Development with rtlfmjs

**IMPORTANT: Currently using locally linked rtlfmjs for rapid development**

The project is currently configured to use a local copy of rtlfmjs located at `/Users/work/Projects/rtlfmjs` via npm link. This allows for rapid testing of changes to rtlfmjs without needing to publish or commit changes.

**Current setup:**
```bash
# rtlfmjs is linked via:
cd /Users/work/Projects/rtlfmjs && npm link
cd /Users/work/Projects/sdr-scanner && npm link rtlfmjs
```

**TODO: Before production release or CI/CD setup:**
1. Unlink the local rtlfmjs:
   ```bash
   npm unlink rtlfmjs
   ```
2. Install rtlfmjs from GitHub:
   ```bash
   npm install qualitymanifest/rtlfmjs
   ```
3. Update package.json to specify the appropriate version or commit hash

**To verify current link status:**
```bash
ls -la node_modules/rtlfmjs  # Should show symlink to ../../rtlfmjs
```

## Key Implementation Notes

### SDR Integration
- rtlfmjs runs in the main process (requires Node.js native modules)
- Event-based audio handling:
  ```javascript
  const radio = new SDRRadio();

  radio.on("audioData", ({ left, right, signalLevel, squelched }) => {
    // 1. Always record to WAV file
    recordAudio(left, right);

    // 2. Play through speakers if not muted and signal detected
    if (!appMuted && !squelched) {
      speaker.write(Buffer.from(left.buffer));
    }
  });
  ```
- Audio data flow: SDR device → rtlfmjs event emitter → dual output (file recording + optional speaker playback)
- Preload layer exposes tuning/scanning controls to renderer
- Squelch detection prevents noise from playing through speakers while still recording

### Audio Recording Pattern
- Follow timestampsdr approach for continuous recording
- Timestamp-based file naming for chronological organization
- Metadata storage for frequency, date/time, modulation type

### Transcription Pipeline
- Background process monitors recorded audio files
- Whisper transcription runs asynchronously (CPU/GPU intensive)
- Results stored in searchable database
- Progress updates via IPC to renderer

### Timeline & Search
- **SQLite database** for all metadata and search functionality
- **better-sqlite3** package: Synchronous API, performant, works well with Electron main process
- Database stores:
  - Recording metadata (frequency, timestamp, duration)
  - File path to recording WAV file
  - Transcription text with word-level timestamps
- Efficient queries for:
  - Time range filtering
  - Frequency filtering
  - Full-text search on transcriptions
  - Combined filters
- Database file stored alongside recordings for portability

## Security Considerations

Following Electron security best practices:
- **Context Isolation**: Enabled by default
- **Node Integration**: Disabled in renderer
- **Sandbox**: Renderer process sandboxed
- **IPC**: All Node.js/Electron APIs accessed via preload layer

## Related Projects

- **rtlfmjs**: SDR capture and demodulation (owned/maintained by project owner)
- **timestampsdr**: Reference implementation for recording patterns
- **vite-electron-builder**: Base boilerplate providing secure Electron architecture

## Current Status

Project is at **initial boilerplate stage**:
- Electron structure configured
- TypeScript + React setup complete
- Ready for SDR integration implementation

## Next Steps

1. Integrate rtlfmjs into main process
2. Implement preload API for SDR control
3. Build basic frequency tuning UI
4. Add audio recording functionality
5. Implement scanner with configurable ranges
6. Integrate Whisper transcription
7. Build timeline/database system
8. Create search/filter interface

## Environment Requirements

- **Node.js**: >=23.0.0
- **RTL-SDR device**: USB dongle compatible with rtl-sdr drivers
- **Platform**: macOS, Windows, or Linux

## Testing

- **E2E Tests**: Playwright in [tests/](tests/) directory
- **Unit Tests**: Per-package as needed
- **CI**: GitHub Actions for type checking and builds

## UI Design

### Main Application Layout

The main interface uses a two-column layout with scanner controls on the left and the recording feed on the right.

#### Left Panel - Scanner Controls

**1. Profile Selector (Top)**
- Dropdown list to select scanning profiles (pre-configured frequency lists)
- Gear icon button adjacent to dropdown for profile management
- Clicking gear opens modal/screen for creating and editing profiles

**2. Frequency Display**
- Large black display panel with green monospace text
- Shows current tuned frequency in large digits (e.g., "162.550")
- Channel number displayed to the left of frequency (e.g., "86") when using a profile with associated channel numbers
- **Interactive behavior:**
  - When **not scanning**: User can click to manually enter a frequency
  - When **actively scanning**: Shows "SCAN" text animating from right to left (continuous marquee effect)

**3. Control Buttons**

Primary action buttons (3 large buttons):
- **Scan**: Initiates frequency scanning through the selected profile
- **Hold**: Stops scanning and holds on the current frequency
- **Squelch**: Opens squelch adjustment interface (UI TBD)

Numeric keypad (10 buttons in 3x4 grid):
- Numbers 1-9 arranged in standard phone/calculator layout
- 0 button on bottom row
- Purpose: Alternative to keyboard input for frequency entry
- Design homage to handheld "NASCAR scanner" devices

#### Right Panel - Recording Feed

**Search and Filter (Top)**
- Search text field labeled "Search Feed"
- Filter icon button for additional filtering options

**Feed List**
Scrollable chronological list of recording entries. Each entry shows:
- **Date/Time**: Format "MM/DD/YYYY HH:MM"
- **Frequency**: In MHz (e.g., "162.550")
- **Status**: One of:
  - "Not transcribed" - Recording captured, transcription pending
  - "Transcribing" - Transcription in progress
  - "Transcription failed" - Transcription encountered an error
  - (Transcription text) - Italic Lorem ipsum placeholder in mockup; actual transcribed content in production

**Entry Interaction:**
- Entries are clickable to play back recorded audio
- Transcribed text is searchable via the search field
- Entries can be filtered by frequency, date range, and transcription status

### Design Style

**Color Scheme:**
- Dark gray/charcoal background (#2b2b2b - #3a3a3a)
- Green monochrome display text (#00ff00 or similar)
- Medium gray buttons and panels (#5a5a5a - #6a6a6a)
- White text for feed entries

**Typography:**
- Frequency display: Large digital/seven-segment font (like classic digital clock displays, e.g., "DSEG7" or similar)
- Feed entries: Sans-serif, clean and readable
- Transcription text: Italic for differentiation from metadata

**Layout:**
- Approximately 30/70 split between left control panel and right feed panel
- Generous padding and spacing for touch-friendly interaction
- Rounded corners on buttons and panels

## Resources

- [Electron Documentation](https://www.electronjs.org/docs)
- [Vite Documentation](https://vitejs.dev/)
- [rtlfmjs Repository](https://github.com/qualitymanifest/rtlfmjs)
- [timestampsdr Repository](https://github.com/qualitymanifest/timestampsdr)
- [Whisper Documentation](https://github.com/openai/whisper)
