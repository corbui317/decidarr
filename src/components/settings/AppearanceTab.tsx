'use client';

import {
  AnimationStyle,
  AnimationSpeed,
} from '@/lib/api';
import {
  ANIMATION_STYLE_LABELS,
  ANIMATION_SPEED_LABELS,
} from '@/components/animations';
import { THEME_CONFIG, AppTheme } from '@/context/ThemeContext';
import LoadingSpinner from '@/components/LoadingSpinner';
import { inputClass, inputStyle, labelClass } from './shared';

interface AppearanceTabProps {
  selectedTheme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
  defaultMediaType: 'movie' | 'show';
  onDefaultMediaTypeChange: (type: 'movie' | 'show') => void;
  tvSelectionMode: 'show' | 'episode';
  onTvSelectionModeChange: (mode: 'show' | 'episode') => void;
  spinHistoryEnabled: boolean;
  onSpinHistoryEnabledChange: (enabled: boolean) => void;
  spinHistoryRetention: number;
  onSpinHistoryRetentionChange: (limit: number) => void;
  spinHistoryStoreSnapshots: boolean;
  onSpinHistoryStoreSnapshotsChange: (store: boolean) => void;
  showClearConfirm: boolean;
  onShowClearConfirm: (show: boolean) => void;
  clearingHistory: boolean;
  onClearSpinHistory: () => void;
  animationStyle: AnimationStyle;
  onAnimationStyleChange: (style: AnimationStyle) => void;
  animationSpeed: AnimationSpeed;
  onAnimationSpeedChange: (speed: AnimationSpeed) => void;
  saving: boolean;
  onSave: () => void;
}

export default function AppearanceTab({
  selectedTheme,
  onThemeChange,
  defaultMediaType,
  onDefaultMediaTypeChange,
  tvSelectionMode,
  onTvSelectionModeChange,
  spinHistoryEnabled,
  onSpinHistoryEnabledChange,
  spinHistoryRetention,
  onSpinHistoryRetentionChange,
  spinHistoryStoreSnapshots,
  onSpinHistoryStoreSnapshotsChange,
  showClearConfirm,
  onShowClearConfirm,
  clearingHistory,
  onClearSpinHistory,
  animationStyle,
  onAnimationStyleChange,
  animationSpeed,
  onAnimationSpeedChange,
  saving,
  onSave,
}: AppearanceTabProps) {
  return (
    <div id="tab-panel-appearance" role="tabpanel" className="space-y-6">
      <div>
        <p className={labelClass}>Theme</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(Object.entries(THEME_CONFIG) as [AppTheme, (typeof THEME_CONFIG)[AppTheme]][]).map(
            ([themeKey, config]) => (
              <button
                key={themeKey}
                type="button"
                onClick={() => onThemeChange(themeKey)}
                aria-pressed={selectedTheme === themeKey}
                className={`text-left rounded-xl p-3 border-2 transition-all focus:outline-none focus:ring-2 focus:ring-decidarr-primary ${
                  selectedTheme === themeKey
                    ? 'border-decidarr-primary shadow-lg'
                    : 'border-decidarr-border hover:border-decidarr-primary/50'
                }`}
                style={{ background: config.colors.bg }}
              >
                <div className="flex gap-1.5 mb-2">
                  {[config.colors.bg, config.colors.surface, config.colors.primary, config.colors.accent].map(
                    (color, i) => (
                      <div
                        key={i}
                        className="w-5 h-5 rounded-full border border-white/10"
                        style={{ background: color }}
                        aria-hidden="true"
                      />
                    )
                  )}
                  {selectedTheme === themeKey && (
                    <div
                      className="ml-auto w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: config.colors.primary }}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="#000" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
                <p className="font-semibold text-sm" style={{ color: config.colors.primary }}>
                  {config.label}
                </p>
                <p className="text-xs mt-0.5 opacity-75" style={{ color: config.colors.primary }}>
                  {config.description}
                </p>
              </button>
            )
          )}
        </div>
      </div>

      <div>
        <label htmlFor="default-media-type" className={labelClass}>
          Default Media Type
        </label>
        <select
          id="default-media-type"
          value={defaultMediaType}
          onChange={(e) => onDefaultMediaTypeChange(e.target.value as 'movie' | 'show')}
          className={inputClass}
          style={inputStyle}
        >
          <option value="movie">Movies</option>
          <option value="show">TV Shows</option>
        </select>
      </div>

      <div>
        <label htmlFor="tv-selection-mode" className={labelClass}>
          TV Selection Mode
        </label>
        <select
          id="tv-selection-mode"
          value={tvSelectionMode}
          onChange={(e) => onTvSelectionModeChange(e.target.value as 'show' | 'episode')}
          className={inputClass}
          style={inputStyle}
        >
          <option value="show">Pick a Show</option>
          <option value="episode">Pick an Episode</option>
        </select>
        <p className="text-decidarr-text-muted text-xs mt-1">
          &quot;Pick a Show&quot; selects a random TV series. &quot;Pick an Episode&quot; selects a
          specific random episode.
        </p>
      </div>

      <div className="border-t border-decidarr-border pt-6 space-y-4">
        <h3 className="text-sm font-semibold text-decidarr-text">Spin History</h3>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={spinHistoryEnabled}
            onChange={(e) => onSpinHistoryEnabledChange(e.target.checked)}
            className="w-4 h-4 rounded border-gray-600 text-decidarr-primary focus:ring-decidarr-primary"
          />
          <span className="text-decidarr-text text-sm">Record spin history</span>
        </label>

        <div>
          <label htmlFor="spin-history-retention" className={labelClass}>
            Retention Limit
          </label>
          <input
            id="spin-history-retention"
            type="number"
            min={1}
            max={500}
            value={spinHistoryRetention}
            onChange={(e) => onSpinHistoryRetentionChange(Number(e.target.value))}
            disabled={!spinHistoryEnabled}
            className={inputClass}
            style={inputStyle}
          />
          <p className="text-decidarr-text-muted text-xs mt-1">
            Keep up to 500 recent spins (oldest removed automatically).
          </p>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={spinHistoryStoreSnapshots}
            onChange={(e) => onSpinHistoryStoreSnapshotsChange(e.target.checked)}
            disabled={!spinHistoryEnabled}
            className="w-4 h-4 rounded border-gray-600 text-decidarr-primary focus:ring-decidarr-primary"
          />
          <span className="text-decidarr-text text-sm">Store filter snapshots</span>
        </label>
        <p className="text-decidarr-text-muted text-xs -mt-2">
          Save filter settings with each spin so you can reapply them later.
        </p>

        {showClearConfirm ? (
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 space-y-3">
            <p className="text-red-400 text-sm">Delete all spin history? This cannot be undone.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClearSpinHistory}
                disabled={clearingHistory}
                className="flex-1 bg-red-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {clearingHistory ? 'Clearing...' : 'Yes, clear all'}
              </button>
              <button
                type="button"
                onClick={() => onShowClearConfirm(false)}
                disabled={clearingHistory}
                className="flex-1 bg-decidarr-surface text-decidarr-text font-medium py-2 px-4 rounded-lg border border-decidarr-border hover:border-decidarr-primary transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onShowClearConfirm(true)}
            className="w-full bg-decidarr-surface text-red-400 font-medium py-2 px-4 rounded-lg border border-decidarr-border hover:border-red-500/50 transition-colors"
          >
            Clear All Spin History
          </button>
        )}
      </div>

      <div>
        <label htmlFor="animation-style" className={labelClass}>
          Spin Animation
        </label>
        <select
          id="animation-style"
          value={animationStyle}
          onChange={(e) => onAnimationStyleChange(e.target.value as AnimationStyle)}
          className={inputClass}
          style={inputStyle}
        >
          {(Object.keys(ANIMATION_STYLE_LABELS) as AnimationStyle[]).map((key) => (
            <option key={key} value={key}>
              {ANIMATION_STYLE_LABELS[key]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="animation-speed" className={labelClass}>
          Animation Speed
        </label>
        <select
          id="animation-speed"
          value={animationSpeed}
          onChange={(e) => onAnimationSpeedChange(e.target.value as AnimationSpeed)}
          className={inputClass}
          style={inputStyle}
        >
          {(Object.keys(ANIMATION_SPEED_LABELS) as AnimationSpeed[]).map((key) => (
            <option key={key} value={key}>
              {ANIMATION_SPEED_LABELS[key]}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        aria-busy={saving}
        className="w-full bg-decidarr-primary text-black font-medium py-2 px-4 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {saving ? <LoadingSpinner size="sm" /> : 'Save Preferences'}
      </button>
    </div>
  );
}
