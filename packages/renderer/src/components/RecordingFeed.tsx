import { useState, useEffect } from 'react';
import './RecordingFeed.css';
import { databaseApi, type Recording } from '../utils/preloadApi';

// Enum object for TranscriptionStatus matching Database.ts
export const TranscriptionStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  SUCCESS: 'success',
  FAILED: 'failed',
} as const;

export type TranscriptionStatusType = typeof TranscriptionStatus[keyof typeof TranscriptionStatus];

export function RecordingFeed() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    // Load recordings from database
    const loadRecordings = async () => {
      try {
        const data = await databaseApi.recordings.getAll();
        setRecordings(data);
      } catch (error) {
        console.error('Failed to load recordings:', error);
      }
    };

    loadRecordings();

    // Poll for updates every 5 seconds to catch new recordings and transcription updates
    const interval = setInterval(loadRecordings, 5000);

    return () => clearInterval(interval);
  }, []);

  const getStatusText = (recording: Recording): string => {
    switch (recording.TranscriptionStatus) {
      case TranscriptionStatus.PENDING:
        return ' - Not transcribed';
      case TranscriptionStatus.PROCESSING:
        return ' - Transcribing';
      case TranscriptionStatus.FAILED:
        return ' - Transcription failed';
      default:
        return '';
    }
  };

  const formatTimestamp = (datetime: string): string => {
    // Convert ISO 8601 format to MM/DD/YYYY HH:mm
    const date = new Date(datetime);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${month}/${day}/${year} ${hours}:${minutes}`;
  };

  const formatFrequency = (frequencyHz: number): string => {
    // Convert Hz to MHz with 3 decimal places
    return (frequencyHz / 1_000_000).toFixed(3);
  };

  return (
    <div className="recording-feed">
      {/* Search Bar */}
      <div className="search-bar">
        <input
          type="text"
          placeholder="Search Feed"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
          disabled
        />
        <button className="filter-button" aria-label="Filter">
          🔽
        </button>
      </div>

      {/* Feed List */}
      <div className="feed-list">
        {recordings.map((recording) => (
          <div key={recording.Id} className="feed-item">
            <div className="feed-header">
              {formatTimestamp(recording.Datetime)} - {formatFrequency(recording.Frequency)} 
              {getStatusText(recording)}
            </div>
            {recording.TranscriptionStatus === TranscriptionStatus.SUCCESS && recording.TranscriptionText && (
              <div className="feed-transcription">{recording.TranscriptionText}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
