# Transcription Setup Guide

This guide explains how to set up the whisper.cpp transcription system for local development.

## Quick Start (macOS)

### 1. Install Dependencies

```bash
# Install Xcode Command Line Tools (if not already installed)
xcode-select --install

# Install CMake
brew install cmake
```

### 2. Build Whisper Binary

```bash
npm run build-whisper
```

This will:
- Clone whisper.cpp from GitHub
- Build a universal binary (works on both Apple Silicon and Intel Macs)
- Place it in `resources/whisper/whisper-cli-mac`
- Clean up temporary files

**Build time:** ~2-5 minutes depending on your machine

### 3. Run Your App

```bash
npm start
```

The whisper model (~142 MB) will download automatically on the first transcription. This only happens once.

## How It Works

### Development Mode

When you run `npm start`, the app looks for binaries in:
```
/Users/work/Projects/sdr-scanner/resources/whisper/whisper-cli-mac
```

### Production Mode

When you build a distributable with `npm run compile`, electron-builder:
1. Copies `resources/whisper/` to the app bundle
2. Places binaries outside the `.asar` archive so they remain executable
3. Includes any models you've pre-downloaded (optional)

## Architecture

```
Recording Complete
       ↓
Delete if too short (< minimumRecordingDuration)
       ↓
Queue for transcription (queueTranscription)
       ↓
TranscriptionService spawns whisper-cli as child process
       ↓
Whisper processes audio file
       ↓
Returns: { text, language, duration }
       ↓
TODO: Store in database
```

## File Locations

### Development
- **Binary**: `resources/whisper/whisper-cli-mac`
- **Models**: `resources/whisper/models/ggml-*.bin`
- **Recordings**: `~/Library/Application Support/sdr-scanner/recordings/`

### Production (after packaging)
- **Binary**: `SDR Scanner.app/Contents/Resources/whisper/whisper-cli-mac`
- **Models**: `SDR Scanner.app/Contents/Resources/whisper/models/ggml-*.bin`
- **Recordings**: `~/Library/Application Support/sdr-scanner/recordings/`

## Whisper Models

The app uses the **base** model by default (~142 MB), which provides a good balance of speed and accuracy.

Available models (from fastest/smallest to slowest/largest):
- `tiny` (39 MB) - Fast but less accurate
- `base` (142 MB) - **Default** - Good balance
- `small` (466 MB) - Better accuracy
- `medium` (1.5 GB) - High accuracy
- `large-v3` (3.1 GB) - Best accuracy

To change the model, edit `DEFAULT_MODEL` in `packages/main/src/modules/TranscriptionService.ts`.

## Troubleshooting

### "Whisper binary not found"

Run `npm run build-whisper` to build the binary.

### "Permission denied" when running whisper

Make the binary executable:
```bash
chmod +x resources/whisper/whisper-cli-mac
```

### Model download fails

The model downloads from HuggingFace. If it fails:
1. Check your internet connection
2. Download manually from: https://huggingface.co/ggerganov/whisper.cpp/tree/main
3. Place in `resources/whisper/models/ggml-base.bin`

### Transcription is slow

The base model is CPU-only. For faster transcription:
- Use the `tiny` model (less accurate but 3-4x faster)
- Build whisper.cpp with GPU acceleration (CoreML on macOS)
- Run on a machine with more CPU cores (whisper uses 4 threads by default)

## CI/CD (GitHub Actions)

For production builds across all platforms:

1. Go to **Actions** → **Build Whisper.cpp Binaries**
2. Click **Run workflow**
3. Wait for builds to complete (~5 minutes)
4. Download artifacts from the release
5. Extract binaries to `resources/whisper/`

The workflow builds:
- `whisper-cli-mac` (Universal: arm64 + x64)
- `whisper-cli-linux-x64`
- `whisper-cli-win-x64.exe`

## Platform-Specific Instructions

### Linux

```bash
# Install build tools
sudo apt-get update
sudo apt-get install -y build-essential cmake

# Clone and build whisper.cpp
git clone https://github.com/ggml-org/whisper.cpp
cd whisper.cpp
make -j
cp main ../sdr-scanner/resources/whisper/whisper-cli-linux-x64
chmod +x ../sdr-scanner/resources/whisper/whisper-cli-linux-x64
```

### Windows

```powershell
# Install CMake and Visual Studio Build Tools first
# Then:

git clone https://github.com/ggml-org/whisper.cpp
cd whisper.cpp
cmake -B build
cmake --build build --config Release
copy build\bin\Release\main.exe ..\sdr-scanner\resources\whisper\whisper-cli-win-x64.exe
```

## Next Steps

After transcription is working, the next features to implement are:
1. **Database integration** - Store transcriptions in SQLite with recording metadata
2. **Feed UI** - Display transcriptions in the right panel
3. **Search** - Full-text search on transcription content
4. **Filters** - Filter by frequency, date, transcription status

See the TODOs in `SDRService.ts` lines 237-242.
