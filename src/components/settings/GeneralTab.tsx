'use client';

import { useState, useEffect, useCallback } from 'react';
import { settingsApi } from '@/lib/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import { inputClass, inputStyle, labelClass } from './shared';
import { useAuth } from '@/context/AuthContext';

export default function GeneralTab() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [syncFrequencyHours, setSyncFrequencyHours] = useState(24);

  useEffect(() => {
    const loadData = async () => {
      if (!isAdmin) {
        setLoading(false);
        setError('Admin access required');
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const settings = await settingsApi.getSettings();
        setSyncFrequencyHours(settings.syncFrequencyHours);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load settings';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isAdmin]);

  const handleSave = useCallback(async () => {
    if (!isAdmin) {
      setError('Admin access required');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await settingsApi.saveSettings({
        syncFrequencyHours,
      });

      setSuccess('Settings saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save settings';
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [syncFrequencyHours, isAdmin]);

  if (loading) {
    return (
      <div id="tab-panel-general" role="tabpanel" className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div id="tab-panel-general" role="tabpanel" className="p-4">
        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-red-400 text-sm">
          Admin access required to view general settings
        </div>
      </div>
    );
  }

  return (
    <div id="tab-panel-general" role="tabpanel" className="space-y-5">
      {error && (
        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-3 text-green-400 text-sm">
          {success}
        </div>
      )}

      <div>
        <label htmlFor="sync-frequency" className={labelClass}>
          Library Sync Frequency
        </label>
        <select
          id="sync-frequency"
          value={syncFrequencyHours}
          onChange={(e) => setSyncFrequencyHours(Number(e.target.value))}
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
        onClick={handleSave}
        disabled={saving}
        aria-busy={saving}
        className="w-full bg-decidarr-primary text-black font-medium py-2 px-4 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {saving ? (
          <>
            <LoadingSpinner size="sm" />
            Saving...
          </>
        ) : (
          'Save Settings'
        )}
      </button>
    </div>
  );
}
