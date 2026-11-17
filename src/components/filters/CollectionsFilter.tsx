import { PlexCollection } from '@/lib/api';

interface CollectionsFilterProps {
  collections: PlexCollection[];
  selectedCollections: string[];
  onToggleCollection: (ratingKey: string) => void;
}

export default function CollectionsFilter({
  collections,
  selectedCollections,
  onToggleCollection,
}: CollectionsFilterProps) {
  if (collections.length === 0) return null;

  return (
    <div>
      <label className="block text-sm font-medium text-gray-400 mb-2">
        Collections
        {selectedCollections.length > 0 && (
          <span className="ml-2 text-decidarr-primary">({selectedCollections.length})</span>
        )}
      </label>
      <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
        {collections.map((collection) => (
          <button
            key={collection.ratingKey}
            type="button"
            onClick={() => onToggleCollection(collection.ratingKey)}
            aria-pressed={selectedCollections.includes(collection.ratingKey)}
            className={`px-3 py-1 rounded-full text-sm transition ${
              selectedCollections.includes(collection.ratingKey)
                ? 'bg-decidarr-primary text-decidarr-dark'
                : 'bg-decidarr-dark text-gray-300 hover:text-white'
            }`}
            title={`${collection.childCount} items`}
          >
            {collection.title}
          </button>
        ))}
      </div>
    </div>
  );
}
