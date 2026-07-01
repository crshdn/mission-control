'use client';

import Link from 'next/link';
import { ArrowLeft, Calendar } from 'lucide-react';
import { CronCalendar } from '@/components/CronCalendar';

export default function CronsPage() {
  return (
    <div className="min-h-screen bg-mc-bg">
      <header className="border-b border-mc-border bg-mc-bg-secondary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-mc-text-secondary hover:text-mc-text transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <Calendar className="w-6 h-6 text-mc-accent" />
            <h1 className="text-xl font-bold text-mc-text">Cron Dashboard</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <CronCalendar workspaceId="default" />
      </main>
    </div>
  );
}
