# Whisper.cpp Binaries and Models

This directory contains the whisper.cpp binaries and models bundled with the application.

## Structure

```
whisper/
├── whisper-cli-mac-arm64      # macOS Apple Silicon binary
├── whisper-cli-mac-x64        # macOS Intel binary
├── whisper-cli-win-x64.exe    # Windows x64 binary
├── whisper-cli-linux-x64      # Linux x64 binary
└── models/
    └── ggml-*.bin             # Whisper models (downloaded on first run or bundled)
```

## Binaries

The binaries are built from [whisper.cpp](https://github.com/ggml-org/whisper.cpp).

### For Local Development

To build the whisper.cpp binary for your local machine:

```bash
npm run build-whisper
```

This will:
1. Clone whisper.cpp to a temporary directory
2. Build a universal binary (arm64 + x64 for macOS)
3. Copy it to `resources/whisper/whisper-cli-mac`
4. Clean up temporary files

**Requirements:**
- macOS: Xcode Command Line Tools (`xcode-select --install`)
- CMake (`brew install cmake`)

### For Production (CI/CD)

To update binaries for all platforms:
1. Run the GitHub Actions workflow: `.github/workflows/build-whisper.yml`
2. Download the artifacts from the release
3. Replace the binaries in this directory
4. Ensure they are executable: `chmod +x whisper-cli-*`

## Models

Whisper models are downloaded from the official whisper.cpp repository:
https://huggingface.co/ggerganov/whisper.cpp/tree/main

Available models (smallest to largest):
- `ggml-tiny.bin` (~75 MB) - Fastest, least accurate
- `ggml-base.bin` (~142 MB) - **Default** - Good balance
- `ggml-small.bin` (~466 MB) - Better accuracy
- `ggml-medium.bin` (~1.5 GB) - High accuracy
- `ggml-large-v3.bin` (~3.1 GB) - Best accuracy

The application will download the base model on first run if not present.

## Building Binaries Manually

If you need to build manually:

### macOS
```bash
git clone https://github.com/ggml-org/whisper.cpp
cd whisper.cpp
make clean
make -j
cp main ../sdr-scanner/resources/whisper/whisper-cli-mac-$(uname -m)
chmod +x ../sdr-scanner/resources/whisper/whisper-cli-mac-$(uname -m)
```

### Linux
```bash
git clone https://github.com/ggml-org/whisper.cpp
cd whisper.cpp
make clean
make -j
cp main ../sdr-scanner/resources/whisper/whisper-cli-linux-x64
chmod +x ../sdr-scanner/resources/whisper/whisper-cli-linux-x64
```

### Windows
```powershell
git clone https://github.com/ggml-org/whisper.cpp
cd whisper.cpp
cmake -B build
cmake --build build --config Release
copy build\bin\Release\main.exe ..\sdr-scanner\resources\whisper\whisper-cli-win-x64.exe
```
