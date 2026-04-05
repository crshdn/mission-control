'use client';


import { logger } from '@/lib/logger';
import { useState, useEffect, useCallback } from 'react';
import { Undo2 } from 'lucide-react';
import type { SwipeAction } from '@/lib/types';

interface UndoToastProps {
  swipeId: string;
  ideaTitle: string;
  action: SwipeAction;
  productId: string;
  onUndo: (restoredIdea: unknown) => void;
  onExpire: () => void;
}

const ACTION_LABELS: Record<SwipeAction, string> = {
  approve: 'Approved',
  reject: 'Rejected',
  maybe: 'Maybe\'d',
  fire: 'Fired',
};

const ACTION_COLORS: Record<SwipeAction, string> = {
  approve: 'bg-green-500/20 border-green-500/40 text-green-300',
  reject: 'bg-red-500/20 border-red-500/40 text-red-300',
  maybe: 'bg-amber-500/20 border-amber-500/40 text-amber-300',
  fire: 'bg-orange-500/20 border-orange-500/40 text-orange-300',
};

const UNDO_DURATION_MS = 10_000;
const TICK_INTERVAL_MS = 100;

export function UndoToast({ swipeId, ideaTitle, action, productId, onUndo, onExpire }: UndoToastProps) {
  const [remainingMs, setRemainingMs] = useState(UNDO_DURATION_MS);
  const [undoing, setUndoing] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingMs(prev => {
        const next = prev - TICK_INTERVAL_MS;
        if (next <= 0) {
          clearInterval(interval);
          onExpire();
          return 0;
        }
        return next;
      });
    }, TICK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [onExpire]);

  const handleUndo = useCallback(async () => {
    if (undoing) return;
    setUndoing(true);
    try {
      const res = await fetch(`/api/products/${productId}/swipe/${swipeId}/undo`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const data = await res.json();
        onUndo(data.idea);
      } else {
        const err = await res.json().catch(() => ({ error: 'Undo failed' }));
        logger.error('Undo failed:', err.error);
        // If expired server-side, just dismiss
        onExpire();
      }
    } catch (error) {
      logger.error('Undo request failed:', error);
      onExpire();
    }
  }, [swipeId, productId, onUndo, onExpire, undoing]);

  const progress = remainingMs / UNDO_DURATION_MS;
  const remainingSec = Math.ceil(remainingMs / 1000);
  const truncatedTitle = ideaTitle.length > 40 ? ideaTitle.slice(0, 37) + '...' : ideaTitle;

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border backdrop-blur-sm shadow-lg max-w-md animate-slide-in ${ACTION_COLORS[action]}`}>
      {/* Progress ring */}
      <div className="relative w-8 h-8 shrink-0">
        <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
          <circle
            cx="16" cy="16" r="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            opacity="0.2"
          />
          <circle
            cx="16" cy="16" r="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray={`${progress * 81.68} 81.68`}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">
          {remainingSec}
        </span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {ACTION_LABELS[action]}: {truncatedTitle}
        </p>
      </div>

      {/* Undo button */}
      <button
        onClick={handleUndo}
        disabled={undoing}
        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors disabled:opacity-50"
      >
        <Undo2 className="w-3.5 h-3.5" />
        {undoing ? 'Undoing...' : 'Undo'}
      </button>
    </div>
  );
}
