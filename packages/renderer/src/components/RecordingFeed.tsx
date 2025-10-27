import { useState } from 'react';
import './RecordingFeed.css';

interface Recording {
  id: string;
  timestamp: string;
  frequency: string;
  status: 'not-transcribed' | 'transcribing' | 'failed' | 'completed';
  transcription?: string;
}

interface RecordingFeedProps {
  recordings?: Recording[];
}

// Mock data for demonstration
const mockRecordings: Recording[] = [
  {
    id: '1',
    timestamp: '10/26/2025 20:45',
    frequency: '162.550',
    status: 'not-transcribed',
  },
  {
    id: '2',
    timestamp: '10/26/2025 20:46',
    frequency: '162.550',
    status: 'completed',
    transcription:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum',
  },
  {
    id: '3',
    timestamp: '10/26/2025 20:47',
    frequency: '162.550',
    status: 'failed',
  },
  {
    id: '4',
    timestamp: '10/26/2025 20:48',
    frequency: '162.550',
    status: 'completed',
    transcription:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum',
  },
  {
    id: '5',
    timestamp: '10/26/2025 20:49',
    frequency: '162.550',
    status: 'transcribing',
  },
];

export function RecordingFeed({ recordings = mockRecordings }: RecordingFeedProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const getStatusText = (recording: Recording) => {
    switch (recording.status) {
      case 'not-transcribed':
        return 'Not transcribed';
      case 'transcribing':
        return 'Transcribing';
      case 'failed':
        return 'Transcription failed';
      case 'completed':
        return recording.transcription;
      default:
        return '';
    }
  };

  const filteredRecordings = recordings.filter(
    (recording) =>
      recording.frequency.includes(searchQuery) ||
      recording.timestamp.includes(searchQuery) ||
      (recording.transcription &&
        recording.transcription.toLowerCase().includes(searchQuery.toLowerCase()))
  );

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
        />
        <button className="filter-button" aria-label="Filter">
          🔽
        </button>
      </div>

      {/* Feed List */}
      <div className="feed-list">
        {filteredRecordings.map((recording) => (
          <div key={recording.id} className="feed-item">
            <div className="feed-header">
              {recording.timestamp} - {recording.frequency} -{' '}
              {recording.status === 'completed' ? '' : getStatusText(recording)}
            </div>
            {recording.status === 'completed' && recording.transcription && (
              <div className="feed-transcription">{recording.transcription}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
