'use client';

import { useState, useEffect } from 'react';

interface PR {
  number: number;
  title: string;
  author: string;
  url: string;
  createdAt: string;
  isDraft: boolean;
}

interface Issue {
  number: number;
  title: string;
  author: string;
  url: string;
  createdAt: string;
  labels: string[];
}

interface Repo {
  name: string;
  fullName: string;
  prs: PR[];
  issues: Issue[];
  lastCommit?: {
    message: string;
    author: string;
    date: string;
  };
}

export function GitHubActivity() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/github');
        const data = await response.json();
        if (data.error) {
          setError(data.error);
        } else {
          setRepos(data.repos || []);
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

  const formatDate = (dateStr: string) => {
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-mc-text">GitHub Activity</h2>
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

      <div className="grid gap-6 md:grid-cols-2">
        {repos.map((repo) => (
          <div key={repo.fullName} className="bg-mc-card rounded-lg p-4 border border-mc-border">
            <h3 className="text-lg font-semibold text-mc-text mb-4 flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 0C4.477 0 0 4.477 0 10c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0110 4.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C17.137 18.163 20 14.418 20 10c0-5.523-4.477-10-10-10z" clipRule="evenodd" />
              </svg>
              {repo.name}
            </h3>

            {/* Last Commit */}
            {repo.lastCommit && (
              <div className="mb-4 p-3 bg-mc-bg rounded-lg">
                <p className="text-xs text-mc-text-muted mb-1">Last commit</p>
                <p className="text-sm text-mc-text truncate">{repo.lastCommit.message}</p>
                <p className="text-xs text-mc-text-muted mt-1">
                  {repo.lastCommit.author} - {formatDate(repo.lastCommit.date)}
                </p>
              </div>
            )}

            {/* PRs */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-mc-text-muted mb-2">
                Open PRs ({repo.prs.length})
              </h4>
              {repo.prs.length === 0 ? (
                <p className="text-sm text-mc-text-muted italic">No open PRs</p>
              ) : (
                <ul className="space-y-2">
                  {repo.prs.map((pr) => (
                    <li key={pr.number} className="flex items-start gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${pr.isDraft ? 'bg-gray-500/20 text-gray-400' : 'bg-green-500/20 text-green-400'}`}>
                        #{pr.number}
                      </span>
                      <a 
                        href={pr.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-mc-text hover:text-mc-primary truncate flex-1"
                      >
                        {pr.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Issues */}
            <div>
              <h4 className="text-sm font-medium text-mc-text-muted mb-2">
                Open Issues ({repo.issues.length})
              </h4>
              {repo.issues.length === 0 ? (
                <p className="text-sm text-mc-text-muted italic">No open issues</p>
              ) : (
                <ul className="space-y-2">
                  {repo.issues.map((issue) => (
                    <li key={issue.number} className="flex items-start gap-2">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                        #{issue.number}
                      </span>
                      <a 
                        href={issue.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-mc-text hover:text-mc-primary truncate flex-1"
                      >
                        {issue.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>

      {repos.length === 0 && !error && (
        <div className="text-center py-12">
          <p className="text-mc-text-muted">No repository data available</p>
          <p className="text-sm text-mc-text-muted mt-2">
            Check that gh CLI is authenticated
          </p>
        </div>
      )}
    </div>
  );
}

export default GitHubActivity;
