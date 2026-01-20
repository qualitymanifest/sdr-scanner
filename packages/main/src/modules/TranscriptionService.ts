import type {AppModule} from '../AppModule.js';
import {spawn} from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import {app} from 'electron';
import https from 'node:https';
import {createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';

/**
 * TranscriptionService Module
 *
 * Manages transcription of audio recordings using whisper.cpp.
 * Handles model downloading, binary selection, and transcription queue.
 */

interface TranscriptionJob {
  filePath: string;
  resolve: (result: TranscriptionResult) => void;
  reject: (error: Error) => void;
}

interface TranscriptionResult {
  text: string;
  language: string;
  duration: number;
}

// Configuration
const DEFAULT_MODEL = 'ggml-base.bin';
const MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${DEFAULT_MODEL}`;

// Queue and state
const transcriptionQueue: TranscriptionJob[] = [];
let isProcessing = false;
let isModelDownloaded = false;

/**
 * Get the path to the whisper resources directory
 */
function getWhisperResourcesPath(): string {
  if (app.isPackaged) {
    // In production, resources are in app.getAppPath()/resources/whisper
    return path.join(process.resourcesPath, 'whisper');
  } else {
    // In development, resources are in project root
    return path.join(app.getAppPath(), 'resources', 'whisper');
  }
}

/**
 * Get the path to the appropriate whisper binary for this platform
 */
function getWhisperBinaryPath(): string {
  const resourcesPath = getWhisperResourcesPath();
  const platform = process.platform;
  const arch = process.arch;

  let binaryName: string;

  if (platform === 'darwin') {
    // macOS - use universal binary
    binaryName = 'whisper-cli-mac';
  } else if (platform === 'win32') {
    binaryName = 'whisper-cli-win-x64.exe';
  } else if (platform === 'linux') {
    binaryName = 'whisper-cli-linux-x64';
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const binaryPath = path.join(resourcesPath, binaryName);

  // Verify binary exists
  if (!fs.existsSync(binaryPath)) {
    throw new Error(
      `Whisper binary not found at ${binaryPath}. Please run the GitHub Actions workflow to build binaries.`,
    );
  }

  return binaryPath;
}

/**
 * Get the path to the whisper model
 */
function getModelPath(): string {
  const resourcesPath = getWhisperResourcesPath();
  return path.join(resourcesPath, 'models', DEFAULT_MODEL);
}

/**
 * Download the whisper model if it doesn't exist
 */
async function ensureModelDownloaded(): Promise<void> {
  if (isModelDownloaded) {
    return;
  }

  const modelPath = getModelPath();

  // Check if model already exists
  if (fs.existsSync(modelPath)) {
    console.log(`Model already exists at ${modelPath}`);
    isModelDownloaded = true;
    return;
  }

  console.log(`Downloading whisper model from ${MODEL_URL}...`);
  console.log(`This may take a few minutes (${DEFAULT_MODEL} is ~142 MB)`);

  // Ensure models directory exists
  const modelsDir = path.dirname(modelPath);
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, {recursive: true});
  }

  // Download the model
  return new Promise((resolve, reject) => {
    https
      .get(MODEL_URL, response => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Follow redirect
          const redirectUrl = response.headers.location;
          if (!redirectUrl) {
            reject(new Error('Redirect without location header'));
            return;
          }

          https
            .get(redirectUrl, redirectResponse => {
              if (redirectResponse.statusCode !== 200) {
                reject(new Error(`Download failed with status ${redirectResponse.statusCode}`));
                return;
              }

              const fileStream = createWriteStream(modelPath);
              const totalBytes = parseInt(redirectResponse.headers['content-length'] || '0', 10);
              let downloadedBytes = 0;
              let lastLoggedPercent = 0;

              redirectResponse.on('data', chunk => {
                downloadedBytes += chunk.length;
                const percent = Math.floor((downloadedBytes / totalBytes) * 100);

                // Log progress every 10%
                if (percent >= lastLoggedPercent + 10) {
                  console.log(`Download progress: ${percent}% (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB)`);
                  lastLoggedPercent = percent;
                }
              });

              pipeline(redirectResponse, fileStream)
                .then(() => {
                  console.log(`Model downloaded successfully to ${modelPath}`);
                  isModelDownloaded = true;
                  resolve();
                })
                .catch(reject);
            })
            .on('error', reject);
        } else if (response.statusCode === 200) {
          const fileStream = createWriteStream(modelPath);
          const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
          let downloadedBytes = 0;
          let lastLoggedPercent = 0;

          response.on('data', chunk => {
            downloadedBytes += chunk.length;
            const percent = Math.floor((downloadedBytes / totalBytes) * 100);

            if (percent >= lastLoggedPercent + 10) {
              console.log(`Download progress: ${percent}% (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB)`);
              lastLoggedPercent = percent;
            }
          });

          pipeline(response, fileStream)
            .then(() => {
              console.log(`Model downloaded successfully to ${modelPath}`);
              isModelDownloaded = true;
              resolve();
            })
            .catch(reject);
        } else {
          reject(new Error(`Download failed with status ${response.statusCode}`));
        }
      })
      .on('error', reject);
  });
}

/**
 * Transcribe an audio file using whisper.cpp
 */
async function transcribeFile(filePath: string): Promise<TranscriptionResult> {
  // Ensure model is downloaded
  await ensureModelDownloaded();

  const binaryPath = getWhisperBinaryPath();
  const modelPath = getModelPath();

  console.log(`Transcribing: ${filePath}`);

  return new Promise((resolve, reject) => {
    const args = [
      '-m',
      modelPath, // Model path
      '-f',
      filePath, // Input file
      '--output-txt', // Output as text
      '--output-file',
      filePath, // Output file prefix (will create filePath.txt)
      '--threads',
      '4', // Use 4 threads
      '--language',
      'en', // Assume English (can be made configurable)
    ];

    const whisper = spawn(binaryPath, args);

    let stdout = '';
    let stderr = '';

    whisper.stdout.on('data', data => {
      stdout += data.toString();
    });

    whisper.stderr.on('data', data => {
      stderr += data.toString();
      // Whisper outputs progress to stderr
      const progressMatch = data.toString().match(/progress\s+=\s+(\d+)%/);
      if (progressMatch) {
        const progress = parseInt(progressMatch[1], 10);
        if (progress % 25 === 0) {
          console.log(`Transcription progress: ${progress}%`);
        }
      }
    });

    whisper.on('close', code => {
      if (code !== 0) {
        reject(new Error(`Whisper process exited with code ${code}\n${stderr}`));
        return;
      }

      // Read the generated .txt file
      const txtFilePath = `${filePath}.txt`;

      if (!fs.existsSync(txtFilePath)) {
        reject(new Error(`Transcription file not created: ${txtFilePath}`));
        return;
      }

      const transcriptionText = fs.readFileSync(txtFilePath, 'utf-8').trim();

      // Clean up the .txt file
      fs.unlinkSync(txtFilePath);

      // Parse language from stderr (whisper logs "detected language: en")
      const languageMatch = stderr.match(/detected language:\s+(\w+)/);
      const language = languageMatch ? languageMatch[1] : 'unknown';

      // Parse duration from stderr
      const durationMatch = stderr.match(/total audio length:\s+([\d.]+)s/);
      const duration = durationMatch ? parseFloat(durationMatch[1]) : 0;

      resolve({
        text: transcriptionText,
        language,
        duration,
      });
    });

    whisper.on('error', error => {
      reject(new Error(`Failed to spawn whisper process: ${error.message}`));
    });
  });
}

/**
 * Process the next job in the queue
 */
async function processQueue(): Promise<void> {
  if (isProcessing || transcriptionQueue.length === 0) {
    return;
  }

  isProcessing = true;
  const job = transcriptionQueue.shift()!;

  try {
    const result = await transcribeFile(job.filePath);
    job.resolve(result);
  } catch (error) {
    job.reject(error as Error);
  } finally {
    isProcessing = false;
    // Process next job
    processQueue();
  }
}

/**
 * Queue a transcription job
 */
export function queueTranscription(filePath: string): Promise<TranscriptionResult> {
  return new Promise((resolve, reject) => {
    const job: TranscriptionJob = {
      filePath,
      resolve,
      reject,
    };

    transcriptionQueue.push(job);
    console.log(`Queued transcription for ${filePath} (queue size: ${transcriptionQueue.length})`);

    // Start processing if not already processing
    processQueue();
  });
}

/**
 * Get the current queue size
 */
export function getQueueSize(): number {
  return transcriptionQueue.length;
}

/**
 * Check if the service is currently processing
 */
export function isTranscribing(): boolean {
  return isProcessing;
}

/**
 * Initialize the transcription service
 */
async function initialize(): Promise<void> {
  console.log('Initializing TranscriptionService...');

  try {
    // Verify binary exists
    const binaryPath = getWhisperBinaryPath();
    console.log(`Whisper binary: ${binaryPath}`);

    // Ensure binary is executable on Unix systems
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(binaryPath, 0o755);
      } catch (error) {
        console.warn(`Could not set executable permissions on ${binaryPath}:`, error);
      }
    }

    // Start model download in background (don't await)
    ensureModelDownloaded().catch(error => {
      console.error('Failed to download whisper model:', error);
    });

    console.log('TranscriptionService initialized');
  } catch (error) {
    console.error('Failed to initialize TranscriptionService:', error);
    throw error;
  }
}

/**
 * Create the TranscriptionService module for app initialization
 */
export function createTranscriptionService(): AppModule {
  return {
    enable() {
      // Initialize the service asynchronously
      initialize().catch(error => {
        console.error('Failed to initialize TranscriptionService:', error);
      });
    },
  };
}
