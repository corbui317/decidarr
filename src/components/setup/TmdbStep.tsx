import LoadingSpinner from '../LoadingSpinner';

interface TmdbStepProps {
  error: string | null;
  tmdbApiKey: string;
  onTmdbApiKeyChange: (value: string) => void;
  tmdbValid: boolean | null;
  loading: boolean;
  onBack: () => void;
  onTestTmdb: () => void;
  onComplete: () => void;
}

export default function TmdbStep({
  error,
  tmdbApiKey,
  onTmdbApiKeyChange,
  tmdbValid,
  loading,
  onBack,
  onTestTmdb,
  onComplete,
}: TmdbStepProps) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-2">TMDB Integration</h2>
      <p className="text-gray-400 text-sm mb-6">
        Optional: Add your TMDB API key for enhanced movie data and ratings.
      </p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-gray-300 text-sm mb-2">
            TMDB API Key <span className="text-gray-500">(Optional)</span>
          </label>
          <input
            type="password"
            value={tmdbApiKey}
            onChange={(e) => onTmdbApiKeyChange(e.target.value)}
            placeholder="Enter your TMDB API key"
            className="w-full bg-decidarr-dark border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-decidarr-primary"
          />
        </div>

        {tmdbValid === true && (
          <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-3">
            <p className="text-green-400 text-sm">TMDB API key is valid</p>
          </div>
        )}

        <div className="flex space-x-3 pt-4">
          <button
            onClick={onBack}
            className="flex-1 bg-gray-700 text-white font-semibold py-3 px-6 rounded-lg hover:bg-gray-600 transition-colors"
          >
            Back
          </button>
          {tmdbApiKey.trim() && tmdbValid !== true ? (
            <button
              onClick={onTestTmdb}
              disabled={loading}
              className="flex-1 bg-decidarr-primary text-black font-semibold py-3 px-6 rounded-lg hover:bg-decidarr-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center"
            >
              {loading ? <LoadingSpinner size="sm" /> : 'Validate'}
            </button>
          ) : (
            <button
              onClick={onComplete}
              disabled={loading}
              className="flex-1 bg-decidarr-primary text-black font-semibold py-3 px-6 rounded-lg hover:bg-decidarr-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center"
            >
              {loading ? <LoadingSpinner size="sm" /> : tmdbApiKey.trim() ? 'Complete Setup' : 'Skip & Complete'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
