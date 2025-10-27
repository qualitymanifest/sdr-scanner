import { useState, useEffect } from 'react';
import './ScannerControls.css';
import { databaseApi, scannerApi, type Profile } from '../utils/preloadApi';

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
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState('');
  const [frequency, setFrequency] = useState('162.550');
  const [channelNumber, setChannelNumber] = useState('86');
  const [isScanning, setIsScanning] = useState(false);
  const [inputBuffer, setInputBuffer] = useState('');

  // Load profiles from database on mount
  useEffect(() => {
    const loadProfiles = async () => {
      try {
        const loadedProfiles = await databaseApi.profiles.getAll();
        setProfiles(loadedProfiles);
        // Select the first profile by default if available
        if (loadedProfiles.length > 0) {
          setSelectedProfile(loadedProfiles[0].Id.toString());
        }
      } catch (error) {
        console.error('Failed to load profiles:', error);
      }
    };

    loadProfiles();
  }, []);

  // Listen for scanner frequency changes
  useEffect(() => {
    const removeFrequencyListener = scannerApi.onFrequencyChange((data) => {
      // Convert Hz to MHz for display (e.g., 162550000 -> "162.550")
      const freqMHz = (data.frequency / 1_000_000).toFixed(3);
      setFrequency(freqMHz);

      // Update channel number
      if (data.channel !== null) {
        setChannelNumber(data.channel.toString());
      } else {
        setChannelNumber('');
      }
    });

    const removeStoppedListener = scannerApi.onStopped(() => {
      setIsScanning(false);
    });

    return () => {
      removeFrequencyListener();
      removeStoppedListener();
    };
  }, []);

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

  const handleScan = async () => {
    // Validate that a profile is selected
    if (!selectedProfile) {
      console.error('No profile selected');
      return;
    }

    const profileId = parseInt(selectedProfile, 10);
    if (isNaN(profileId)) {
      console.error('Invalid profile ID');
      return;
    }

    // Start scanning with the selected profile
    const result = await scannerApi.start(profileId);
    if (result.success) {
      setIsScanning(true);
      onScan?.();
    } else {
      console.error('Failed to start scanning:', result.error);
    }
  };

  const handleHold = async () => {
    // Stop scanning
    const result = await scannerApi.stop();
    if (result.success) {
      setIsScanning(false);
      onHold?.();
    } else {
      console.error('Failed to stop scanning:', result.error);
    }
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
          <option value="">Select Profile</option>
          {profiles.map((profile) => (
            <option key={profile.Id} value={profile.Id.toString()}>
              {profile.Name}
            </option>
          ))}
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
