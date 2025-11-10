import './App.css'
import { ScannerControls } from './components/ScannerControls'
import { RecordingFeed } from './components/RecordingFeed'
import { sdrApi } from './utils/preloadApi'
import { useEffect, useState } from 'react'

function App() {
  const [isSDRRunning, setIsSDRRunning] = useState(false)
  const [currentFrequency, setCurrentFrequency] = useState<number | null>(null)
  const [signalLevel, setSignalLevel] = useState(0)
  const [isSquelched, setIsSquelched] = useState(false)

  useEffect(() => {

    // Start SDR on mount
    const startSDR = async () => {
      const result = await sdrApi.start({
        sampleRate: 2_048_000,
        bufsPerSec: 20,
      })
      if (result.success) {
        setIsSDRRunning(true)
        //handleFrequencyChange("162.550")
        handleFrequencyChange("160.860");
        console.log('SDR started successfully')
      } else {
        console.error('Failed to start SDR:', result.error)
      }
    }

    startSDR()

    // Set up audio data listener for signal level updates
    const removeAudioListener = sdrApi.onAudioData((data) => {
      setSignalLevel(data.signalLevel)
      setIsSquelched(data.squelched)
      // Audio playback is now handled in the main process for better performance
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

  const handleSquelch = () => {
    console.log('Squelch adjustment')
    // TODO: Implement squelch adjustment UI
  }

  return (
    <div className="app-container">
      <div className="left-panel">
        <ScannerControls
          onFrequencyChange={handleFrequencyChange}
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
