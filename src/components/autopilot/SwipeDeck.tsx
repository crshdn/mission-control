'use client';


import { logger } from '@/lib/logger';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ListChecks } from 'lucide-react';
import { IdeaCard } from './IdeaCard';
import { UndoToast } from './UndoToast';
import { useSwipe } from '@/hooks/useSwipe';
import type { Idea, SwipeAction } from '@/lib/types';
import { shouldShowReviewAll } from './swipeDeck-utils';

interface SwipeDeckProps {
  productId: string;
}

interface LastSwipe {
  swipeId: string;
  ideaId: string;
  action: SwipeAction;
  idea: Idea;
  index: number; // position in deck when swiped
}

export function SwipeDeck({ productId }: SwipeDeckProps) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [initialIdeaCount, setInitialIdeaCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [animatingOut, setAnimatingOut] = useState<string | null>(null);
  const [sessionStats, setSessionStats] = useState({ approved: 0, rejected: 0, maybe: 0, fired: 0 });
  const [lastSwipe, setLastSwipe] = useState<LastSwipe | null>(null);

  const loadDeck = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${productId}/swipe/deck`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Failed to load deck' }));
        setError(errData.error || `Failed to load deck (${res.status})`);
        return;
      }
      const data = await res.json();
      setIdeas(data);
      setInitialIdeaCount(data.length);
      setCurrentIndex(0);
    } catch (err) {
      logger.error('Failed to load swipe deck:', err);
      setError('Failed to load deck. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    loadDeck();
  }, [loadDeck]);

  const handleSwipe = useCallback(async (action: SwipeAction, notes?: string) => {
    const idea = ideas[currentIndex];
    if (!idea) return;

    // Clear any existing undo toast (new swipe supersedes previous undo)
    setLastSwipe(null);

    const directionMap: Record<string, string> = {
      approve: 'right',
      reject: 'left',
      fire: 'up',
      maybe: 'down',
    };
    setAnimatingOut(directionMap[action]);

    try {
      const res = await fetch(`/api/products/${productId}/swipe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea_id: idea.id, action, notes }),
      });

      if (res.ok) {
        const result = await res.json();

        // Store for undo
        setLastSwipe({
          swipeId: result.swipeId,
          ideaId: idea.id,
          action,
          idea,
          index: currentIndex,
        });
      }

      setSessionStats(prev => ({
        ...prev,
        [action === 'fire' ? 'fired' : action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'maybe']:
          prev[action === 'fire' ? 'fired' : action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'maybe'] + 1,
      }));
    } catch (error) {
      logger.error('Failed to record swipe:', error);
    }

    setTimeout(() => {
      setAnimatingOut(null);
      setCurrentIndex(prev => prev + 1);
    }, 300);
  }, [ideas, currentIndex, productId]);

  const handleUndo = useCallback((restoredIdea: unknown) => {
    if (!lastSwipe) return;

    const idea = restoredIdea as Idea;
    const action = lastSwipe.action;

    // Insert the idea back at the current position (before the current card)
    setIdeas(prev => {
      const newIdeas = [...prev];
      // Insert before current index
      newIdeas.splice(currentIndex, 0, idea);
      return newIdeas;
    });

    // Move index back to show the restored card
    setCurrentIndex(prev => prev);

    // Decrement the session stats
    setSessionStats(prev => ({
      ...prev,
      [action === 'fire' ? 'fired' : action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'maybe']:
        Math.max(0, prev[action === 'fire' ? 'fired' : action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'maybe'] - 1),
    }));

    setLastSwipe(null);
  }, [lastSwipe, currentIndex]);

  const handleUndoExpire = useCallback(() => {
    setLastSwipe(null);
  }, []);

  const swipeDirectionToAction = useCallback((direction: string | null): SwipeAction | null => {
    switch (direction) {
      case 'right': return 'approve';
      case 'left': return 'reject';
      case 'up': return 'fire';
      case 'down': return 'maybe';
      default: return null;
    }
  }, []);

  const { offsetX, offsetY, direction, handlers } = useSwipe({
    onSwipe: (dir) => {
      const action = swipeDirectionToAction(dir);
      if (action) handleSwipe(action);
    },
  });

  const currentIdea = ideas[currentIndex];
  const remaining = ideas.length - currentIndex;

  const showReviewAll = shouldShowReviewAll(initialIdeaCount);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-autensa-text-secondary animate-pulse">Loading ideas...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="text-red-400 text-lg">Error</div>
        <p className="text-sm text-autensa-text-secondary">{error}</p>
        <button
          onClick={loadDeck}
          className="px-4 py-2 bg-autensa-accent/20 text-autensa-accent rounded-lg hover:bg-autensa-accent/30 transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!currentIdea || remaining <= 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="text-4xl">&#10024;</div>
        <h3 className="text-lg font-semibold text-autensa-text">All caught up!</h3>
        <p className="text-sm text-autensa-text-secondary">No more ideas to review right now.</p>
        <div className="flex gap-4 text-sm text-autensa-text-secondary">
          <span className="text-green-400">{sessionStats.approved + sessionStats.fired} approved</span>
          <span className="text-red-400">{sessionStats.rejected} rejected</span>
          <span className="text-amber-400">{sessionStats.maybe} maybe</span>
        </div>
        <button
          onClick={loadDeck}
          className="px-4 py-2 bg-autensa-accent/20 text-autensa-accent rounded-lg hover:bg-autensa-accent/30 transition-colors"
        >
          Refresh deck
        </button>
      </div>
    );
  }

  // Card animation styles
  const getCardStyle = () => {
    if (animatingOut) {
      const transforms: Record<string, string> = {
        left: 'translateX(-120%) rotate(-15deg)',
        right: 'translateX(120%) rotate(15deg)',
        up: 'translateY(-120%) scale(1.1)',
        down: 'translateY(120%) scale(0.9)',
      };
      return {
        transform: transforms[animatingOut],
        opacity: 0,
        transition: 'transform 0.3s ease-out, opacity 0.3s ease-out',
      };
    }
    if (offsetX !== 0 || offsetY !== 0) {
      const rotation = offsetX * 0.1;
      return {
        transform: `translate(${offsetX}px, ${offsetY}px) rotate(${rotation}deg)`,
        transition: 'none',
      };
    }
    return { transition: 'transform 0.2s ease-out' };
  };

  // Direction indicator
  const getOverlayColor = () => {
    if (!direction) return 'transparent';
    switch (direction) {
      case 'right': return 'rgba(34, 197, 94, 0.15)';
      case 'left': return 'rgba(239, 68, 68, 0.15)';
      case 'up': return 'rgba(249, 115, 22, 0.15)';
      case 'down': return 'rgba(245, 158, 11, 0.15)';
      default: return 'transparent';
    }
  };

  return (
    <div className="flex flex-col items-center space-y-6">
      {/* Progress + Review All */}
      <div className="flex items-center gap-4">
        <div className="text-sm text-autensa-text-secondary">
          {currentIndex + 1} / {ideas.length} ideas
        </div>
        {showReviewAll && (
          <Link
            href={`/autopilot/${productId}/review`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-autensa-accent/20 text-autensa-accent rounded-lg hover:bg-autensa-accent/30 transition-colors"
          >
            <ListChecks className="w-3.5 h-3.5" />
            Review All ({remaining})
          </Link>
        )}
      </div>

      {/* Card stack */}
      <div
        className="relative select-none touch-none"
        style={{ perspective: '1000px' }}
        {...handlers}
      >
        {/* Background card (hint only — no content bleed) */}
        {ideas[currentIndex + 1] && (
          <div className="absolute inset-2 top-3 rounded-xl bg-autensa-bg-secondary border border-autensa-border opacity-30 pointer-events-none" />
        )}
        {ideas[currentIndex + 2] && (
          <div className="absolute inset-4 top-5 rounded-xl bg-autensa-bg-secondary border border-autensa-border opacity-15 pointer-events-none" />
        )}

        {/* Active card */}
        <div
          className="relative z-10"
          style={{
            ...getCardStyle(),
            backgroundColor: getOverlayColor(),
            borderRadius: '0.75rem',
          }}
        >
          <IdeaCard
            idea={currentIdea}
            onAction={(action, notes) => handleSwipe(action, notes)}
          />
        </div>

        {/* Direction label */}
        {direction && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-lg font-bold pointer-events-none z-10">
            {direction === 'right' && <span className="text-green-400">YES</span>}
            {direction === 'left' && <span className="text-red-400">PASS</span>}
            {direction === 'up' && <span className="text-orange-400">BUILD NOW!</span>}
            {direction === 'down' && <span className="text-amber-400">MAYBE</span>}
          </div>
        )}
      </div>

      {/* Session stats */}
      <div className="flex gap-4 text-xs text-autensa-text-secondary">
        <span>Remaining: {remaining}</span>
        <span className="text-green-400">{sessionStats.approved} yes</span>
        <span className="text-orange-400">{sessionStats.fired} now</span>
        <span className="text-amber-400">{sessionStats.maybe} maybe</span>
        <span className="text-red-400">{sessionStats.rejected} pass</span>
      </div>

      {/* Keyboard hint */}
      <div className="text-xs text-autensa-text-secondary/50">
        &larr; Pass &middot; &darr; Maybe &middot; &rarr; Yes &middot; &uarr; Build Now
      </div>

      {/* Undo toast — fixed at bottom */}
      {lastSwipe && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <UndoToast
            key={lastSwipe.swipeId}
            swipeId={lastSwipe.swipeId}
            ideaTitle={lastSwipe.idea.title}
            action={lastSwipe.action}
            productId={productId}
            onUndo={handleUndo}
            onExpire={handleUndoExpire}
          />
        </div>
      )}
    </div>
  );
}
