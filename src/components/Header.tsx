'use client';

import { useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import SettingsModal from './SettingsModal';

export default function Header() {
  const { user, logout } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleOpenSettings = useCallback(() => {
    setSettingsOpen(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  const handleLogout = useCallback(async () => {
    if (loggingOut) return;
    
    setLoggingOut(true);
    
    try {
      await logout();
    } catch (err) {
      // Force redirect anyway to ensure user can get to a clean state
      window.location.href = '/';
    }
  }, [logout, loggingOut]);

  return (
    <>
      <header className="bg-decidarr-secondary border-b border-decidarr-primary/20 sticky top-0 z-50 pt-safe">
        <div className="max-w-7xl mx-auto px-4 py-2 sm:py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="text-2xl sm:text-3xl flex-shrink-0">🎰</div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-decidarr-primary truncate">Decidarr</h1>
              <p className="text-xs text-gray-400 hidden sm:block">Plex Movie Roulette</p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {user && (
              <span className="text-sm text-gray-300 hidden sm:inline max-w-[8rem] truncate">
                {(user as { username?: string }).username}
              </span>
            )}

            {/* Settings button */}
            <button
              onClick={handleOpenSettings}
              className="touch-target flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Settings"
              type="button"
              aria-label="Settings"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>

            <button
              onClick={handleLogout}
              disabled={loggingOut}
              type="button"
              className="touch-target px-3 text-sm text-gray-300 hover:text-white
                       hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50
                       flex items-center justify-center"
            >
              {loggingOut ? 'Logging out...' : 'Logout'}
            </button>
          </div>
        </div>
      </header>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={handleCloseSettings}
      />
    </>
  );
}
