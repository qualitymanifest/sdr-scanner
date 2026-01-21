import { useState, useEffect } from 'react';
import './SettingsModal.css';
import { settingsApi, type WhisperModel } from '../utils/preloadApi';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MODEL_INFO: Record<WhisperModel, { size: string; description: string }> = {
  'tiny': { size: '39 MB', description: 'Fastest, least accurate' },
  'base': { size: '142 MB', description: 'Good balance (recommended)' },
  'small': { size: '466 MB', description: 'Better accuracy, slower' },
  'medium': { size: '1.5 GB', description: 'High accuracy, much slower' },
  'large-v3': { size: '3.1 GB', description: 'Best accuracy, very slow' },
};

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [unsquelchWaitTime, setUnsquelchWaitTime] = useState('2000');
  const [recordingTimeout, setRecordingTimeout] = useState('2000');
  const [minimumRecordingDuration, setMinimumRecordingDuration] = useState('1000');
  const [transcriptionModel, setTranscriptionModel] = useState<WhisperModel>('base');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Load settings when modal opens
  useEffect(() => {
    if (!isOpen) {
      setError('');
      return;
    }

    const loadSettings = async () => {
      try {
        const settings = await settingsApi.getAll();
        setUnsquelchWaitTime(settings.unsquelchWaitTime.toString());
        setRecordingTimeout(settings.recordingTimeout.toString());
        setMinimumRecordingDuration(settings.minimumRecordingDuration.toString());
        setTranscriptionModel(settings.transcriptionModel);
      } catch (err) {
        console.error('Failed to load settings:', err);
        setError('Failed to load settings');
      }
    };

    loadSettings();
  }, [isOpen]);

  const handleSave = async () => {
    setError('');

    // Validate inputs
    const unsquelchValue = parseInt(unsquelchWaitTime, 10);
    if (isNaN(unsquelchValue) || unsquelchValue < 0) {
      setError('Unsquelch timeout must be a positive number');
      return;
    }

    const recordingValue = parseInt(recordingTimeout, 10);
    if (isNaN(recordingValue) || recordingValue < 0) {
      setError('Recording timeout must be a positive number');
      return;
    }

    const minimumDurationValue = parseInt(minimumRecordingDuration, 10);
    if (isNaN(minimumDurationValue) || minimumDurationValue < 0) {
      setError('Minimum recording duration must be a positive number');
      return;
    }

    setIsSaving(true);
    try {
      const result = await settingsApi.update({
        unsquelchWaitTime: unsquelchValue,
        recordingTimeout: recordingValue,
        minimumRecordingDuration: minimumDurationValue,
        transcriptionModel: transcriptionModel,
      });

      if (result.success) {
        onClose();
      } else {
        setError(result.error || 'Failed to save settings');
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
      setError('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = async () => {
    // Reload settings to reset form
    try {
      const settings = await settingsApi.getAll();
      setUnsquelchWaitTime(settings.unsquelchWaitTime.toString());
      setRecordingTimeout(settings.recordingTimeout.toString());
      setMinimumRecordingDuration(settings.minimumRecordingDuration.toString());
      setTranscriptionModel(settings.transcriptionModel);
      setError('');
      onClose();
    } catch (err) {
      console.error('Failed to reload settings:', err);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="close-button" onClick={handleCancel}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="unsquelch-timeout">Unsquelch Timeout (ms)</label>
            <input
              id="unsquelch-timeout"
              type="number"
              min="0"
              step="100"
              value={unsquelchWaitTime}
              onChange={(e) => setUnsquelchWaitTime(e.target.value)}
              className="settings-input"
              placeholder="2000"
            />
            <div className="input-help">
              Time to wait after signal ends before moving to next frequency
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="recording-timeout">Recording Timeout (ms)</label>
            <input
              id="recording-timeout"
              type="number"
              min="0"
              step="100"
              value={recordingTimeout}
              onChange={(e) => setRecordingTimeout(e.target.value)}
              className="settings-input"
              placeholder="2000"
            />
            <div className="input-help">
              How long to wait before saving a recording after signal ends. Only used when not scanning. When scanning, Unsquelch Timeout is used for this purpose.
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="minimum-recording-duration">Minimum Recording Duration (ms)</label>
            <input
              id="minimum-recording-duration"
              type="number"
              min="0"
              step="100"
              value={minimumRecordingDuration}
              onChange={(e) => setMinimumRecordingDuration(e.target.value)}
              className="settings-input"
              placeholder="1000"
            />
            <div className="input-help">
              Recordings shorter than this duration will be discarded
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="transcription-model">Transcription Model</label>
            <select
              id="transcription-model"
              value={transcriptionModel}
              onChange={(e) => setTranscriptionModel(e.target.value as WhisperModel)}
              className="settings-input"
            >
              {(Object.keys(MODEL_INFO) as WhisperModel[]).map((model) => {
                const info = MODEL_INFO[model];
                return (
                  <option key={model} value={model}>
                    {model} - {info.size} - {info.description}
                  </option>
                );
              })}
            </select>
            <div className="input-help">
              Choose transcription accuracy vs speed. Model will download automatically on first use. Changing this setting only affects new transcriptions.
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}
        </div>

        <div className="modal-footer">
          <div className="footer-left"></div>
          <div className="footer-right">
            <button className="cancel-button" onClick={handleCancel}>
              Cancel
            </button>
            <button
              className="save-button"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
