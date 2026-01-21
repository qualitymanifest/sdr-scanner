import { useState, useEffect } from 'react';
import './FilterModal.css';

export interface FilterOptions {
  frequency?: number;
  datetimeStart?: string;
  datetimeEnd?: string;
}

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filters: FilterOptions) => void;
  currentFilters: FilterOptions;
}

export function FilterModal({ isOpen, onClose, onApply, currentFilters }: FilterModalProps) {
  const [frequencyMHz, setFrequencyMHz] = useState('');
  const [datetimeStart, setDatetimeStart] = useState('');
  const [datetimeEnd, setDatetimeEnd] = useState('');

  // Initialize form with current filters
  useEffect(() => {
    if (isOpen) {
      setFrequencyMHz(currentFilters.frequency ? (currentFilters.frequency / 1_000_000).toFixed(3) : '');
      setDatetimeStart(currentFilters.datetimeStart ? formatDatetimeLocalInput(currentFilters.datetimeStart) : '');
      setDatetimeEnd(currentFilters.datetimeEnd ? formatDatetimeLocalInput(currentFilters.datetimeEnd) : '');
    }
  }, [isOpen, currentFilters]);

  const formatDatetimeLocalInput = (isoString: string): string => {
    // Convert ISO 8601 to datetime-local format (YYYY-MM-DDTHH:mm)
    return isoString.substring(0, 16);
  };

  const handleApply = () => {
    const filters: FilterOptions = {};

    if (frequencyMHz.trim()) {
      filters.frequency = parseFloat(frequencyMHz) * 1_000_000;
    }

    if (datetimeStart.trim()) {
      filters.datetimeStart = datetimeStart + ':00'; // Add seconds for ISO format
    }

    if (datetimeEnd.trim()) {
      filters.datetimeEnd = datetimeEnd + ':00'; // Add seconds for ISO format
    }

    onApply(filters);
    onClose();
  };

  const handleClear = () => {
    setFrequencyMHz('');
    setDatetimeStart('');
    setDatetimeEnd('');
    onApply({});
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="filter-modal-overlay" onClick={onClose}>
      <div className="filter-modal" onClick={(e) => e.stopPropagation()}>
        <div className="filter-modal-header">
          <h2>Filter Recordings</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="filter-modal-content">
          {/* Frequency */}
          <div className="filter-section">
            <h3>Frequency (MHz)</h3>
            <div className="filter-input-group">
              <input
                id="frequency"
                type="number"
                step="0.001"
                placeholder="e.g., 162.550"
                value={frequencyMHz}
                onChange={(e) => setFrequencyMHz(e.target.value)}
              />
            </div>
          </div>

          {/* Datetime Range */}
          <div className="filter-section">
            <h3>Date & Time</h3>
            <div className="filter-row">
              <div className="filter-input-group">
                <label htmlFor="datetime-start">Start</label>
                <input
                  id="datetime-start"
                  type="datetime-local"
                  value={datetimeStart}
                  onChange={(e) => setDatetimeStart(e.target.value)}
                />
              </div>
              <div className="filter-input-group">
                <label htmlFor="datetime-end">End</label>
                <input
                  id="datetime-end"
                  type="datetime-local"
                  value={datetimeEnd}
                  onChange={(e) => setDatetimeEnd(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="filter-modal-footer">
          <button className="clear-button" onClick={handleClear}>
            Clear All
          </button>
          <button className="apply-button" onClick={handleApply}>
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
}
