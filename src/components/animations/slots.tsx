'use client';

import { forwardRef, useState, useEffect, useRef, useImperativeHandle, useCallback } from 'react';
import { motion } from 'framer-motion';
import { AnimationSpeed, PlexItem } from './types';
import { getAnimationDurationMs } from './utils';
import type { SpinAnimationHandle } from './SpinAnimationHandle';

const SLOT_ICONS = ['🏆', '📺', '🍿', '🎬', '🎭'];

interface SlotsAnimationProps {
  result: PlexItem;
  speed: AnimationSpeed;
  reducedMotion: boolean;
  onComplete: () => void;
}

export const SlotsAnimation = forwardRef<SpinAnimationHandle, SlotsAnimationProps>(
  function SlotsAnimation({ speed, reducedMotion, onComplete }, ref) {
    const [displayIcons, setDisplayIcons] = useState([SLOT_ICONS[0], SLOT_ICONS[0], SLOT_ICONS[0]]);
    const [spinning, setSpinning] = useState(false);
    const intervalRefs = useRef<ReturnType<typeof setInterval>[]>([]);
    const timeoutRefs = useRef<ReturnType<typeof setTimeout>[]>([]);
    const completedRef = useRef(false);

    const finish = useCallback(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      onComplete();
    }, [onComplete]);

    const clearTimers = useCallback(() => {
      intervalRefs.current.forEach(clearInterval);
      intervalRefs.current = [];
      timeoutRefs.current.forEach(clearTimeout);
      timeoutRefs.current = [];
    }, []);

    const landReels = useCallback(() => {
      setDisplayIcons([
        SLOT_ICONS[Math.floor(Math.random() * SLOT_ICONS.length)],
        SLOT_ICONS[Math.floor(Math.random() * SLOT_ICONS.length)],
        SLOT_ICONS[Math.floor(Math.random() * SLOT_ICONS.length)],
      ]);
      setSpinning(false);
    }, []);

    const runAnimation = useCallback(() => {
      if (reducedMotion) {
        landReels();
        finish();
        return;
      }

      clearTimers();
      setSpinning(true);
      const durationMs = getAnimationDurationMs('slots', speed);
      const spinMs = Math.max(durationMs - 600, 400);

      intervalRefs.current = [0, 1, 2].map((reelIndex) => {
        const reelSpeed = 80 + reelIndex * 20;
        return setInterval(() => {
          setDisplayIcons((prev) => {
            const next = [...prev];
            next[reelIndex] = SLOT_ICONS[Math.floor(Math.random() * SLOT_ICONS.length)];
            return next;
          });
        }, reelSpeed);
      });

      timeoutRefs.current.push(
        setTimeout(() => {
          clearTimers();
          [0, 1, 2].forEach((index) => {
            timeoutRefs.current.push(
              setTimeout(() => {
                setDisplayIcons((prev) => {
                  const next = [...prev];
                  next[index] = SLOT_ICONS[Math.floor(Math.random() * SLOT_ICONS.length)];
                  return next;
                });
                if (index === 2) {
                  setSpinning(false);
                  finish();
                }
              }, index * 200)
            );
          });
        }, spinMs)
      );
    }, [reducedMotion, speed, clearTimers, landReels, finish]);

    const skip = useCallback(() => {
      clearTimers();
      landReels();
      finish();
    }, [clearTimers, landReels, finish]);

    useImperativeHandle(ref, () => ({ skip, duration: speed }), [skip, speed]);

    useEffect(() => {
      completedRef.current = false;
      runAnimation();
      return clearTimers;
    }, [runAnimation, clearTimers]);

    return (
      <div className="flex flex-col items-center">
        <div className="relative">
          <div
            className="absolute -top-4 left-1/2 -translate-x-1/2 bg-decidarr-primary
                        px-6 py-1 rounded-t-lg text-decidarr-dark font-bold text-sm"
          >
            DECIDARR
          </div>
          <div
            className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-2xl p-6
                        border-4 border-decidarr-primary shadow-2xl"
          >
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
                  style={{ animationDelay: `${i * 100}ms` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
);
