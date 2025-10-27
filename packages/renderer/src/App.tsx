import './App.css'
import { ScannerControls } from './components/ScannerControls'
import { RecordingFeed } from './components/RecordingFeed'
import { sdrApi } from './utils/preloadApi'
import { AudioPlayer } from './utils/audioPlayer'
import { useEffect, useState, useRef } from 'react'

function App() {
  const [isSDRRunning, setIsSDRRunning] = useState(false)
  const [currentFrequency, setCurrentFrequency] = useState<number | null>(null)
  const [signalLevel, setSignalLevel] = useState(0)
  const [isSquelched, setIsSquelched] = useState(false)
  const audioPlayerRef = useRef<AudioPlayer | null>(null)

  useEffect(() => {
    // Initialize audio player
    audioPlayerRef.current = new AudioPlayer()

    // Start SDR on mount
    const startSDR = async () => {
      const result = await sdrApi.start({
        sampleRate: 1_600_000,
        bufsPerSec: 10,
      })
      if (result.success) {
        setIsSDRRunning(true)
        handleFrequencyChange("162.550")
        console.log('SDR started successfully')
      } else {
        console.error('Failed to start SDR:', result.error)
      }
    }

    startSDR()

    // Set up audio data listener
    const removeAudioListener = sdrApi.onAudioData((data) => {
      setSignalLevel(data.signalLevel)
      setIsSquelched(data.squelched)

      console.log(audioPlayerRef.current, data)
      // Play audio through speakers
      if (audioPlayerRef.current) {
        audioPlayerRef.current.play(data.left, data.squelched)
      }

      // TODO: Handle audio recording
    })

    // Set up error listener
    const removeErrorListener = sdrApi.onError((error) => {
      console.error('SDR error:', error.message)
    })

    // Clean up on unmount
    return () => {
      removeAudioListener()
      removeErrorListener()
      sdrApi.stop()

      // Dispose audio player
      if (audioPlayerRef.current) {
        audioPlayerRef.current.dispose()
      }
    }
  }, [])

  const handleFrequencyChange = async (frequency: string) => {
    console.log('changing freq')
    const freqInHz = Number(frequency.replace(/\D/g, '')) * 1000
    const result = await sdrApi.setFrequency(freqInHz)
    if (result.success) {
      setCurrentFrequency(freqInHz)
    } else {
      console.error('Failed to set frequency:', result.error)
    }
  }

  const handleScan = () => {
    console.log('Scan started')
    // TODO: Implement scanning logic
  }

  const handleHold = () => {
    console.log('Scan held')
    // TODO: Implement hold logic
  }

  const handleSquelch = () => {
    console.log('Squelch adjustment')
    // TODO: Implement squelch adjustment UI
  }

  return (
    <div className="app-container">
      <div className="left-panel">
        <ScannerControls
          onFrequencyChange={handleFrequencyChange}
          onScan={handleScan}
          onHold={handleHold}
          onSquelch={handleSquelch}
        />
      </div>
      <div className="right-panel">
        <RecordingFeed />
      </div>
    </div>
  )
}

export default App
