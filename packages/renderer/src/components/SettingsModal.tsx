import { useState, useEffect } from 'react';
import './SettingsModal.css';
import { settingsApi } from '../utils/preloadApi';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [unsquelchWaitTime, setUnsquelchWaitTime] = useState('2000');
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
      } catch (err) {
        console.error('Failed to load settings:', err);
        setError('Failed to load settings');
      }
    };

    loadSettings();
  }, [isOpen]);

  const handleSave = async () => {
    setError('');

    // Validate input
    const value = parseInt(unsquelchWaitTime, 10);
    if (isNaN(value) || value < 0) {
      setError('Unsquelch timeout must be a positive number');
      return;
    }

    setIsSaving(true);
    try {
      const result = await settingsApi.update({
        unsquelchWaitTime: value,
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
