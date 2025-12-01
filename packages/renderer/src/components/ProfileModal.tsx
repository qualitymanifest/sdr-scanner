import { useState, useEffect } from 'react';
import './ProfileModal.css';
import { databaseApi, type ProfileFrequency } from '../utils/preloadApi';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profileId: number | null;
  onProfileSaved?: (newProfileId?: number) => void;
  onProfileDeleted?: (deletedProfileId: number) => void;
}

interface ChannelRow {
  id?: number; // Database ID (undefined for new rows)
  channel: string;
  frequency: string;
  enabled: boolean;
  isNew?: boolean;
}

export function ProfileModal({
  isOpen,
  onClose,
  profileId,
  onProfileSaved,
  onProfileDeleted,
}: ProfileModalProps) {
  const [profileName, setProfileName] = useState('');
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Load profile data when modal opens
  useEffect(() => {
    if (!isOpen) {
      // Reset state when modal closes
      setProfileName('');
      setChannels([]);
      setShowDeleteConfirm(false);
      return;
    }

    if (!profileId) {
      // Creating new profile - start with empty name and no channels
      setProfileName('');
      setChannels([]);
      setShowDeleteConfirm(false);
      return;
    }

    const loadProfile = async () => {
      try {
        const profile = await databaseApi.profiles.getWithFrequencies(profileId);
        if (profile) {
          setProfileName(profile.Name);

          // Convert frequencies to channel rows
          const rows: ChannelRow[] = profile.frequencies.map((freq) => ({
            id: freq.Id,
            channel: freq.Channel !== null ? freq.Channel.toString() : '',
            frequency: (freq.FrequencyHz / 1_000_000).toFixed(3), // Hz to MHz
            enabled: freq.Enabled,
          }));

          setChannels(rows);
        }
      } catch (error) {
        console.error('Failed to load profile:', error);
      }
    };

    loadProfile();
  }, [isOpen, profileId]);

  const handleAddChannel = () => {
    setChannels([
      ...channels,
      {
        channel: '',
        frequency: '',
        enabled: true,
        isNew: true,
      },
    ]);
  };

  const handleDeleteChannel = (index: number) => {
    setChannels(channels.filter((_, i) => i !== index));
  };

  const handleChannelChange = (
    index: number,
    field: 'channel' | 'frequency' | 'enabled',
    value: string | boolean
  ) => {
    const newChannels = [...channels];
    newChannels[index] = {
      ...newChannels[index],
      [field]: value,
    };
    setChannels(newChannels);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      let currentProfileId = profileId;

      // Create new profile if we don't have an ID
      if (!currentProfileId) {
        const createResult = await databaseApi.profiles.create(profileName || 'New Profile');
        if (!createResult.success || !createResult.id) {
          console.error('Failed to create profile:', createResult.error);
          setIsSaving(false);
          return;
        }
        currentProfileId = createResult.id;
      } else {
        // Update existing profile name
        const updateNameResult = await databaseApi.profiles.update(currentProfileId, profileName);
        if (!updateNameResult.success) {
          console.error('Failed to update profile name:', updateNameResult.error);
          setIsSaving(false);
          return;
        }
      }

      // Get existing frequencies to determine what to delete (only for existing profiles)
      if (profileId) {
        const existingFreqs = await databaseApi.frequencies.getByProfileId(currentProfileId);
        const existingIds = new Set(existingFreqs.map(f => f.Id));
        const keptIds = new Set(channels.filter(c => c.id).map(c => c.id!));

        // Delete removed frequencies
        for (const freq of existingFreqs) {
          if (!keptIds.has(freq.Id)) {
            await databaseApi.frequencies.delete(freq.Id);
          }
        }

        // Update or create frequencies
        for (const channel of channels) {
          // Convert frequency from MHz to Hz
          const frequencyHz = Math.round(parseFloat(channel.frequency) * 1_000_000);
          const channelNum = channel.channel ? parseInt(channel.channel, 10) : null;

          if (channel.id && existingIds.has(channel.id)) {
            // Update existing frequency
            await databaseApi.frequencies.update(
              channel.id,
              frequencyHz,
              channelNum,
              channel.enabled
            );
          } else {
            // Create new frequency
            await databaseApi.frequencies.create(
              currentProfileId,
              frequencyHz,
              channelNum,
              channel.enabled
            );
          }
        }
      } else {
        // For new profiles, just create all frequencies
        for (const channel of channels) {
          // Convert frequency from MHz to Hz
          const frequencyHz = Math.round(parseFloat(channel.frequency) * 1_000_000);
          const channelNum = channel.channel ? parseInt(channel.channel, 10) : null;

          await databaseApi.frequencies.create(
            currentProfileId,
            frequencyHz,
            channelNum,
            channel.enabled
          );
        }
      }

      // Notify parent that profile was saved, passing the profile ID if it's new
      onProfileSaved?.(profileId ? undefined : currentProfileId);

      // Close modal
      onClose();
    } catch (error) {
      console.error('Failed to save profile:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!profileId) return;

    setIsDeleting(true);
    try {
      // Delete the profile (this will cascade delete all frequencies)
      const result = await databaseApi.profiles.delete(profileId);
      if (result.success) {
        // Notify parent that profile was deleted
        onProfileDeleted?.(profileId);
        // Close modal
        onClose();
      } else {
        console.error('Failed to delete profile:', result.error);
      }
    } catch (error) {
      console.error('Failed to delete profile:', error);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{profileId ? 'Edit Profile' : 'New Profile'}</h2>
          <button className="close-button" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {/* Profile Name */}
          <div className="form-group">
            <label htmlFor="profile-name">Profile Name</label>
            <input
              id="profile-name"
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              className="profile-name-input"
              placeholder="Enter profile name"
            />
          </div>

          {/* Channels List */}
          <div className="channels-section">
            <div className="channels-header">
              <h3>Channels</h3>
              <button className="add-channel-button" onClick={handleAddChannel}>
                + Add Channel
              </button>
            </div>

            <div className="channels-list">
              {/* Table Header */}
              <div className="channel-row header-row">
                <div className="channel-cell channel-enabled">Enabled</div>
                <div className="channel-cell">Channel</div>
                <div className="channel-cell">Frequency (MHz)</div>
                <div className="channel-cell">Actions</div>
              </div>

              {/* Channel Rows */}
              {channels.map((channel, index) => (
                <div key={index} className="channel-row">
                  <div className="channel-cell channel-enabled">
                    <input
                      type="checkbox"
                      checked={channel.enabled}
                      onChange={(e) =>
                        handleChannelChange(index, 'enabled', e.target.checked)
                      }
                    />
                  </div>
                  <div className="channel-cell channel-number">
                    <input
                      type="text"
                      value={channel.channel}
                      onChange={(e) =>
                        handleChannelChange(index, 'channel', e.target.value)
                      }
                      placeholder="Ch #"
                      className="channel-input"
                    />
                  </div>
                  <div className="channel-cell channel-frequency">
                    <input
                      type="text"
                      value={channel.frequency}
                      onChange={(e) =>
                        handleChannelChange(index, 'frequency', e.target.value)
                      }
                      placeholder="162.550"
                      className="channel-input"
                    />
                  </div>
                  <div className="channel-cell channel-actions">
                    <button
                      className="delete-button"
                      onClick={() => handleDeleteChannel(index)}
                      aria-label="Delete channel"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}

              {channels.length === 0 && (
                <div className="empty-state">
                  No channels yet. Click "Add Channel" to create one.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <div className="footer-left">
            {profileId && !showDeleteConfirm && (
              <button
                className="delete-profile-button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isSaving || isDeleting}
              >
                Delete Profile
              </button>
            )}
            {profileId && showDeleteConfirm && (
              <div className="delete-confirm">
                <span className="delete-confirm-text">Are you sure?</span>
                <button
                  className="delete-confirm-button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                </button>
                <button
                  className="delete-cancel-button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
          <div className="footer-right">
            <button className="cancel-button" onClick={onClose}>
              Cancel
            </button>
            <button
              className="save-button"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
