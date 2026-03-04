'use client';

import { useState, useEffect } from 'react';
import { Rocket, CheckCircle, XCircle, Loader, ExternalLink } from 'lucide-react';

interface Deployment {
  id: string;
  project: string;
  url: string;
  status: 'success' | 'failed' | 'building';
  createdAt: string;
  environment: 'production' | 'preview';
}

export function Deployments() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/deployments');
        const data = await response.json();
        if (data.error) {
          setError(data.error);
        } else {
          setDeployments(data.deployments || []);
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
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'failed': return <XCircle className="w-5 h-5 text-red-400" />;
      case 'building': return <Loader className="w-5 h-5 text-yellow-400 animate-spin" />;
      default: return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'bg-green-500/20 text-green-400';
      case 'failed': return 'bg-red-500/20 text-red-400';
      case 'building': return 'bg-yellow-500/20 text-yellow-400';
      default: return 'bg-gray-500/20 text-gray-400';
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

  const successCount = deployments.filter(d => d.status === 'success').length;
  const failedCount = deployments.filter(d => d.status === 'failed').length;
  const buildingCount = deployments.filter(d => d.status === 'building').length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-mc-text flex items-center gap-2">
          <Rocket className="w-6 h-6" />
          Deployments
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

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-mc-card rounded-lg p-4 border border-mc-border">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <span className="text-mc-text-muted">Successful</span>
          </div>
          <p className="text-3xl font-bold text-green-400">{successCount}</p>
        </div>
        
        <div className="bg-mc-card rounded-lg p-4 border border-mc-border">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="w-5 h-5 text-red-400" />
            <span className="text-mc-text-muted">Failed</span>
          </div>
          <p className="text-3xl font-bold text-red-400">{failedCount}</p>
        </div>
        
        <div className="bg-mc-card rounded-lg p-4 border border-mc-border">
          <div className="flex items-center gap-2 mb-2">
            <Loader className="w-5 h-5 text-yellow-400" />
            <span className="text-mc-text-muted">Building</span>
          </div>
          <p className="text-3xl font-bold text-yellow-400">{buildingCount}</p>
        </div>
      </div>

      {/* Deployments List */}
      <div className="bg-mc-card rounded-lg border border-mc-border">
        <div className="p-4 border-b border-mc-border">
          <h3 className="font-semibold text-mc-text">Recent Deployments</h3>
        </div>
        
        {deployments.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-mc-text-muted">No recent deployments</p>
          </div>
        ) : (
          <ul className="divide-y divide-mc-border">
            {deployments.map((deployment) => (
              <li key={deployment.id} className="p-4 hover:bg-mc-bg transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(deployment.status)}
                    <div>
                      <p className="text-mc-text font-medium">{deployment.project}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded ${getStatusColor(deployment.status)}`}>
                          {deployment.status}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-mc-bg text-mc-text-muted">
                          {deployment.environment}
                        </span>
                        <span className="text-xs text-mc-text-muted">
                          {formatDate(deployment.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <a 
                    href={deployment.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm text-mc-primary hover:text-mc-accent"
                  >
                    View <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default Deployments;
