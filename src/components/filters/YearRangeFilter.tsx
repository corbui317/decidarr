interface YearRangeFilterProps {
  yearRange: { min: number; max: number };
  selectedYearRange: { start?: number; end?: number } | null;
  onUpdateYearRange: (key: 'start' | 'end', value: string) => void;
}

export default function YearRangeFilter({
  yearRange,
  selectedYearRange,
  onUpdateYearRange,
}: YearRangeFilterProps) {
  return (
    <div>
      <span id="year-range-label" className="block text-sm font-medium text-gray-400 mb-2">Year Range</span>
      <div className="flex items-center gap-2" role="group" aria-labelledby="year-range-label">
        <label htmlFor="filter-year-start" className="sr-only">Year from</label>
        <input
          id="filter-year-start"
          type="number"
          placeholder={String(yearRange.min)}
          value={selectedYearRange?.start || ''}
          onChange={(e) => onUpdateYearRange('start', e.target.value)}
          className="w-24 px-3 py-2 bg-decidarr-dark border border-gray-700 rounded-lg
                   text-white text-center focus:border-decidarr-primary outline-none"
        />
        <span className="text-gray-500">to</span>
        <label htmlFor="filter-year-end" className="sr-only">Year to</label>
        <input
          id="filter-year-end"
          type="number"
          placeholder={String(yearRange.max)}
          value={selectedYearRange?.end || ''}
          onChange={(e) => onUpdateYearRange('end', e.target.value)}
          className="w-24 px-3 py-2 bg-decidarr-dark border border-gray-700 rounded-lg
                   text-white text-center focus:border-decidarr-primary outline-none"
        />
      </div>
    </div>
  );
}
