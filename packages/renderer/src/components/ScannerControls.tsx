import { useState, useEffect } from 'react';
import './ScannerControls.css';
import { databaseApi, scannerApi, type Profile } from '../utils/preloadApi';
import { ProfileModal } from './ProfileModal';
import { SettingsModal } from './SettingsModal';

interface ScannerControlsProps {
  onFrequencyChange?: (frequency: string) => void;
  onSquelch?: () => void;
}

export function ScannerControls({
  onFrequencyChange,
  onSquelch,
}: ScannerControlsProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState('');
  const [frequency, setFrequency] = useState('162.550');
  const [channelNumber, setChannelNumber] = useState('86');
  const [isScanning, setIsScanning] = useState(false);
  const [isPausedOnSignal, setIsPausedOnSignal] = useState(false);
  const [inputBuffer, setInputBuffer] = useState('');
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [isCreatingNewProfile, setIsCreatingNewProfile] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Load profiles from database on mount
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

  useEffect(() => {
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

      // Update paused state based on whether we've received an active signal
      setIsPausedOnSignal(data.hasReceivedActiveSignal);
    });

    const removeStoppedListener = scannerApi.onStopped(() => {
      setIsScanning(false);
      setIsPausedOnSignal(false);
    });

    return () => {
      removeFrequencyListener();
      removeStoppedListener();
    };
  }, []);

  const handleNumberClick = (num: string) => {
    // Only allow input when not scanning
    if (isScanning) {
      // Todo: We should probably display "ERR" or something where it normally shows the frequency or "SCAN SCAN..." text
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
    // Clear any partial input buffer when starting scan
    setInputBuffer('');

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
    } else {
      console.error('Failed to start scanning:', result.error);
    }
  };

  const handleHold = async () => {
    if (isScanning) {
      // If currently scanning, stop the scan
      const result = await scannerApi.stop();
      if (result.success) {
        setIsScanning(false);
      } else {
        console.error('Failed to stop scanning:', result.error);
      }
    } else {
      // If not scanning and there's partial input, check if it's a channel number
      if (inputBuffer.length > 0) {
        const channelNumber = parseInt(inputBuffer, 10);

        // Try to find frequency by channel number
        const result = await scannerApi.findFrequencyByChannel(channelNumber);

        if (result.success && result.frequencyHz) {
          // Found a matching channel, set to that frequency
          await scannerApi.setFrequency(result.frequencyHz);
        }

        // Clear the input buffer whether we found a match or not
        setInputBuffer('');
      } else {
        // No input buffer, try to move to the next frequency in the profile
        const result = await scannerApi.moveToNext();
        if (!result.success) {
          // Silently ignore if we can't move (e.g., not on a profile frequency)
          console.log('Cannot move to next frequency:', result.error);
        }
      }
    }
  };

  return (
    <>
      <div className="scanner-controls">
        {/* Profile Selector */}
        <div className="profile-selector">
        <select
          value={selectedProfile}
          onChange={(e) => {
            const value = e.target.value;
            if (value === 'NEW_PROFILE') {
              setIsCreatingNewProfile(true);
              setIsEditProfileModalOpen(true);
            } else {
              setSelectedProfile(value);
            }
          }}
          className="profile-dropdown"
        >
          <option value="">Select Profile</option>
          {profiles.map((profile) => (
            <option key={profile.Id} value={profile.Id.toString()}>
              {profile.Name}
            </option>
          ))}
          <option value="NEW_PROFILE">+ New Profile</option>
        </select>
        <button
          className="gear-button"
          aria-label="Edit Profile"
          onClick={() => setIsEditProfileModalOpen(true)}
        >
          ☰
        </button>
        <button
          className="gear-button"
          aria-label="Settings"
          onClick={() => setIsSettingsOpen(true)}
        >
          ⚙️
        </button>
      </div>

      {/* Frequency Display */}
      <div className="frequency-display">
        <span className="channel-number">{channelNumber}</span>
        <span className="frequency-value">
          {isScanning && !isPausedOnSignal ? (
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

      {/* Profile Management Modal */}
      <ProfileModal
        isOpen={isEditProfileModalOpen}
        onClose={() => {
          setIsEditProfileModalOpen(false);
          setIsCreatingNewProfile(false);
        }}
        profileId={isCreatingNewProfile ? null : (selectedProfile ? parseInt(selectedProfile, 10) : null)}
        onProfileSaved={async (newProfileId?: number) => {
          await loadProfiles();
          // If a new profile was created, select it
          if (newProfileId) {
            setSelectedProfile(newProfileId.toString());
          }
          setIsCreatingNewProfile(false);
        }}
        onProfileDeleted={async (deletedProfileId: number) => {
          // If we're deleting the currently selected profile, stop scanning first
          if (selectedProfile === deletedProfileId.toString()) {
            // Stop scanning if active
            if (isScanning) {
              await scannerApi.stop();
              setIsScanning(false);
            }
            // Clear selection
            setSelectedProfile('');
          }

          // Reload profiles list
          await loadProfiles();
        }}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </>
  );
}
