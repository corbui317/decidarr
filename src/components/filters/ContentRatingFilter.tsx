interface ContentRatingFilterProps {
  contentRatings: string[];
  selectedContentRatings: string[];
  dataAvailability: number;
  onToggleContentRating: (rating: string) => void;
}

export default function ContentRatingFilter({
  contentRatings,
  selectedContentRatings,
  dataAvailability,
  onToggleContentRating,
}: ContentRatingFilterProps) {
  if (contentRatings.length === 0) return null;

  return (
    <div>
      <label className="block text-sm font-medium text-gray-400 mb-2">
        Age Rating
        {selectedContentRatings.length > 0 && (
          <span className="ml-2 text-decidarr-primary">({selectedContentRatings.length})</span>
        )}
        {dataAvailability < 80 && (
          <span className="ml-2 text-yellow-500 text-xs" title="Percentage of items with age rating data">
            ({dataAvailability}% have data)
          </span>
        )}
      </label>
      <div className="flex flex-wrap gap-2">
        {contentRatings.map((rating) => (
          <button
            key={rating}
            type="button"
            onClick={() => onToggleContentRating(rating)}
            aria-pressed={selectedContentRatings.includes(rating)}
            className={`px-3 py-1 rounded-full text-sm transition ${
              selectedContentRatings.includes(rating)
                ? 'bg-decidarr-primary text-decidarr-dark'
                : 'bg-decidarr-dark text-gray-300 hover:text-white'
            }`}
          >
            {rating}
          </button>
        ))}
      </div>
    </div>
  );
}
