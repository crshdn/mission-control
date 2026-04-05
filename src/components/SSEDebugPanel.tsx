'use client';


import { logger } from '@/lib/logger';
import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface SSELogEntry {
  timestamp: Date;
  type: string;
  data: unknown;
}

function formatLogData(data: unknown): string {
  if (data === null || data === undefined) return '';
  if (typeof data === 'object') {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }
  return String(data);
}

export function SSEDebugPanel() {
  const [logs, setLogs] = useState<SSELogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);

  const addLog = useCallback((type: string, data: unknown) => {
    setLogs(prev => [{
      timestamp: new Date(),
      type,
      data
    }, ...prev].slice(0, 50)); // Keep last 50
  }, []);

  useEffect(() => {
    // Check if debug mode is enabled
    const debugEnabled = localStorage.getItem('MC_DEBUG') === 'true';
    setIsEnabled(debugEnabled);

    if (!debugEnabled) return;

    // Intercept logger.info for SSE events
    const originalLog = logger.info;
    logger.info = (...args: unknown[]) => {
      originalLog.apply(console, args);

      // Capture SSE and STORE logs
      if (typeof args[0] === 'string') {
        const msg = args[0] as string;
        if (msg.includes('[SSE]') || msg.includes('[STORE]') || msg.includes('[API]')) {
          const type = msg.replace(/^\[([^\]]+)\].*$/, '$1');
          const message = msg.replace(/^\[[^\]]+\]\s*/, '');
          addLog(`${type}: ${message}`, args[1]);
        }
      }
    };

    return () => {
      logger.info = originalLog;
    };
  }, [addLog]);

  // Re-check debug mode on storage changes
  useEffect(() => {
    const handleStorage = () => {
      const debugEnabled = localStorage.getItem('MC_DEBUG') === 'true';
      setIsEnabled(debugEnabled);
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  if (!isEnabled) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-mc-bg-secondary border border-mc-border rounded-lg shadow-lg text-sm"
      >
        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <span className="text-mc-accent">Debug</span>
        <span className="bg-mc-accent text-mc-bg px-2 py-0.5 rounded text-xs">
          {logs.length}
        </span>
      </button>

      {isOpen && (
        <div className="absolute bottom-12 left-0 w-96 max-h-80 bg-mc-bg-secondary border border-mc-border rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-mc-border flex justify-between items-center">
            <span className="text-sm font-medium">Debug Events</span>
            <button
              onClick={() => setLogs([])}
              className="text-xs text-mc-text-secondary hover:text-mc-text"
            >
              Clear
            </button>
          </div>
          <div className="overflow-y-auto max-h-64 p-2 space-y-1 font-mono text-xs">
            {logs.length === 0 ? (
              <div className="text-mc-text-secondary text-center py-4">
                Waiting for events...
              </div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="p-2 bg-mc-bg rounded border border-mc-border">
                  <div className="flex justify-between text-mc-text-secondary">
                    <span className="text-mc-accent">{log.type}</span>
                    <span>{log.timestamp.toLocaleTimeString()}</span>
                  </div>
                  {log.data !== null && log.data !== undefined && (
                    <pre className="mt-1 text-mc-text overflow-x-auto whitespace-pre-wrap">
                      {formatLogData(log.data)}
                    </pre>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
