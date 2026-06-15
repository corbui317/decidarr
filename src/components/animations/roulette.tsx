'use client';

import { forwardRef, useState, useEffect, useRef, useImperativeHandle, useCallback } from 'react';
import { motion } from 'framer-motion';
import { AnimationSpeed, PlexItem } from './types';
import { getAnimationDurationMs, getPosterUrl } from './utils';
import type { SpinAnimationHandle } from './SpinAnimationHandle';

const POCKET_COUNT = 12;
const POCKET_COLORS = ['#c41e3a', '#1a1a1a'] as const;

interface RouletteAnimationProps {
  result: PlexItem;
  speed: AnimationSpeed;
  reducedMotion: boolean;
  onComplete: () => void;
}

function buildPockets(result: PlexItem) {
  const winnerIndex = Math.floor(POCKET_COUNT / 2);
  const pockets: { label: string; poster: string | null; isWinner: boolean }[] = [];
  for (let i = 0; i < POCKET_COUNT; i++) {
    const isWinner = i === winnerIndex;
    pockets.push({
      label: isWinner ? result.title.slice(0, 8) : `•${i + 1}`,
      poster: isWinner ? getPosterUrl(result) : null,
      isWinner,
    });
  }
  return { pockets, winnerIndex };
}

export const RouletteAnimation = forwardRef<SpinAnimationHandle, RouletteAnimationProps>(
  function RouletteAnimation({ result, speed, reducedMotion, onComplete }, ref) {
    const { pockets, winnerIndex } = buildPockets(result);
    const [rotation, setRotation] = useState(0);
    const [stopped, setStopped] = useState(false);
    const completedRef = useRef(false);

    const segmentAngle = 360 / POCKET_COUNT;
    const finish = useCallback(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      onComplete();
    }, [onComplete]);

    const targetRotation = 360 * 5 + (360 - winnerIndex * segmentAngle - segmentAngle / 2);

    const skip = useCallback(() => {
      setRotation(targetRotation);
      setStopped(true);
      finish();
    }, [targetRotation, finish]);

    useImperativeHandle(ref, () => ({ skip, duration: speed }), [skip, speed]);

    useEffect(() => {
      completedRef.current = false;
      if (reducedMotion) {
        setRotation(targetRotation);
        setStopped(true);
        finish();
        return;
      }

      const durationMs = getAnimationDurationMs('roulette', speed);
      const start = performance.now();

      const tick = (now: number) => {
        const t = Math.min((now - start) / durationMs, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        setRotation(targetRotation * eased);
        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          setStopped(true);
          finish();
        }
      };

      requestAnimationFrame(tick);
    }, [reducedMotion, targetRotation, speed, finish]);

    return (
      <div className="flex flex-col items-center">
        <div className="relative w-72 h-72">
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10 text-2xl">▼</div>
          <motion.div
            className="w-full h-full rounded-full border-4 border-yellow-500 shadow-2xl overflow-hidden"
            style={{ rotate: rotation }}
          >
            <svg viewBox="0 0 200 200" className="w-full h-full">
              {pockets.map((pocket, i) => {
                const startAngle = (i * segmentAngle - 90) * (Math.PI / 180);
                const endAngle = ((i + 1) * segmentAngle - 90) * (Math.PI / 180);
                const x1 = 100 + 95 * Math.cos(startAngle);
                const y1 = 100 + 95 * Math.sin(startAngle);
                const x2 = 100 + 95 * Math.cos(endAngle);
                const y2 = 100 + 95 * Math.sin(endAngle);
                const largeArc = segmentAngle > 180 ? 1 : 0;
                const color = POCKET_COLORS[i % 2];
                return (
                  <g key={i}>
                    <path
                      d={`M 100 100 L ${x1} ${y1} A 95 95 0 ${largeArc} 1 ${x2} ${y2} Z`}
                      fill={color}
                      stroke={pocket.isWinner && stopped ? '#fbbf24' : '#333'}
                      strokeWidth={pocket.isWinner && stopped ? 3 : 1}
                    />
                    {pocket.poster ? (
                      <image
                        href={pocket.poster}
                        x={75}
                        y={30}
                        width={50}
                        height={50}
                        transform={`rotate(${i * segmentAngle + segmentAngle / 2} 100 100)`}
                        clipPath="circle(50% at 50% 50%)"
                      />
                    ) : null}
                  </g>
                );
              })}
              <circle cx="100" cy="100" r="18" fill="#1f2937" stroke="#fbbf24" strokeWidth="2" />
            </svg>
          </motion.div>
          {stopped && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap
                         text-decidarr-primary font-bold text-sm"
            >
              {result.title}
            </motion.div>
          )}
        </div>
      </div>
    );
  }
);
