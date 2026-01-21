import { useState, useEffect } from 'react';
import './RecordingFeed.css';
import { databaseApi, type Recording } from '../utils/preloadApi';
import { FilterModal, type FilterOptions } from './FilterModal';

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
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>({});

  useEffect(() => {
    // Load recordings from database
    const loadRecordings = async () => {
      try {
        let data: Recording[];

        // Check if we have any filters or search query
        const hasFilters = Object.keys(filters).length > 0;
        const hasSearchQuery = searchQuery.trim().length > 0;

        if (hasFilters || hasSearchQuery) {
          // Use the filter API which supports both filters and search
          data = await databaseApi.recordings.filter({
            ...filters,
            searchText: hasSearchQuery ? searchQuery.trim() : undefined,
          });
        } else {
          // Get all recordings when no filters or search
          data = await databaseApi.recordings.getAll();
        }

        setRecordings(data);
      } catch (error) {
        console.error('Failed to load recordings:', error);
      }
    };

    loadRecordings();

    // Poll for updates every 5 seconds to catch new recordings and transcription updates
    const interval = setInterval(loadRecordings, 5000);

    return () => clearInterval(interval);
  }, [searchQuery, filters]);

  const getStatusText = (recording: Recording): string => {
    switch (recording.TranscriptionStatus) {
      case TranscriptionStatus.PENDING:
        return ' - Transcription Pending';
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

  const handleFilterApply = (newFilters: FilterOptions) => {
    setFilters(newFilters);
  };

  const handleDelete = async (recording: Recording, event: React.MouseEvent) => {
    // Prevent the feed item click event from firing
    event.stopPropagation();

    // Confirm deletion
    if (!confirm(`Delete recording from ${formatTimestamp(recording.Datetime)} at ${formatFrequency(recording.Frequency)} MHz?`)) {
      return;
    }

    try {
      const result = await databaseApi.recordings.delete(recording.FilePath);
      if (result.success) {
        // Remove from local state immediately for responsive UI
        setRecordings(prev => prev.filter(r => r.Id !== recording.Id));
      } else {
        alert(`Failed to delete recording: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to delete recording:', error);
      alert('Failed to delete recording');
    }
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
        />
        <button
          className="filter-button"
          aria-label="Filter"
          onClick={() => setIsFilterModalOpen(true)}
        >
          🔽
        </button>
      </div>

      {/* Filter Modal */}
      <FilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        onApply={handleFilterApply}
        currentFilters={filters}
      />

      {/* Feed List */}
      <div className="feed-list">
        {recordings.map((recording) => (
          <div key={recording.Id} className="feed-item">
            <div className="feed-item-content">
              <div className="feed-header">
                {formatTimestamp(recording.Datetime)} - {formatFrequency(recording.Frequency)}
                {getStatusText(recording)}
              </div>
              {recording.TranscriptionStatus === TranscriptionStatus.SUCCESS && recording.TranscriptionText && (
                <div className="feed-transcription">{recording.TranscriptionText}</div>
              )}
            </div>
            <button
              className="delete-button"
              aria-label="Delete recording"
              onClick={(e) => handleDelete(recording, e)}
              title="Delete recording"
            >
              🗑️
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
