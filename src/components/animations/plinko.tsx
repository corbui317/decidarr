'use client';

import { forwardRef, useState, useEffect, useRef, useImperativeHandle, useCallback } from 'react';
import { motion } from 'framer-motion';
import { AnimationSpeed, PlexItem } from './types';
import { getAnimationDurationMs, getPosterUrl } from './utils';
import type { SpinAnimationHandle } from './SpinAnimationHandle';

const ROWS = 6;
const COLS = 7;
const SLOT_COUNT = 7;

interface PlinkoAnimationProps {
  result: PlexItem;
  speed: AnimationSpeed;
  reducedMotion: boolean;
  onComplete: () => void;
}

export const PlinkoAnimation = forwardRef<SpinAnimationHandle, PlinkoAnimationProps>(
  function PlinkoAnimation({ result, speed, reducedMotion, onComplete }, ref) {
    const winnerSlot = Math.floor(SLOT_COUNT / 2);
    const [ballX, setBallX] = useState(50);
    const [ballY, setBallY] = useState(4);
    const [landed, setLanded] = useState(false);
    const completedRef = useRef(false);
    const rafRef = useRef<number | null>(null);

    const finish = useCallback(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      onComplete();
    }, [onComplete]);

    const skip = useCallback(() => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setBallX(14 + winnerSlot * (72 / (SLOT_COUNT - 1)));
      setBallY(92);
      setLanded(true);
      finish();
    }, [winnerSlot, finish]);

    useImperativeHandle(ref, () => ({ skip, duration: speed }), [skip, speed]);

    useEffect(() => {
      completedRef.current = false;
      const targetX = 14 + winnerSlot * (72 / (SLOT_COUNT - 1));

      if (reducedMotion) {
        setBallX(targetX);
        setBallY(92);
        setLanded(true);
        finish();
        return;
      }

      const durationMs = getAnimationDurationMs('plinko', speed);
      const path: { x: number; y: number }[] = [{ x: 50, y: 4 }];
      let x = 50;
      let y = 8;

      for (let row = 0; row < ROWS; row++) {
        const drift = (Math.random() - 0.5) * 8;
        const towardTarget = (targetX - x) * 0.35;
        x = Math.max(12, Math.min(88, x + drift + towardTarget));
        y += 12;
        path.push({ x, y });
      }
      path.push({ x: targetX, y: 92 });

      const start = performance.now();

      const tick = (now: number) => {
        const t = Math.min((now - start) / durationMs, 1);
        const eased = 1 - Math.pow(1 - t, 2);
        const pathIndex = eased * (path.length - 1);
        const i = Math.floor(pathIndex);
        const frac = pathIndex - i;
        const a = path[i];
        const b = path[Math.min(i + 1, path.length - 1)];
        setBallX(a.x + (b.x - a.x) * frac);
        setBallY(a.y + (b.y - a.y) * frac);

        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          setLanded(true);
          finish();
        }
      };

      rafRef.current = requestAnimationFrame(tick);
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }, [reducedMotion, speed, winnerSlot, finish]);

    const poster = getPosterUrl(result);
    const slotLabels = Array.from({ length: SLOT_COUNT }, (_, i) =>
      i === winnerSlot ? result.title.slice(0, 10) : `Slot ${i + 1}`
    );

    return (
      <div className="flex flex-col items-center">
        <div className="relative w-72 h-80 bg-gradient-to-b from-gray-900 to-gray-800 rounded-xl border-2 border-decidarr-primary p-2">
          {/* Pegs */}
          {Array.from({ length: ROWS }).map((_, row) =>
            Array.from({ length: row + 2 }).map((_, col) => {
              const pegX = 50 + (col - (row + 1) / 2) * 14;
              const pegY = 18 + row * 12;
              return (
                <div
                  key={`${row}-${col}`}
                  className="absolute w-2 h-2 rounded-full bg-gray-400"
                  style={{ left: `${pegX}%`, top: `${pegY}%`, transform: 'translate(-50%, -50%)' }}
                />
              );
            })
          )}

          {/* Ball */}
          <motion.div
            className="absolute w-5 h-5 rounded-full bg-decidarr-primary shadow-lg z-10"
            style={{
              left: `${ballX}%`,
              top: `${ballY}%`,
              transform: 'translate(-50%, -50%)',
            }}
          />

          {/* Slots */}
          <div className="absolute bottom-2 left-2 right-2 flex gap-1">
            {slotLabels.map((label, i) => (
              <div
                key={i}
                className={`flex-1 h-14 rounded text-[9px] font-bold flex items-end justify-center pb-1 text-center overflow-hidden
                  ${i === winnerSlot && landed ? 'bg-decidarr-primary/40 ring-2 ring-decidarr-primary' : 'bg-gray-700/80'}`}
              >
                {i === winnerSlot && poster ? (
                  <img src={poster} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60 rounded" />
                ) : null}
                <span className="relative z-[1] text-white line-clamp-2">{label}</span>
              </div>
            ))}
          </div>
        </div>
        {landed && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-3 text-decidarr-primary font-semibold"
          >
            {result.title}
          </motion.p>
        )}
      </div>
    );
  }
);
