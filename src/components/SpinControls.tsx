'use client';

import { motion } from 'framer-motion';
import LoadingSpinner from './LoadingSpinner';

interface SpinControlsProps {
  onSpin: () => void;
  loading: boolean;
  disabled: boolean;
  disabledReason?: 'no_library' | 'empty_pool' | 'loading';
  poolCount?: number | null;
}

export default function SpinControls({
  onSpin,
  loading,
  disabled,
  disabledReason,
  poolCount,
}: SpinControlsProps) {
  const handleClick = () => {
    if (!disabled && !loading) {
      onSpin();
    }
  };

  return (
    <div className="flex flex-col items-center">
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[280px] gap-4">
          <LoadingSpinner size="lg" />
          <p className="text-gray-400 animate-pulse">Finding your pick...</p>
        </div>
      ) : (
        <motion.button
          onClick={handleClick}
          disabled={disabled}
          whileHover={!disabled ? { scale: 1.05 } : {}}
          whileTap={!disabled ? { scale: 0.95 } : {}}
          className={`relative overflow-hidden rounded-full
                    ${disabled ? 'bg-gray-700 cursor-not-allowed' : 'bg-gradient-to-r from-decidarr-primary to-decidarr-accent cursor-pointer'}`}
        >
          <div
            className={`px-12 py-4 font-bold text-xl
                        ${disabled ? 'text-gray-500' : 'text-decidarr-dark'}`}
          >
            SPIN!
          </div>
          {!disabled && (
            <div
              className="absolute inset-0 bg-gradient-to-r from-transparent
                          via-white/30 to-transparent -translate-x-full
                          animate-[shimmer_2s_infinite]"
            />
          )}
        </motion.button>
      )}

      {disabled && !loading && (
        <p className="mt-4 text-gray-500 text-sm text-center">
          {disabledReason === 'empty_pool'
            ? 'No items match your current filters'
            : disabledReason === 'loading'
              ? 'Loading...'
              : 'Select at least one library to spin'}
        </p>
      )}

      {!disabled && !loading && poolCount !== null && poolCount !== undefined && poolCount > 0 && (
        <p className="mt-4 text-gray-400 text-sm text-center">
          <span className="text-decidarr-primary font-bold">{poolCount}</span> items in pool
        </p>
      )}
    </div>
  );
}
