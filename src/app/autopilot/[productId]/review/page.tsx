'use client';


import { logger } from '@/lib/logger';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Layers } from 'lucide-react';
import { BatchReviewList } from '@/components/autopilot/BatchReviewList';
import type { Idea } from '@/lib/types';

export default function BatchReviewPage() {
  const { productId } = useParams<{ productId: string }>();
  const router = useRouter();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadIdeas() {
      try {
        const res = await fetch(`/api/products/${productId}/ideas/pending?sort_by=impact_score&sort_dir=desc`);
        if (res.ok) {
          const data = await res.json();
          setIdeas(data);
        }
      } catch (error) {
        logger.error('Failed to load pending ideas:', error);
      } finally {
        setLoading(false);
      }
    }
    loadIdeas();
  }, [productId]);

  const handleBatchComplete = () => {
    // Navigate back to swipe deck or product page
    router.push(`/autopilot/${productId}/swipe`);
  };

  return (
    <div className="min-h-screen bg-autensa-bg flex flex-col">
      <header className="border-b border-autensa-border bg-autensa-bg-secondary px-4 py-3 flex items-center gap-3">
        <Link href={`/autopilot/${productId}/swipe`} className="text-autensa-text-secondary hover:text-autensa-text">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <Layers className="w-5 h-5 text-autensa-accent" />
        <h1 className="font-semibold text-autensa-text">Batch Review</h1>
        {!loading && (
          <span className="text-sm text-autensa-text-secondary ml-2">
            {ideas.length} pending ideas
          </span>
        )}
      </header>

      <main className="flex-1 flex flex-col">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-autensa-text-secondary animate-pulse">Loading ideas...</div>
          </div>
        ) : (
          <BatchReviewList
            productId={productId}
            ideas={ideas}
            onBatchComplete={handleBatchComplete}
          />
        )}
      </main>
    </div>
  );
}
