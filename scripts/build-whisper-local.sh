#!/bin/bash
set -e

# Script to build whisper.cpp binary locally for development
# This builds a universal binary for macOS (both arm64 and x64)

echo "Building whisper.cpp for local development..."

# Check for required dependencies
if [[ "$OSTYPE" == "darwin"* ]]; then
  # Check for cmake
  if ! command -v cmake &> /dev/null; then
    echo "❌ Error: CMake is not installed."
    echo ""
    echo "Please install CMake using Homebrew:"
    echo "  brew install cmake"
    echo ""
    echo "If you don't have Homebrew, install it first:"
    echo "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    exit 1
  fi

  # Check for Xcode Command Line Tools
  if ! xcode-select -p &> /dev/null; then
    echo "❌ Error: Xcode Command Line Tools are not installed."
    echo ""
    echo "Please install them by running:"
    echo "  xcode-select --install"
    exit 1
  fi
fi

# Get the project root BEFORE changing directories (script is in scripts/)
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "Project root: $PROJECT_ROOT"

# Create a temporary directory for the build
TEMP_DIR=$(mktemp -d)
echo "Using temp directory: $TEMP_DIR"

# Clone whisper.cpp
echo "Cloning whisper.cpp..."
git clone https://github.com/ggml-org/whisper.cpp "$TEMP_DIR/whisper.cpp"
cd "$TEMP_DIR/whisper.cpp"

# Build for macOS (Universal binary)
echo "Building whisper.cpp..."
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS - build universal binary
  cmake -B build -DCMAKE_OSX_ARCHITECTURES="arm64;x86_64"
  cmake --build build --config Release

  # Copy binary to resources
  echo "Copying binary to resources/whisper/..."
  mkdir -p "$PROJECT_ROOT/resources/whisper"
  cp build/bin/whisper-cli "$PROJECT_ROOT/resources/whisper/whisper-cli-mac"
  chmod +x "$PROJECT_ROOT/resources/whisper/whisper-cli-mac"

  echo "✅ Binary built and copied to resources/whisper/whisper-cli-mac"
  echo "   Size: $(du -h "$PROJECT_ROOT/resources/whisper/whisper-cli-mac" | cut -f1)"
else
  echo "❌ This script is designed for macOS. For other platforms, see the manual build instructions."
  exit 1
fi

# Clean up
cd -
rm -rf "$TEMP_DIR"

echo ""
echo "✅ Done! You can now run 'npm start' to test transcription in development mode."
echo ""
echo "Note: The whisper model (~142 MB) will download automatically on first transcription."
