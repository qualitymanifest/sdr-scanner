import './App.css'
import { ScannerControls } from './components/ScannerControls'
import { RecordingFeed } from './components/RecordingFeed'

function App() {
  const handleFrequencyChange = (frequency: string) => {
    console.log('Frequency changed:', frequency)
  }

  const handleScan = () => {
    console.log('Scan started')
  }

  const handleHold = () => {
    console.log('Scan held')
  }

  const handleSquelch = () => {
    console.log('Squelch adjustment')
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
