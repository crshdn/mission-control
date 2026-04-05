'use client';


import { logger } from '@/lib/logger';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Activity, ArrowRight } from 'lucide-react';
import type { Workspace } from '@/lib/types';

export default function ActivityPickerPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [taskCounts, setTaskCounts] = useState<Record<string, { active: number; total: number }>>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/workspaces');
        if (res.ok) {
          const ws: Workspace[] = await res.json();
          setWorkspaces(ws);

          // Fetch task counts per workspace
          const counts: Record<string, { active: number; total: number }> = {};
          await Promise.all(ws.map(async (w) => {
            try {
              const r = await fetch(`/api/tasks?workspace_id=${w.id}`);
              if (r.ok) {
                const tasks = await r.json();
                if (Array.isArray(tasks)) {
                  const active = tasks.filter((t: { status: string }) =>
                    ['assigned', 'in_progress', 'testing', 'verification', 'convoy_active'].includes(t.status)
                  ).length;
                  counts[w.id] = { active, total: tasks.length };
                }
              }
            } catch { /* skip */ }
          }));
          setTaskCounts(counts);
        }
      } catch (error) {
        logger.error('Failed to load workspaces:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <Activity className="w-8 h-8 text-mc-accent mx-auto mb-3 animate-pulse" />
          <p className="text-mc-text-secondary">Loading workspaces...</p>
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
              <Link href="/" className="text-mc-text-secondary hover:text-mc-text transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <Activity className="w-6 h-6 text-mc-accent" />
              <h1 className="text-xl font-bold text-mc-text">Activity Dashboards</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {workspaces.length === 0 ? (
          <div className="text-center py-20">
            <Activity className="w-12 h-12 text-mc-text-secondary mx-auto mb-4" />
            <h2 className="text-xl font-bold text-mc-text mb-2">No workspaces</h2>
            <p className="text-mc-text-secondary">Create a workspace to see agent activity.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workspaces.map(ws => {
              const counts = taskCounts[ws.id];
              return (
                <Link
                  key={ws.id}
                  href={`/workspace/${ws.slug}/activity`}
                  className="group block bg-mc-bg-secondary border border-mc-border rounded-xl p-5 hover:border-mc-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-mc-text group-hover:text-mc-accent transition-colors">
                        {ws.name}
                      </h3>
                      <span className="text-xs text-mc-text-secondary">/{ws.slug}</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-mc-text-secondary group-hover:text-mc-accent transition-colors" />
                  </div>
                  {counts && (
                    <div className="flex gap-4 text-xs text-mc-text-secondary">
                      {counts.active > 0 && (
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                          {counts.active} active
                        </span>
                      )}
                      <span>{counts.total} total tasks</span>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
