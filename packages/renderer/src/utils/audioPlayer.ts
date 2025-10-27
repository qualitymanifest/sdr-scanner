/**
 * Audio Player utility for real-time SDR audio playback
 * Uses Web Audio API for low-latency audio streaming
 */

export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private isMuted: boolean = false;
  private isInitialized: boolean = false;

  constructor() {
    this.init();
  }

  private init() {
    try {
      // Create audio context with optimal sample rate for SDR
      this.audioContext = new AudioContext({ sampleRate: 48000 });

      // Create gain node for volume control and muting
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);

      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize audio player:', error);
    }
  }

  /**
   * Play audio data through the speakers
   * @param audioData - Byte array from Int16LE Buffer (from rtlfmjs via IPC)
   * @param squelched - Whether the signal is squelched
   */
  play(audioData: number[], squelched: boolean) {
    if (!this.isInitialized || !this.audioContext || !this.gainNode) {
      return;
    }

    // Don't play if muted or squelched
    if (this.isMuted || squelched) {
      return;
    }

    // Resume audio context if it's suspended (browser autoplay policy)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    try {
      // Convert byte array (Int16LE buffer) to Float32 for Web Audio API
      const float32Data = this.bufferBytesToFloat32(audioData);

      // Create audio buffer
      const buffer = this.audioContext.createBuffer(
        1, // mono
        float32Data.length,
        this.audioContext.sampleRate
      );

      // Copy data to buffer
      buffer.copyToChannel(float32Data, 0);

      // Create buffer source
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gainNode);

      // Play immediately
      source.start();
    } catch (error) {
      console.error('Error playing audio:', error);
    }
  }

  /**
   * Convert byte array (from Int16LE Buffer) to Float32 for Web Audio API
   * The input is bytes from an Int16LE buffer, so we need to read 2 bytes at a time
   */
  private bufferBytesToFloat32(bytes: number[]): Float32Array {
    const numSamples = bytes.length / 2; // 2 bytes per Int16 sample
    const float32 = new Float32Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
      const byteIndex = i * 2;
      // Read Int16LE: little-endian means low byte first
      const low = bytes[byteIndex];
      const high = bytes[byteIndex + 1];

      // Combine bytes into Int16
      let int16 = (high << 8) | low;

      // Convert from unsigned to signed if needed
      if (int16 >= 0x8000) {
        int16 -= 0x10000;
      }

      // Convert to Float32 range (-1.0 to 1.0)
      float32[i] = int16 / 32768.0;
    }

    return float32;
  }

  /**
   * Set mute state
   */
  setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.gainNode) {
      // Fade in/out to avoid clicks
      const now = this.audioContext?.currentTime ?? 0;
      this.gainNode.gain.setTargetAtTime(muted ? 0 : 1, now, 0.01);
    }
  }

  /**
   * Get mute state
   */
  isMutedState(): boolean {
    return this.isMuted;
  }

  /**
   * Set volume (0.0 to 1.0)
   */
  setVolume(volume: number) {
    if (this.gainNode && this.audioContext) {
      const clampedVolume = Math.max(0, Math.min(1, volume));
      const now = this.audioContext.currentTime;
      this.gainNode.gain.setTargetAtTime(clampedVolume, now, 0.01);
    }
  }

  /**
   * Clean up resources
   */
  dispose() {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.gainNode = null;
    this.isInitialized = false;
  }
}
