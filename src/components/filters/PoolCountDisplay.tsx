interface PoolCountDisplayProps {
  poolCount?: number | null;
  totalItems?: number;
  emptyReason?: string | null;
  loadingPoolCount?: boolean;
}

export default function PoolCountDisplay({
  poolCount,
  totalItems,
  emptyReason,
  loadingPoolCount,
}: PoolCountDisplayProps) {
  return (
    <div className={`p-3 rounded-lg ${
      loadingPoolCount
        ? 'bg-gray-700/50'
        : poolCount === 0
          ? 'bg-red-900/30 border border-red-700/50'
          : 'bg-green-900/30 border border-green-700/50'
    }`}>
      {loadingPoolCount ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <span className="animate-pulse">Calculating...</span>
        </div>
      ) : poolCount === 0 ? (
        <div className="text-sm">
          <div className="flex items-center gap-2 text-red-400 font-medium">
            <span>No items match your filters</span>
          </div>
          {emptyReason && (
            <p className="text-red-300/70 text-xs mt-1">{emptyReason}</p>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between text-sm">
          <span className="text-green-400">
            <span className="font-bold">{poolCount}</span>
            {totalItems && poolCount !== totalItems && (
              <span className="text-green-400/70"> / {totalItems}</span>
            )}
            <span className="ml-1">items match</span>
          </span>
        </div>
      )}
    </div>
  );
}
