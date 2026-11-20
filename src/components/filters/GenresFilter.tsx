interface GenresFilterProps {
  genres: string[];
  selectedGenres: string[];
  onToggleGenre: (genre: string) => void;
}

export default function GenresFilter({
  genres,
  selectedGenres,
  onToggleGenre,
}: GenresFilterProps) {
  if (genres.length === 0) return null;

  return (
    <div>
      <label className="block text-sm font-medium text-gray-400 mb-2">
        Genres
        {selectedGenres.length > 0 && (
          <span className="ml-2 text-decidarr-primary">({selectedGenres.length})</span>
        )}
      </label>
      <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
        {genres.map((genre) => (
          <button
            key={genre}
            type="button"
            onClick={() => onToggleGenre(genre)}
            aria-pressed={selectedGenres.includes(genre)}
            className={`px-3 py-1 rounded-full text-sm transition ${
              selectedGenres.includes(genre)
                ? 'bg-decidarr-primary text-decidarr-dark'
                : 'bg-decidarr-dark text-gray-300 hover:text-white'
            }`}
          >
            {genre}
          </button>
        ))}
      </div>
    </div>
  );
}
