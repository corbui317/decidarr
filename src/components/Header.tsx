'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import SettingsModal from './SettingsModal';

export default function Header() {
  const { user, logout } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <header className="bg-decidarr-secondary border-b border-decidarr-primary/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-3xl">🎰</div>
            <div>
              <h1 className="text-xl font-bold text-decidarr-primary">Decidarr</h1>
              <p className="text-xs text-gray-400">Plex Movie Roulette</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {user && (
              <span className="text-sm text-gray-300">
                {(user as { username?: string }).username}
              </span>
            )}

            {/* Settings button */}
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors"
              title="Settings"
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
              onClick={logout}
              className="px-3 py-1.5 text-sm text-gray-300 hover:text-white
                       hover:bg-white/10 rounded transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  );
}
