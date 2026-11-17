interface RatingCategory {
  id: string;
  name: string;
  icon: string;
}

interface RatingFilterProps {
  ratingCategories: RatingCategory[];
  ratingRange: { min: number; max: number };
  selectedRatingFilter: string | null;
  selectedRatingRange: { min: number | null; max: number | null } | null;
  dataAvailability: number;
  onToggleRatingFilter: (ratingId: string) => void;
  onUpdateRatingRange: (key: 'min' | 'max', value: string) => void;
}

function getRatingIcon(icon: string): string {
  const icons: Record<string, string> = {
    oscar: '🏆',
    emmy: '📺',
    camera: '🎬',
    popcorn: '🍿',
    masks: '💎',
    star: '⭐',
  };
  return icons[icon] || '🏅';
}

export default function RatingFilter({
  ratingCategories,
  ratingRange,
  selectedRatingFilter,
  selectedRatingRange,
  dataAvailability,
  onToggleRatingFilter,
  onUpdateRatingRange,
}: RatingFilterProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-400 mb-2">
        Score Rating
        {dataAvailability < 80 && (
          <span className="ml-2 text-yellow-500 text-xs" title="Percentage of items with rating data">
            ({dataAvailability}% have data)
          </span>
        )}
      </label>

      {/* Preset options */}
      {ratingCategories.length > 0 && (
        <div className="grid grid-cols-1 gap-2 mb-3">
          {ratingCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => onToggleRatingFilter(category.id)}
              aria-pressed={selectedRatingFilter === category.id}
              className={`p-2 rounded-lg text-sm text-left transition flex items-center gap-2 ${
                selectedRatingFilter === category.id
                  ? 'bg-decidarr-primary/20 border-2 border-decidarr-primary'
                  : 'bg-decidarr-dark border-2 border-transparent hover:border-gray-700'
              }`}
            >
              <span>{getRatingIcon(category.icon)}</span>
              <span className="text-white text-xs">{category.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Custom range */}
      <div className="flex items-center gap-2" role="group" aria-label="Custom score rating range">
        <label htmlFor="filter-rating-min" className="sr-only">Minimum score</label>
        <input
          id="filter-rating-min"
          type="number"
          step="0.5"
          min={ratingRange.min}
          max={ratingRange.max}
          placeholder={String(ratingRange.min)}
          value={selectedRatingRange?.min ?? ''}
          onChange={(e) => onUpdateRatingRange('min', e.target.value)}
          className="w-20 px-3 py-2 bg-decidarr-dark border border-gray-700 rounded-lg
                   text-white text-center focus:border-decidarr-primary outline-none text-sm"
        />
        <span className="text-gray-500 text-sm">to</span>
        <label htmlFor="filter-rating-max" className="sr-only">Maximum score</label>
        <input
          id="filter-rating-max"
          type="number"
          step="0.5"
          min={ratingRange.min}
          max={ratingRange.max}
          placeholder={String(ratingRange.max)}
          value={selectedRatingRange?.max ?? ''}
          onChange={(e) => onUpdateRatingRange('max', e.target.value)}
          className="w-20 px-3 py-2 bg-decidarr-dark border border-gray-700 rounded-lg
                   text-white text-center focus:border-decidarr-primary outline-none text-sm"
        />
        <span className="text-gray-500 text-xs">/ 10</span>
      </div>
    </div>
  );
}
