'use client';


import { logger } from '@/lib/logger';
import { useState, useEffect } from 'react';
import { Plus, Rocket, ArrowRight, Trash2 } from 'lucide-react';
import { DeleteProductModal } from '@/components/autopilot/DeleteProductModal';
import Link from 'next/link';
import { HealthBadge } from '@/components/autopilot/HealthBadge';
import type { Product } from '@/lib/types';

export default function AutopilotPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});
  const [healthScores, setHealthScores] = useState<Record<string, number>>({});
  const [deleteProduct, setDeleteProduct] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/products');
        if (res.ok) {
          const prods: Product[] = await res.json();
          setProducts(prods);

          // Fetch pending idea counts in parallel
          const counts: Record<string, number> = {};
          await Promise.all(prods.map(async (p) => {
            try {
              const r = await fetch(`/api/products/${p.id}/ideas/pending`);
              if (r.ok) {
                const ideas = await r.json();
                if (Array.isArray(ideas) && ideas.length > 0) counts[p.id] = ideas.length;
              }
            } catch { /* skip */ }
          }));
          setPendingCounts(counts);

          // Fetch health scores
          try {
            const healthRes = await fetch('/api/products/health-scores');
            if (healthRes.ok) {
              const scores = await healthRes.json();
              setHealthScores(scores);
            }
          } catch { /* skip */ }
        }
      } catch (error) {
        logger.error('Failed to load products:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Listen for SSE health score updates
  useEffect(() => {
    function handleHealthUpdate(e: Event) {
      const { productId, score } = (e as CustomEvent).detail;
      setHealthScores(prev => ({ ...prev, [productId]: score }));
    }
    window.addEventListener('health-score-updated', handleHealthUpdate);
    return () => window.removeEventListener('health-score-updated', handleHealthUpdate);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🚀</div>
          <p className="text-mc-text-secondary">Loading autopilot...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mc-bg">
      <header className="border-b border-mc-border bg-mc-bg-secondary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Rocket className="w-6 h-6 text-mc-accent-cyan" />
              <h1 className="text-xl font-bold text-mc-text">Product Autopilot</h1>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/" className="min-h-11 px-4 rounded-lg border border-mc-border bg-mc-bg text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary flex items-center gap-2 text-sm">
                Workspaces
              </Link>
              <Link
                href="/autopilot/new"
                className="min-h-11 px-4 rounded-lg bg-mc-accent text-white hover:bg-mc-accent/90 flex items-center gap-2 text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                New Product
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {products.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-6">🚀</div>
            <h2 className="text-2xl font-bold text-mc-text mb-3">No products yet</h2>
            <p className="text-mc-text-secondary mb-8 max-w-md mx-auto">
              Create your first product to start the autonomous development loop.
              Agents will research, ideate, and you swipe to decide what gets built.
            </p>
            <Link
              href="/autopilot/new"
              className="inline-flex items-center gap-2 px-6 py-3 bg-mc-accent text-white rounded-lg hover:bg-mc-accent/90 font-medium"
            >
              <Plus className="w-5 h-5" />
              Create First Product
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map(product => (
              <Link
                key={product.id}
                href={`/autopilot/${product.id}`}
                className="group block bg-mc-bg-secondary border border-mc-border rounded-xl p-5 hover:border-mc-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="relative text-2xl">
                      {product.icon}
                      {pendingCounts[product.id] > 0 && (
                        <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none px-1">
                          {pendingCounts[product.id] > 99 ? '99+' : pendingCounts[product.id]}
                        </span>
                      )}
                    </span>
                    <div>
                      <h3 className="font-semibold text-mc-text group-hover:text-mc-accent transition-colors">{product.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        product.status === 'active' ? 'bg-green-500/20 text-green-400' :
                        product.status === 'paused' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-mc-bg-tertiary text-mc-text-secondary'
                      }`}>
                        {product.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {healthScores[product.id] !== undefined && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          window.location.href = `/autopilot/${product.id}/health`;
                        }}
                        className="hover:scale-110 transition-transform cursor-pointer"
                      >
                        <HealthBadge score={healthScores[product.id]} size={38} />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeleteProduct({ id: product.id, name: product.name });
                      }}
                      className="p-1.5 rounded hover:bg-red-500/20 text-mc-text-secondary hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete product"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ArrowRight className="w-4 h-4 text-mc-text-secondary group-hover:text-mc-accent transition-colors" />
                  </div>
                </div>
                {product.description && (
                  <p className="text-sm text-mc-text-secondary line-clamp-2">{product.description}</p>
                )}
              </Link>
            ))}
          </div>
        )}
      {deleteProduct && (
        <DeleteProductModal
          product={deleteProduct}
          onClose={() => setDeleteProduct(null)}
          onArchive={(id) => {
            setProducts(prev => prev.filter(p => p.id !== id));
            setDeleteProduct(null);
          }}
          onDeleted={(id) => {
            setProducts(prev => prev.filter(p => p.id !== id));
            setDeleteProduct(null);
          }}
        />
      )}
      </main>
    </div>
  );
}
