'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { SwipeDeck } from '@/components/autopilot/SwipeDeck';

export default function SwipePage() {
  const { productId } = useParams<{ productId: string }>();

  return (
    <div className="min-h-screen bg-mc-bg flex flex-col">
      <header className="border-b border-mc-border bg-mc-bg-secondary px-4 py-3 flex items-center gap-3">
        <Link href={`/autopilot/${productId}`} className="text-mc-text-secondary hover:text-mc-text">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="font-semibold text-mc-text">Swipe Deck</h1>
      </header>
      <main className="flex-1 flex items-center justify-center p-4">
        <SwipeDeck productId={productId} />
      </main>
    </div>
  );
}
