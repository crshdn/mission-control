'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Server, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Clock,
  Zap,
  TrendingUp,
  RefreshCw,
  Calendar,
  ExternalLink
} from 'lucide-react';

interface ToolHealth {
  id: string;
  name: string;
  url: string;
  status: 'online' | 'offline' | 'degraded' | 'maintenance';
  responseTime: number;
  uptime: number;
  errorCount: number;
  lastError?: {
    timestamp: string;
    message: string;
    statusCode?: number;
  };
  lastChecked: string;
  category: 'conversion' | 'generation' | 'analysis' | 'utility';
}

interface ToolsHealthMonitorProps {
  workspaceId: string;
}

export function ToolsHealthMonitor({ workspaceId }: ToolsHealthMonitorProps) {
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const { data: toolsHealth, refetch, isLoading } = useQuery({
    queryKey: ['tools-health', workspaceId],
    queryFn: async (): Promise<ToolHealth[]> => {
      const response = await fetch('/api/tools-health');
      if (!response.ok) throw new Error('Failed to fetch tools health');
      return response.json();
    },
    refetchInterval: 60000 // 60s polling
  });

  useEffect(() => {
    if (toolsHealth) {
      setLastUpdated(new Date());
    }
  }, [toolsHealth]);

  const getStatusIcon = (status: ToolHealth['status']) => {
    switch (status) {
      case 'online':
        return <CheckCircle2 className="w-5 h-5 text-green-400" />;
      case 'offline':
        return <XCircle className="w-5 h-5 text-red-400" />;
      case 'degraded':
        return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
      case 'maintenance':
        return <Clock className="w-5 h-5 text-blue-400" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: ToolHealth['status']) => {
    switch (status) {
      case 'online':
        return 'border-green-500 bg-green-500/10';
      case 'offline':
        return 'border-red-500 bg-red-500/10';
      case 'degraded':
        return 'border-yellow-500 bg-yellow-500/10';
      case 'maintenance':
        return 'border-blue-500 bg-blue-500/10';
      default:
        return 'border-gray-500 bg-gray-500/10';
    }
  };

  const getResponseTimeColor = (responseTime: number) => {
    if (responseTime < 200) return 'text-green-400';
    if (responseTime < 1000) return 'text-yellow-400';
    return 'text-red-400';
  };

  const formatResponseTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatUptime = (percentage: number) => {
    return `${percentage.toFixed(2)}%`;
  };

  const getCategoryIcon = (category: ToolHealth['category']) => {
    switch (category) {
      case 'conversion':
        return '🔄';
      case 'generation':
        return '✨';
      case 'analysis':
        return '📊';
      case 'utility':
        return '🛠️';
      default:
        return '⚙️';
    }
  };

  const healthyCount = toolsHealth?.filter(t => t.status === 'online').length || 0;
  const totalCount = toolsHealth?.length || 0;
  const avgResponseTime = toolsHealth?.reduce((sum, tool) => sum + tool.responseTime, 0) || 0;
  const avgResponseTimeFinal = totalCount > 0 ? avgResponseTime / totalCount : 0;

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center">
            <Server className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-mc-text">Atelier Tools Health</h1>
            <p className="text-mc-text-secondary">Real-time monitoring of tool availability and performance</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-mc-text-secondary">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Last updated: {lastUpdated.toLocaleTimeString()}
          </div>
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 bg-mc-bg-secondary hover:bg-mc-bg-tertiary rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-mc-bg-secondary rounded-xl p-6 border border-mc-border">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            <h3 className="text-lg font-semibold text-mc-text">Tools Online</h3>
          </div>
          <div className="text-3xl font-bold text-green-400">{healthyCount}/{totalCount}</div>
          <p className="text-sm text-mc-text-secondary mt-1">
            {totalCount > 0 ? `${((healthyCount / totalCount) * 100).toFixed(1)}%` : '0%'} operational
          </p>
        </div>

        <div className="bg-mc-bg-secondary rounded-xl p-6 border border-mc-border">
          <div className="flex items-center gap-3 mb-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            <h3 className="text-lg font-semibold text-mc-text">Avg Response</h3>
          </div>
          <div className={`text-3xl font-bold ${getResponseTimeColor(avgResponseTimeFinal)}`}>
            {formatResponseTime(avgResponseTimeFinal)}
          </div>
          <p className="text-sm text-mc-text-secondary mt-1">across all tools</p>
        </div>

        <div className="bg-mc-bg-secondary rounded-xl p-6 border border-mc-border">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-semibold text-mc-text">System Health</h3>
          </div>
          <div className={`text-3xl font-bold ${healthyCount === totalCount ? 'text-green-400' : healthyCount > totalCount * 0.8 ? 'text-yellow-400' : 'text-red-400'}`}>
            {healthyCount === totalCount ? 'Good' : healthyCount > totalCount * 0.8 ? 'Fair' : 'Poor'}
          </div>
          <p className="text-sm text-mc-text-secondary mt-1">overall status</p>
        </div>
      </div>

      {/* Tools Grid */}
      <div className="grid gap-4">
        {toolsHealth?.map((tool) => (
          <div
            key={tool.id}
            className={`p-6 rounded-xl border ${getStatusColor(tool.status)} transition-all duration-200 hover:scale-[1.01]`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{getCategoryIcon(tool.category)}</span>
                {getStatusIcon(tool.status)}
                <div>
                  <h3 className="text-lg font-semibold text-mc-text">{tool.name}</h3>
                  <div className="flex items-center gap-2 text-sm text-mc-text-secondary">
                    <span className="capitalize">{tool.category}</span>
                    <span>•</span>
                    <span>Uptime: {formatUptime(tool.uptime)}</span>
                  </div>
                </div>
              </div>
              <a
                href={tool.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Visit
              </a>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-mc-bg-tertiary rounded-lg p-3">
                <div className="text-sm text-mc-text-secondary mb-1">Response Time</div>
                <div className={`text-lg font-semibold ${getResponseTimeColor(tool.responseTime)}`}>
                  {formatResponseTime(tool.responseTime)}
                </div>
              </div>
              <div className="bg-mc-bg-tertiary rounded-lg p-3">
                <div className="text-sm text-mc-text-secondary mb-1">Errors (24h)</div>
                <div className={`text-lg font-semibold ${tool.errorCount > 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {tool.errorCount}
                </div>
              </div>
              <div className="bg-mc-bg-tertiary rounded-lg p-3">
                <div className="text-sm text-mc-text-secondary mb-1">Last Checked</div>
                <div className="text-sm text-mc-text">
                  {new Date(tool.lastChecked).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
            </div>

            {tool.lastError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <div className="flex items-center gap-2 text-sm text-red-300 mb-1">
                  <XCircle className="w-4 h-4" />
                  <span>Last Error</span>
                  {tool.lastError.statusCode && (
                    <span className="px-1.5 py-0.5 bg-red-500/20 rounded text-xs">
                      {tool.lastError.statusCode}
                    </span>
                  )}
                </div>
                <p className="text-sm text-red-200">{tool.lastError.message}</p>
                <p className="text-xs text-red-400 mt-1">
                  {new Date(tool.lastError.timestamp).toLocaleString()}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between mt-4">
              <span className={`px-2 py-1 text-xs font-medium rounded-full capitalize
                ${tool.status === 'online' ? 'bg-green-500/20 text-green-300' : ''}
                ${tool.status === 'offline' ? 'bg-red-500/20 text-red-300' : ''}
                ${tool.status === 'degraded' ? 'bg-yellow-500/20 text-yellow-300' : ''}
                ${tool.status === 'maintenance' ? 'bg-blue-500/20 text-blue-300' : ''}
              `}>
                {tool.status}
              </span>
            </div>
          </div>
        ))}

        {!toolsHealth?.length && !isLoading && (
          <div className="text-center py-12 text-mc-text-secondary">
            <Server className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No tools found</p>
            <p className="text-sm">Tool health data will appear here once available</p>
          </div>
        )}

        {isLoading && (
          <div className="text-center py-12 text-mc-text-secondary">
            <RefreshCw className="w-8 h-8 mx-auto mb-4 animate-spin" />
            <p>Loading tools health...</p>
          </div>
        )}
      </div>
    </div>
  );
}