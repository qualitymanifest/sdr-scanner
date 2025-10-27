import { useState } from 'react';
import './ScannerControls.css';

interface ScannerControlsProps {
  onFrequencyChange?: (frequency: string) => void;
  onScan?: () => void;
  onHold?: () => void;
  onSquelch?: () => void;
}

export function ScannerControls({
  onFrequencyChange,
  onScan,
  onHold,
  onSquelch,
}: ScannerControlsProps) {
  const [selectedProfile, setSelectedProfile] = useState('default');
  const [frequency, setFrequency] = useState('162.550');
  const [channelNumber, setChannelNumber] = useState('86');
  const [isScanning, setIsScanning] = useState(false);
  const [inputBuffer, setInputBuffer] = useState('');

  const handleNumberClick = (num: string) => {
    // Only allow input when not scanning
    if (isScanning) {
      return;
    }

    // Build up the input buffer (max 6 digits)
    const newBuffer = (inputBuffer + num).slice(0, 6);
    setInputBuffer(newBuffer);

    // Format for display (e.g., "162550" -> "162.550")
    if (newBuffer.length > 0) {
      const displayFreq = newBuffer.length >= 3
        ? `${newBuffer.slice(0, 3)}.${newBuffer.slice(3)}`
        : newBuffer;
      setFrequency(displayFreq);
    }

    // If we have 6 digits, automatically switch to that frequency
    if (newBuffer.length === 6) {
      const formattedFreq = `${newBuffer.slice(0, 3)}.${newBuffer.slice(3)}`;
      onFrequencyChange?.(formattedFreq);
      // Clear the input buffer for next entry
      setInputBuffer('');
    }
  };

  const handleScan = () => {
    setIsScanning(true);
    onScan?.();
  };

  const handleHold = () => {
    setIsScanning(false);
    onHold?.();
  };

  return (
    <div className="scanner-controls">
      {/* Profile Selector */}
      <div className="profile-selector">
        <select
          value={selectedProfile}
          onChange={(e) => setSelectedProfile(e.target.value)}
          className="profile-dropdown"
        >
          <option value="default">Profile</option>
          <option value="weather">Weather Radio</option>
          <option value="police">Police</option>
          <option value="aviation">Aviation</option>
        </select>
        <button className="gear-button" aria-label="Manage Profiles">
          ⚙️
        </button>
      </div>

      {/* Frequency Display */}
      <div className="frequency-display">
        <span className="channel-number">{channelNumber}</span>
        <span className="frequency-value">
          {isScanning ? (
            <span className="scan-animation">
              <span className="scan-text">SCAN</span>
              <span className="scan-text">SCAN</span>
            </span>
          ) : (
            frequency
          )}
        </span>
      </div>

      {/* Button Container - Side by Side */}
      <div className="button-container">
        {/* Control Buttons - Left */}
        <div className="control-buttons">
          <button className="primary-button" onClick={handleHold}>
            Hold
          </button>
          <button className="primary-button" onClick={handleScan}>
            Scan
          </button>
          <button className="primary-button" onClick={onSquelch}>
            Squelch
          </button>
        </div>

        {/* Numeric Keypad - Right */}
        <div className="numeric-keypad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              className="keypad-button"
              onClick={() => handleNumberClick(num.toString())}
            >
              {num}
            </button>
          ))}
          <button
            className="keypad-button zero"
            onClick={() => handleNumberClick('0')}
          >
            0
          </button>
        </div>
      </div>
    </div>
  );
}
