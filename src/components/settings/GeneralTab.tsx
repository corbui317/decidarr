'use client';

import LoadingSpinner from '@/components/LoadingSpinner';
import { inputClass, inputStyle, labelClass } from './shared';

interface GeneralTabProps {
  syncFrequencyHours: number;
  onSyncFrequencyChange: (hours: number) => void;
  saving: boolean;
  onSave: () => void;
}

export default function GeneralTab({
  syncFrequencyHours,
  onSyncFrequencyChange,
  saving,
  onSave,
}: GeneralTabProps) {
  return (
    <div id="tab-panel-general" role="tabpanel" className="space-y-5">
      <div>
        <label htmlFor="sync-frequency" className={labelClass}>
          Library Sync Frequency
        </label>
        <select
          id="sync-frequency"
          value={syncFrequencyHours}
          onChange={(e) => onSyncFrequencyChange(Number(e.target.value))}
          className={inputClass}
          style={inputStyle}
        >
          <option value={1}>Every hour</option>
          <option value={6}>Every 6 hours</option>
          <option value={12}>Every 12 hours</option>
          <option value={24}>Every 24 hours</option>
          <option value={48}>Every 2 days</option>
          <option value={168}>Every week</option>
        </select>
        <p className="text-decidarr-text-muted text-xs mt-2">
          How often to refresh your library cache from Plex. More frequent syncs ensure new content
          appears faster but use more resources.
        </p>
      </div>

      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        aria-busy={saving}
        className="w-full bg-decidarr-primary text-black font-medium py-2 px-4 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {saving ? <LoadingSpinner size="sm" /> : 'Save'}
      </button>
    </div>
  );
}
