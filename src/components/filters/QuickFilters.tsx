interface QuickFiltersProps {
  unwatchedOnly: boolean;
  onToggleUnwatched: () => void;
}

export default function QuickFilters({
  unwatchedOnly,
  onToggleUnwatched,
}: QuickFiltersProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-400 mb-2">Quick Filters</label>
      <button
        type="button"
        onClick={onToggleUnwatched}
        aria-pressed={unwatchedOnly}
        className={`w-full flex items-center justify-between p-3 rounded-lg transition ${
          unwatchedOnly
            ? 'bg-decidarr-primary/20 border-2 border-decidarr-primary'
            : 'bg-decidarr-dark border-2 border-transparent'
        }`}
      >
        <span className="text-white">Only show unwatched</span>
        {unwatchedOnly && <span className="text-decidarr-primary">✓</span>}
      </button>
    </div>
  );
}
