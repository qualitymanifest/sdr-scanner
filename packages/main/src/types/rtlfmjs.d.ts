declare module 'rtlfmjs' {
  interface SDRRadioConfig {
    sampleRate?: number;
    bufsPerSec?: number;
    audioSampleRate?: number;
    initialCenterFrequency?: number;
    initialOffset?: number;
    initialDemodulation?: {
      modulation: string;
      maxF?: number;
    };
    squelchThreshold?: number;
  }

  interface AudioDataEvent {
    left: Buffer;  // Int16LE Buffer
    right: Buffer; // Int16LE Buffer
    signalLevel: number;
    squelched: boolean;
  }

  class SDRRadio {
    constructor(config?: SDRRadioConfig);

    squelchThreshold: number;

    start(): Promise<void>;
    stop(): Promise<void>;
    setFrequency(center: number, offset?: number): Promise<void>;
    setDemodulationType(type: string, options?: Record<string, any>): void;

    on(event: 'audioData', callback: (data: AudioDataEvent) => void): void;
    on(event: 'error', callback: (error: Error) => void): void;
  }

  export = SDRRadio;
}
