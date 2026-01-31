'use client';

import { useState, useEffect } from 'react';
import { Zap, Plus } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import { format } from 'date-fns';

export function Header() {
  const { agents, tasks, isOnline, selectedBusiness, setSelectedBusiness } = useMissionControl();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const activeAgents = agents.filter((a) => a.status === 'working').length;
  const tasksInQueue = tasks.filter((t) => t.status !== 'done').length;

  return (
    <header className="h-14 bg-mc-bg-secondary border-b border-mc-border flex items-center justify-between px-4">
      {/* Left: Logo & Title */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-mc-accent-cyan" />
          <span className="font-semibold text-mc-text uppercase tracking-wider text-sm">
            Mission Control
          </span>
        </div>

        {/* Business Selector */}
        <select
          value={selectedBusiness}
          onChange={(e) => setSelectedBusiness(e.target.value)}
          className="bg-mc-bg-tertiary border border-mc-border rounded px-3 py-1 text-sm text-mc-text focus:outline-none focus:border-mc-accent"
        >
          <option value="all">All Businesses</option>
          <option value="default">Default Workspace</option>
        </select>
      </div>

      {/* Center: Stats */}
      <div className="flex items-center gap-8">
        <div className="text-center">
          <div className="text-2xl font-bold text-mc-accent-cyan">{activeAgents}</div>
          <div className="text-xs text-mc-text-secondary uppercase">Agents Active</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-mc-accent-purple">{tasksInQueue}</div>
          <div className="text-xs text-mc-text-secondary uppercase">Tasks in Queue</div>
        </div>
      </div>

      {/* Right: Time & Status */}
      <div className="flex items-center gap-4">
        <span className="text-mc-text-secondary text-sm font-mono">
          {format(currentTime, 'HH:mm:ss')} AM
        </span>
        <div
          className={`flex items-center gap-2 px-3 py-1 rounded border text-sm font-medium ${
            isOnline
              ? 'bg-mc-accent-green/20 border-mc-accent-green text-mc-accent-green'
              : 'bg-mc-accent-red/20 border-mc-accent-red text-mc-accent-red'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isOnline ? 'bg-mc-accent-green animate-pulse' : 'bg-mc-accent-red'
            }`}
          />
          {isOnline ? 'ONLINE' : 'OFFLINE'}
        </div>
      </div>
    </header>
  );
}
