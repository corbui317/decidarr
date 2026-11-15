'use client';

import { useState, useEffect, useCallback } from 'react';
import { PlexFriendUser, adminUsersApi } from '@/lib/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useAuth } from '@/context/AuthContext';

export default function AdminTab() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [plexFriends, setPlexFriends] = useState<PlexFriendUser[]>([]);

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
        const friends = await adminUsersApi.listPlexFriends();
        setPlexFriends(friends);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load Plex friends';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isAdmin]);

  const handleToggleUser = useCallback(async (plexUserId: string, approved: boolean) => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (approved) {
        await adminUsersApi.approveUser(plexUserId);
      } else {
        await adminUsersApi.revokeUser(plexUserId);
      }

      // Update local state
      setPlexFriends((prev) =>
        prev.map((friend) =>
          friend.id === plexUserId ? { ...friend, isApproved: approved } : friend
        )
      );

      setSuccess(`User ${approved ? 'approved' : 'revoked'} successfully`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update user access';
      setError(message);
    } finally {
      setSaving(false);
    }
  }, []);

  if (loading) {
    return (
      <div id="tab-panel-admin" role="tabpanel" className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div id="tab-panel-admin" role="tabpanel" className="p-4">
        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-red-400 text-sm">
          Admin access required to manage users
        </div>
      </div>
    );
  }

  return (
    <div id="tab-panel-admin" role="tabpanel" className="space-y-4">
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

      <p className="text-decidarr-text-muted text-sm">
        Grant Plex friends access to Decidarr. They must already have access to your Plex server.
      </p>

      {plexFriends.length === 0 ? (
        <p className="text-decidarr-text-muted text-sm">No Plex friends found.</p>
      ) : (
        <ul className="space-y-2">
          {plexFriends.map((friend) => (
            <li
              key={friend.id}
              className="flex items-center justify-between bg-decidarr-dark/50 border border-decidarr-border rounded-lg px-4 py-3"
            >
              <div>
                <p className="text-decidarr-text font-medium">{friend.username}</p>
                <p className="text-decidarr-text-muted text-xs">
                  {friend.hasServerAccess ? 'Has server access' : 'No server access'}
                </p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-sm text-decidarr-text-muted">Access</span>
                <input
                  type="checkbox"
                  checked={friend.isApproved}
                  disabled={saving}
                  onChange={(e) => handleToggleUser(friend.id, e.target.checked)}
                  className="w-4 h-4 accent-decidarr-primary"
                />
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
