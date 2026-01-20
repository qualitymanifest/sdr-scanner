# Recording Feature Implementation

## Overview

This feature implements audio recording functionality for the SDR scanner. When recording is enabled, audio transmissions are captured to WAV files with specific naming conventions and lifecycle management.

## Architecture

Recording logic is implemented in the main process ([packages/main/src/modules/SDRService.ts](packages/main/src/modules/SDRService.ts)) and follows the pattern used in the [timestampsdr](https://github.com/qualitymanifest/timestampsdr) repository.

## Dependencies

- **node-wav**: Used to write PCM audio data to WAV files
  - Install: `npm install node-wav`
  - Types: `npm install -D @types/node-wav`

## File Naming Convention

Files are named using the pattern: `frequency_datetime.wav`

**Format**: `{freq}_{MM}-{DD}-{YYYY}-{HH}-{mm}.wav`

**Examples**:
- Frequency 161.175 MHz on January 20, 2025 at 6:19 AM:
  - `161-175_01-20-2025-06-19.wav`
- Frequency 162.550 MHz on December 31, 2024 at 11:45 PM:
  - `162-550_12-31-2024-23-45.wav`

**Implementation Details**:
- Frequency is formatted with hyphen instead of decimal point (e.g., `161-175` for 161.175 MHz)
- **Underscore separates frequency from date** (e.g., `161-175_01-20-2025...`)
- Date/time components are zero-padded (e.g., `01` not `1`)
- Time is in 24-hour format

## User Interface

### Record Button

A "Record" start/stop toggle button is added to the scanner controls, positioned underneath the "Squelch" button in the left panel.

**Button States**:
- **Not Recording**: Button shows "Record" text, standard styling
- **Recording**: Button shows "Stop" or "Recording" text with visual indicator (e.g., red color or pulsing animation)

## Recording State Machine

### Recording Lifecycle

Recording is controlled by two primary factors:
1. **Recording enabled state**: User has clicked the "Record" button
2. **Active transmission state**: Audio signal is present (not squelched)

### File Creation and Writing

**When recording is enabled AND an active transmission is received**:

1. **If a recording file is already open**:
   - Continue writing audio data to the existing file
   - Reset the appropriate timeout timer (see "File Finalization" below)

2. **If no recording file is open**:
   - Create a new WAV file with the current frequency and timestamp
   - Begin writing audio data to this file
   - Start the appropriate timeout timer

**When recording is enabled but transmission is squelched**:
- Do NOT write audio data (skip squelched/silent audio)
- Timeout timers continue running

**When recording is disabled**:
- Finalize any open recording file
- Do not create new files or write data

### File Finalization

A recording file is considered "done" and should be finalized when:

#### Scenario 1: Scanning Mode (isScanning = true, not manually held)

**Trigger**: The `unsquelchTimer` timeout elapses
- This timer is managed by the Scanner module ([packages/main/src/modules/Scanner.ts](packages/main/src/modules/Scanner.ts))
- Duration: Configured via Settings (`unsquelchWaitTime`, default 2 seconds)
- Behavior: When squelch is released, the scanner waits this duration before moving to the next frequency
- Recording ends when this timer expires (scanner moves to next frequency)

#### Scenario 2: Manual Hold Mode (not scanning, held on a single frequency)

**Trigger**: The `recordingTimeout` timer elapses
- This is a NEW timer specific to recording (does not exist yet - needs implementation)
- Duration: Configured via Settings (`recordingTimeout`, default 2 seconds - already defined in Settings.ts)
- Behavior:
  - Timer starts when audio data is first written to the file
  - Timer resets each time NEW audio data is written (active transmission continues)
  - If no new audio arrives before timer expires, recording is finalized
  - This prevents infinitely long recordings on a single frequency

#### Scenario 3: Frequency Change During Manual Hold

**Trigger**: User changes frequency while in manual hold mode
- Occurs when user clicks "Scan" button (switches to scanning mode)
- Occurs when user enters a different frequency manually
- Occurs when user uses "Hold" button to move to next frequency in profile
- Current recording must be finalized BEFORE the frequency change occurs

### Post-Recording Processing

When a recording is finalized (for any reason):
1. Close the WAV file writer
2. Call `doneRecording(filePath)` function with the path to the completed file
3. Reset recording state (clear current file reference, stop timers)

**`doneRecording` Function**:
- Initially implemented as a stub (placeholder)
- Will eventually trigger transcription pipeline
- May perform file validation, metadata extraction, database insertion

## Implementation Order

The recommended order of operations for implementing this feature:

1. **Install node-wav dependency** (quick, no dependencies)
   - Get the package installed first

2. **Implement core recording logic in SDRService.ts** (main process)
   - All the recording state, file creation, WAV writing logic
   - IPC handlers for start/stop recording
   - recordingTimeout timer for manual hold mode
   - This is the most complex part and should be done first
   - We can test this works before touching the UI

3. **Add recording IPC APIs to preload layer**
   - Bridge the IPC handlers to the renderer
   - Simple pass-through, depends on step 2

4. **Add Record button and UI to ScannerControls.tsx**
   - UI controls to toggle recording on/off
   - Depends on steps 2 & 3
   - Gives us a working end-to-end feature

5. **Integrate with Scanner module** (optional for initial testing)
   - Hook up the Scanner's unsquelchTimer to finalize recordings in scan mode
   - This is the last piece for full scan mode support
   - We can test manual hold mode first without this

This order allows us to:
- Build from the core outward
- Test recording in manual hold mode first (simpler)
- Add scan mode integration last (more complex coordination)

## Implementation Checklist

### Main Process (SDRService.ts)

- [ ] Install `node-wav` and types
- [ ] Import WAV file writer
- [ ] Add recording state variables:
  - [ ] `isRecordingEnabled`: boolean (user toggle)
  - [ ] `currentRecordingFile`: WAV writer instance or null
  - [ ] `currentRecordingPath`: string or null
  - [ ] `recordingTimeoutTimer`: NodeJS.Timeout or null
- [ ] Implement `createRecordingFileName()` helper function
  - [ ] Format frequency (replace `.` with `-`)
  - [ ] Format datetime with zero-padding
  - [ ] Return full filename string
- [ ] Implement `startRecording()` function
  - [ ] Create recordings directory if it doesn't exist
  - [ ] Generate filename using current frequency and timestamp
  - [ ] Initialize WAV file writer
  - [ ] Store file reference and path
- [ ] Implement `writeAudioToRecording()` function
  - [ ] Write audio buffer to current file
  - [ ] Reset `recordingTimeoutTimer` (for manual hold mode)
- [ ] Implement `finalizeRecording()` function
  - [ ] Close WAV file writer
  - [ ] Call `doneRecording(filePath)`
  - [ ] Clear recording state variables
  - [ ] Clear any active recording timers
- [ ] Implement `doneRecording(filePath)` stub function
  - [ ] Log completion for now
  - [ ] TODO: Hook up to transcription pipeline later
- [ ] Update `audioData` event handler:
  - [ ] Check if recording is enabled
  - [ ] If enabled and not squelched:
    - [ ] If no current file, call `startRecording()`
    - [ ] Call `writeAudioToRecording(audioBuffer)`
  - [ ] If squelched, let timers continue (don't write data)
- [ ] Add IPC handlers:
  - [ ] `sdr:startRecording` - Enable recording
  - [ ] `sdr:stopRecording` - Disable recording, finalize current file
  - [ ] `sdr:getRecordingStatus` - Return recording state
- [ ] Handle frequency changes:
  - [ ] In `sdr:setFrequency` handler, finalize current recording before changing frequency
- [ ] Implement `recordingTimeoutTimer` logic:
  - [ ] Start timer when writing audio in manual hold mode
  - [ ] Clear and restart timer on each audio write
  - [ ] On timeout expiry, call `finalizeRecording()`
- [ ] Integrate with Scanner module:
  - [ ] When scanner's `unsquelchTimer` expires (scanning mode), call `finalizeRecording()`
  - [ ] Ensure recording finalization happens before moving to next frequency

### Preload (preloadApi.ts)

- [ ] Add `sdr:startRecording` IPC invoke
- [ ] Add `sdr:stopRecording` IPC invoke
- [ ] Add `sdr:getRecordingStatus` IPC invoke
- [ ] Export types and API methods for renderer

### Renderer (ScannerControls.tsx)

- [ ] Add "Record" button to UI (below Squelch button)
- [ ] Add `isRecording` state variable
- [ ] Add click handler for Record button:
  - [ ] Toggle recording state
  - [ ] Call appropriate IPC method (start/stop recording)
- [ ] Style recording button:
  - [ ] Add visual indicator when recording (red color, pulsing, etc.)
  - [ ] Update button text based on state

## Settings Integration

Recording uses the following settings (already defined in [packages/main/src/modules/Settings.ts](packages/main/src/modules/Settings.ts)):

- **`recordingTimeout`**: Time to wait (in manual hold mode) after last audio before finalizing recording
  - Default: 2000 ms (2 seconds)
  - Configurable via Settings UI

Note: `unsquelchWaitTime` is used by the Scanner module and indirectly affects recording finalization in scanning mode.

## File Storage

**Directory Structure**:
```
[User Data Directory]/
  recordings/
    161-175_01-20-2025-06-19.wav
    162-550_01-20-2025-06-21.wav
    ...
```

**Storage Location**:
- Use Electron's `app.getPath('userData')` to get base directory
- Create `recordings/` subdirectory within user data folder
- This ensures recordings are stored in a persistent, user-specific location

## Audio Format

WAV files are written with the following specifications (matching rtlfmjs output):
- **Sample Rate**: 48,000 Hz
- **Channels**: 1 (mono)
- **Bit Depth**: 16-bit signed PCM
- **Endianness**: Little-endian

These match the Speaker configuration in SDRService.ts to ensure compatibility.

## Error Handling

- **File write errors**: Log error, finalize current recording, notify user via IPC
- **Directory creation errors**: Log error, disable recording, notify user
- **Invalid frequency/timestamp**: Use fallback values, log warning
- **Recording during frequency change**: Ensure recording is finalized before frequency changes to prevent data corruption

## Future Enhancements

- **Minimum recording duration**: Don't save files shorter than `minimumRecordingDuration` setting (already defined, not yet used)
- **Disk space monitoring**: Warn user when storage is low
- **Recording compression**: Optionally compress older recordings
- **Metadata file**: Store JSON sidecar files with recording metadata
- **Transcription integration**: Auto-trigger transcription on `doneRecording()`

## References

- **timestampsdr**: [https://github.com/qualitymanifest/timestampsdr](https://github.com/qualitymanifest/timestampsdr)
  - Reference implementation for recording patterns
  - Similar timeout and file management logic
- **node-wav**: [https://www.npmjs.com/package/node-wav](https://www.npmjs.com/package/node-wav)
  - WAV file writing library
- **rtlfmjs**: Local linked dependency at `/Users/work/Projects/rtlfmjs`
  - Audio data source (48kHz mono signed 16-bit PCM)
