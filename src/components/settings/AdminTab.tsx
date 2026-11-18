'use client';

import LoadingSpinner from '@/components/LoadingSpinner';
import { PlexFriendUser } from '@/lib/api';

interface AdminTabProps {
  plexFriends: PlexFriendUser[];
  loadingUsers: boolean;
  saving: boolean;
  onToggleUser: (plexUserId: string, approved: boolean) => void;
}

export default function AdminTab({
  plexFriends,
  loadingUsers,
  saving,
  onToggleUser,
}: AdminTabProps) {
  return (
    <div id="tab-panel-admin" role="tabpanel" className="space-y-4">
      <p className="text-decidarr-text-muted text-sm">
        Grant Plex friends access to Decidarr. They must already have access to your Plex server.
      </p>
      {loadingUsers ? (
        <LoadingSpinner size="md" />
      ) : plexFriends.length === 0 ? (
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
                  onChange={(e) => onToggleUser(friend.id, e.target.checked)}
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
