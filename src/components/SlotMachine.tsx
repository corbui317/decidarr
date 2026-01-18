'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

const SLOT_ICONS = ['🏆', '📺', '🍿', '🎬', '🎭'];

interface SlotMachineProps {
  onSpin: () => void;
  spinning: boolean;
  disabled: boolean;
  disabledReason?: 'no_library' | 'empty_pool' | 'loading';
  poolCount?: number | null;
}

export default function SlotMachine({ onSpin, spinning, disabled, disabledReason, poolCount }: SlotMachineProps) {
  const [displayIcons, setDisplayIcons] = useState([
    SLOT_ICONS[0],
    SLOT_ICONS[0],
    SLOT_ICONS[0],
  ]);
  const intervalRefs = useRef<NodeJS.Timeout[]>([]);

  useEffect(() => {
    if (spinning) {
      startSpinning();
    } else {
      stopSpinning();
    }

    return () => {
      intervalRefs.current.forEach(clearInterval);
    };
  }, [spinning]);

  const startSpinning = () => {
    intervalRefs.current.forEach(clearInterval);
    intervalRefs.current = [];

    [0, 1, 2].forEach((reelIndex) => {
      const speed = 80 + reelIndex * 20;
      const interval = setInterval(() => {
        setDisplayIcons((prev) => {
          const newIcons = [...prev];
          newIcons[reelIndex] = SLOT_ICONS[Math.floor(Math.random() * SLOT_ICONS.length)];
          return newIcons;
        });
      }, speed);
      intervalRefs.current.push(interval);
    });
  };

  const stopSpinning = () => {
    intervalRefs.current.forEach((interval, index) => {
      setTimeout(() => {
        clearInterval(interval);
        setDisplayIcons((prev) => {
          const newIcons = [...prev];
          newIcons[index] = SLOT_ICONS[Math.floor(Math.random() * SLOT_ICONS.length)];
          return newIcons;
        });
      }, index * 200);
    });
  };

  const handleClick = () => {
    if (!disabled && !spinning) {
      onSpin();
    }
  };

  return (
    <div className="flex flex-col items-center">
      {/* Slot Machine Frame */}
      <div className="relative">
        {/* Top decoration */}
        <div
          className="absolute -top-4 left-1/2 -translate-x-1/2 bg-decidarr-primary
                      px-6 py-1 rounded-t-lg text-decidarr-dark font-bold text-sm"
        >
          DECIDARR
        </div>

        {/* Main machine body */}
        <div
          className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-2xl p-6
                      border-4 border-decidarr-primary shadow-2xl"
        >
          {/* Reels display */}
          <div className="flex gap-2 bg-black rounded-xl p-4 mb-4">
            {displayIcons.map((icon, index) => (
              <div
                key={index}
                className={`w-20 h-24 bg-gradient-to-b from-gray-100 to-gray-300
                          rounded-lg flex items-center justify-center text-5xl
                          shadow-inner border-2 border-gray-400
                          ${spinning ? 'animate-pulse' : ''}`}
              >
                <motion.span
                  key={`${index}-${icon}`}
                  initial={spinning ? { y: -20, opacity: 0 } : false}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.1 }}
                >
                  {icon}
                </motion.span>
              </div>
            ))}
          </div>

          {/* Decorative lights */}
          <div className="flex justify-center gap-2 mb-4">
            {[...Array(7)].map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full ${
                  spinning
                    ? i % 2 === 0
                      ? 'bg-decidarr-primary animate-pulse'
                      : 'bg-decidarr-accent animate-pulse'
                    : 'bg-gray-600'
                }`}
                style={{
                  animationDelay: `${i * 100}ms`,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Spin Button */}
      <motion.button
        onClick={handleClick}
        disabled={disabled || spinning}
        whileHover={!disabled && !spinning ? { scale: 1.05 } : {}}
        whileTap={!disabled && !spinning ? { scale: 0.95 } : {}}
        className={`mt-6 relative overflow-hidden rounded-full
                  ${
                    disabled || spinning
                      ? 'bg-gray-700 cursor-not-allowed'
                      : 'bg-gradient-to-r from-decidarr-primary to-decidarr-accent cursor-pointer'
                  }`}
      >
        <div
          className={`px-12 py-4 font-bold text-xl
                      ${disabled || spinning ? 'text-gray-500' : 'text-decidarr-dark'}`}
        >
          {spinning ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">🎲</span>
              Spinning...
            </span>
          ) : (
            'SPIN!'
          )}
        </div>

        {/* Animated shine effect */}
        {!disabled && !spinning && (
          <div
            className="absolute inset-0 bg-gradient-to-r from-transparent
                        via-white/30 to-transparent -translate-x-full
                        animate-[shimmer_2s_infinite]"
          />
        )}
      </motion.button>

      {/* Instructions */}
      {disabled && (
        <p className="mt-4 text-gray-500 text-sm text-center">
          {disabledReason === 'empty_pool'
            ? 'No items match your current filters'
            : disabledReason === 'loading'
            ? 'Loading...'
            : 'Select at least one library to spin'}
        </p>
      )}

      {/* Pool count indicator */}
      {!disabled && poolCount !== null && poolCount !== undefined && poolCount > 0 && (
        <p className="mt-4 text-gray-400 text-sm text-center">
          <span className="text-decidarr-primary font-bold">{poolCount}</span> items in pool
        </p>
      )}
    </div>
  );
}
