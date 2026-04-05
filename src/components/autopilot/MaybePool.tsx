'use client';


import { logger } from '@/lib/logger';
import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { IdeaCard } from './IdeaCard';
import type { Idea, MaybePoolEntry } from '@/lib/types';

interface MaybePoolProps {
  productId: string;
}

export function MaybePool({ productId }: MaybePoolProps) {
  const [entries, setEntries] = useState<(MaybePoolEntry & { idea: Idea })[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPool = useCallback(async () => {
    try {
      const res = await fetch(`/api/products/${productId}/maybe`);
      if (res.ok) setEntries(await res.json());
    } catch (error) {
      logger.error('Failed to load maybe pool:', error);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => { loadPool(); }, [loadPool]);

  const handleResurface = async (ideaId: string) => {
    try {
      await fetch(`/api/products/${productId}/maybe/${ideaId}/resurface`, { method: 'POST' });
      loadPool();
    } catch (error) {
      logger.error('Failed to resurface idea:', error);
    }
  };

  const handleEvaluate = async () => {
    try {
      await fetch(`/api/products/${productId}/maybe/evaluate`, { method: 'POST' });
      loadPool();
    } catch (error) {
      logger.error('Failed to evaluate pool:', error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-autensa-text">Maybe Pool ({entries.length})</h3>
        <button
          onClick={handleEvaluate}
          className="min-h-11 px-4 rounded-lg border border-autensa-border text-autensa-text-secondary hover:bg-autensa-bg-tertiary flex items-center gap-2 text-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Re-evaluate
        </button>
      </div>

      {loading ? (
        <div className="text-autensa-text-secondary animate-pulse">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 text-autensa-text-secondary">No ideas in the maybe pool</div>
      ) : (
        <div className="space-y-4">
          {entries.map(entry => (
            <div key={entry.id} className="relative">
              <IdeaCard idea={entry.idea} showActions={false} compact />
              <div className="mt-2 flex items-center justify-between px-2">
                <span className="text-xs text-autensa-text-secondary">
                  Evaluations: {entry.evaluation_count} · Next: {entry.next_evaluate_at ? new Date(entry.next_evaluate_at).toLocaleDateString() : 'N/A'}
                </span>
                <button
                  onClick={() => handleResurface(entry.idea_id)}
                  className="text-xs px-3 py-1.5 rounded bg-autensa-accent/20 text-autensa-accent hover:bg-autensa-accent/30"
                >
                  Resurface Now
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
