'use client';

import { forwardRef, useState, useEffect, useRef, useImperativeHandle, useCallback } from 'react';
import { motion } from 'framer-motion';
import { AnimationSpeed, PlexItem } from './types';
import { getAnimationDurationMs } from './utils';
import type { SpinAnimationHandle } from './SpinAnimationHandle';

const SEGMENT_COUNT = 8;
const SEGMENT_HEIGHT = 56;

interface WheelAnimationProps {
  result: PlexItem;
  speed: AnimationSpeed;
  reducedMotion: boolean;
  onComplete: () => void;
}

function buildSegments(result: PlexItem) {
  const winnerIndex = 3;
  const placeholders = ['Action', 'Comedy', 'Drama', 'Sci-Fi', 'Horror', 'Romance', 'Thriller', 'Docs'];
  return placeholders.map((label, i) => ({
    label: i === winnerIndex ? result.title : label,
    isWinner: i === winnerIndex,
  }));
}

export const WheelOfFortuneAnimation = forwardRef<SpinAnimationHandle, WheelAnimationProps>(
  function WheelOfFortuneAnimation({ result, speed, reducedMotion, onComplete }, ref) {
    const segments = buildSegments(result);
    const [offset, setOffset] = useState(0);
    const [stopped, setStopped] = useState(false);
    const completedRef = useRef(false);

    const winnerIndex = segments.findIndex((s) => s.isWinner);
    const targetOffset = -(winnerIndex * SEGMENT_HEIGHT + SEGMENT_HEIGHT / 2 - 120);

    const finish = useCallback(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      onComplete();
    }, [onComplete]);

    const skip = useCallback(() => {
      setOffset(targetOffset);
      setStopped(true);
      finish();
    }, [targetOffset, finish]);

    useImperativeHandle(ref, () => ({ skip, duration: speed }), [skip, speed]);

    useEffect(() => {
      completedRef.current = false;
      if (reducedMotion) {
        setOffset(targetOffset);
        setStopped(true);
        finish();
        return;
      }

      const durationMs = getAnimationDurationMs('wheel', speed);
      const startOffset = targetOffset - SEGMENT_HEIGHT * SEGMENT_COUNT * 4;
      setOffset(startOffset);
      const start = performance.now();

      const tick = (now: number) => {
        const t = Math.min((now - start) / durationMs, 1);
        const eased = 1 - Math.pow(1 - t, 4);
        setOffset(startOffset + (targetOffset - startOffset) * eased);
        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          setStopped(true);
          finish();
        }
      };

      requestAnimationFrame(tick);
    }, [reducedMotion, targetOffset, speed, finish]);

    const colors = ['#e11d48', '#2563eb', '#16a34a', '#ca8a04', '#9333ea', '#0891b2', '#ea580c', '#4f46e5'];

    return (
      <div className="flex flex-col items-center">
        <div className="relative w-64 h-60 overflow-hidden rounded-xl border-4 border-yellow-400 bg-gray-900 shadow-2xl">
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 z-10 flex justify-center pointer-events-none">
            <div className="w-0 h-0 border-l-[14px] border-r-[14px] border-t-[20px] border-l-transparent border-r-transparent border-t-yellow-300" />
          </div>
          <div
            className="absolute left-0 right-0 transition-none"
            style={{ transform: `translateY(${offset + 120}px)` }}
          >
            {[...segments, ...segments, ...segments].map((seg, i) => (
              <div
                key={i}
                className={`flex items-center justify-center px-3 text-center font-bold text-sm border-b border-black/30
                  ${seg.isWinner && stopped ? 'ring-2 ring-yellow-300 ring-inset' : ''}`}
                style={{
                  height: SEGMENT_HEIGHT,
                  background: colors[i % colors.length],
                  color: '#fff',
                }}
              >
                <span className="line-clamp-2">{seg.label}</span>
              </div>
            ))}
          </div>
        </div>
        {stopped && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 text-decidarr-primary font-semibold text-center max-w-xs"
          >
            {result.title}
          </motion.p>
        )}
      </div>
    );
  }
);
