import LoadingSpinner from '../LoadingSpinner';

interface PlexStepProps {
  error: string | null;
  setupSecret: string;
  onSetupSecretChange: (value: string) => void;
  plexConnected: boolean;
  plexUsername: string | null;
  loading: boolean;
  onBack: () => void;
  onPlexOAuth: () => void;
  onNext: () => void;
}

export default function PlexStep({
  error,
  setupSecret,
  onSetupSecretChange,
  plexConnected,
  plexUsername,
  loading,
  onBack,
  onPlexOAuth,
  onNext,
}: PlexStepProps) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-2">Connect with Plex</h2>
      <p className="text-gray-400 text-sm mb-6">
        Sign in with your Plex account. You must be the owner of the Plex Media Server.
      </p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="setup-secret" className="block text-sm text-gray-400 mb-1">
          Setup key (required on public production installs)
        </label>
        <input
          id="setup-secret"
          type="password"
          value={setupSecret}
          onChange={(e) => onSetupSecretChange(e.target.value)}
          placeholder="Optional for local development"
          className="w-full bg-decidarr-dark border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
        />
      </div>

      {plexConnected && plexUsername && (
        <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-3 mb-4">
          <p className="text-green-400 text-sm">
            Connected as <strong>{plexUsername}</strong>
          </p>
        </div>
      )}

      <div className="flex space-x-3 pt-4">
        <button
          onClick={onBack}
          className="flex-1 bg-gray-700 text-white font-semibold py-3 px-6 rounded-lg hover:bg-gray-600 transition-colors"
        >
          Back
        </button>
        {!plexConnected ? (
          <button
            onClick={onPlexOAuth}
            disabled={loading}
            className="flex-1 bg-decidarr-primary text-black font-semibold py-3 px-6 rounded-lg hover:bg-decidarr-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center"
          >
            {loading ? <LoadingSpinner size="sm" /> : 'Sign in with Plex'}
          </button>
        ) : (
          <button
            onClick={onNext}
            className="flex-1 bg-decidarr-primary text-black font-semibold py-3 px-6 rounded-lg hover:bg-decidarr-primary/90 transition-colors"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}
