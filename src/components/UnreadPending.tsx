'use client';

import { useState, useEffect } from 'react';
import { Mail, HelpCircle, Clock } from 'lucide-react';

interface UnreadItem {
  type: 'email' | 'question' | 'stale_task';
  title: string;
  preview?: string;
  date?: string;
  source?: string;
  taskId?: string;
}

interface Counts {
  emails: number;
  questions: number;
  staleTasks: number;
}

export function UnreadPending() {
  const [items, setItems] = useState<UnreadItem[]>([]);
  const [counts, setCounts] = useState<Counts>({ emails: 0, questions: 0, staleTasks: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/unread');
        const data = await response.json();
        if (data.error) {
          setError(data.error);
        } else {
          setItems(data.items || []);
          setCounts(data.counts || { emails: 0, questions: 0, staleTasks: 0 });
          setLastUpdated(new Date());
        }
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60000); // Poll every 60s
    return () => clearInterval(interval);
  }, []);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffHours < 1) return 'just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'email': return <Mail className="w-4 h-4 text-blue-400" />;
      case 'question': return <HelpCircle className="w-4 h-4 text-yellow-400" />;
      case 'stale_task': return <Clock className="w-4 h-4 text-orange-400" />;
      default: return null;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'email': return 'Email';
      case 'question': return 'Question';
      case 'stale_task': return 'Stale Task';
      default: return type;
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-mc-card rounded w-1/4"></div>
          <div className="h-32 bg-mc-card rounded"></div>
        </div>
      </div>
    );
  }

  const totalCount = counts.emails + counts.questions + counts.staleTasks;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-mc-text">
          Unread & Pending
          {totalCount > 0 && (
            <span className="ml-3 px-2 py-0.5 text-sm bg-red-500/20 text-red-400 rounded-full">
              {totalCount}
            </span>
          )}
        </h2>
        {lastUpdated && (
          <span className="text-sm text-mc-text-muted">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-mc-card rounded-lg p-4 border border-mc-border">
          <div className="flex items-center gap-2 mb-2">
            <Mail className="w-5 h-5 text-blue-400" />
            <span className="text-mc-text-muted">Unread Emails</span>
          </div>
          <p className="text-3xl font-bold text-mc-text">{counts.emails}</p>
        </div>
        
        <div className="bg-mc-card rounded-lg p-4 border border-mc-border">
          <div className="flex items-center gap-2 mb-2">
            <HelpCircle className="w-5 h-5 text-yellow-400" />
            <span className="text-mc-text-muted">Unanswered</span>
          </div>
          <p className="text-3xl font-bold text-mc-text">{counts.questions}</p>
        </div>
        
        <div className="bg-mc-card rounded-lg p-4 border border-mc-border">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-5 h-5 text-orange-400" />
            <span className="text-mc-text-muted">Stale Tasks</span>
          </div>
          <p className="text-3xl font-bold text-mc-text">{counts.staleTasks}</p>
        </div>
      </div>

      {/* Items List */}
      <div className="bg-mc-card rounded-lg border border-mc-border">
        <div className="p-4 border-b border-mc-border">
          <h3 className="font-semibold text-mc-text">All Items</h3>
        </div>
        
        {items.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-mc-text-muted">All caught up! Nothing pending.</p>
          </div>
        ) : (
          <ul className="divide-y divide-mc-border">
            {items.map((item, index) => (
              <li key={index} className="p-4 hover:bg-mc-bg transition-colors">
                <div className="flex items-start gap-3">
                  <div className="mt-1">{getIcon(item.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-mc-bg text-mc-text-muted">
                        {getTypeLabel(item.type)}
                      </span>
                      {item.date && (
                        <span className="text-xs text-mc-text-muted">
                          {formatDate(item.date)}
                        </span>
                      )}
                    </div>
                    <p className="text-mc-text font-medium truncate">{item.title}</p>
                    {item.preview && (
                      <p className="text-sm text-mc-text-muted truncate mt-1">
                        {item.preview}
                      </p>
                    )}
                    {item.source && (
                      <p className="text-xs text-mc-text-muted mt-1">
                        Source: {item.source}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default UnreadPending;
