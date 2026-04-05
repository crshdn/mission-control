'use client';


import { logger } from '@/lib/logger';
import { useState, useEffect } from 'react';
import { IdeaCard } from './IdeaCard';
import type { Idea } from '@/lib/types';

interface IdeasListProps {
  productId: string;
}

export function IdeasList({ productId }: IdeasListProps) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams();
        if (statusFilter) params.set('status', statusFilter);
        if (categoryFilter) params.set('category', categoryFilter);
        const res = await fetch(`/api/products/${productId}/ideas?${params}`);
        if (res.ok) setIdeas(await res.json());
      } catch (error) {
        logger.error('Failed to load ideas:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [productId, statusFilter, categoryFilter]);

  const statuses = ['', 'pending', 'approved', 'rejected', 'maybe', 'building', 'built', 'shipped'];
  const categories = ['', 'feature', 'improvement', 'ux', 'performance', 'integration', 'infrastructure', 'content', 'growth', 'monetization', 'operations', 'security'];

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-mc-bg-tertiary border border-mc-border rounded-lg px-3 py-2 text-sm text-mc-text"
        >
          {statuses.map(s => (
            <option key={s} value={s}>{s || 'All statuses'}</option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="bg-mc-bg-tertiary border border-mc-border rounded-lg px-3 py-2 text-sm text-mc-text"
        >
          {categories.map(c => (
            <option key={c} value={c}>{c || 'All categories'}</option>
          ))}
        </select>
        <span className="text-sm text-mc-text-secondary self-center">{ideas.length} ideas</span>
      </div>

      {loading ? (
        <div className="text-mc-text-secondary animate-pulse py-8 text-center">Loading ideas...</div>
      ) : ideas.length === 0 ? (
        <div className="text-center py-12 text-mc-text-secondary">No ideas found</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {ideas.map(idea => (
            <IdeaCard key={idea.id} idea={idea} showActions={false} compact />
          ))}
        </div>
      )}
    </div>
  );
}
