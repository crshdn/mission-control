'use client';

import { useState, useEffect } from 'react';
import { Activity, AlertTriangle, DollarSign, Zap, TrendingUp, Clock } from 'lucide-react';
import { format, subDays, formatDistanceToNow } from 'date-fns';

interface APIUsage {
  provider: string;
  model: string;
  requestsToday: number;
  tokensToday: number;
  costToday: number;
  weeklyLimit: number;
  weeklyUsed: number;
  weeklyPercentage: number;
  rateLimitRemaining: number;
  rateLimitReset: Date;
  status: 'healthy' | 'warning' | 'critical';
}

interface UsageAlert {
  id: string;
  provider: string;
  model: string;
  threshold: number;
  currentUsage: number;
  alertType: 'warning' | 'critical';
  createdAt: Date;
}

interface APIMonitorProps {
  workspaceId: string;
}

export function APIMonitor({ workspaceId }: APIMonitorProps) {
  const [usage, setUsage] = useState<APIUsage[]>([]);
  const [alerts, setAlerts] = useState<UsageAlert[]>([]);
  const [totalCostToday, setTotalCostToday] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);

  const loadAPIData = async () => {
    try {
      // Load API usage data
      const usageRes = await fetch('/api/usage/summary');
      if (usageRes.ok) {
        const usageData = await usageRes.json();
        setUsage(usageData.providers || []);
        setTotalCostToday(usageData.totalCostToday || 0);
      }

      // Load usage alerts
      const alertsRes = await fetch('/api/usage/alerts');
      if (alertsRes.ok) {
        const alertsData = await alertsRes.json();
        setAlerts(alertsData || []);
      }

      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to load API usage data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAPIData();

    // Auto-refresh every 60 seconds
    const interval = setInterval(loadAPIData, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-mc-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-mc-text-secondary">Loading API usage data...</p>
        </div>
      </div>
    );
  }

  const overallStatus = usage.length > 0 ? 
    usage.some(u => u.status === 'critical') ? 'critical' :
    usage.some(u => u.status === 'warning') ? 'warning' : 'healthy'
    : 'healthy';

  const criticalAlerts = alerts.filter(a => a.alertType === 'critical').length;
  const warningAlerts = alerts.filter(a => a.alertType === 'warning').length;

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-mc-text">API Usage Monitor</h2>
            <p className="text-mc-text-secondary">Track costs, limits, and rate limits</p>
          </div>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-3 py-1 rounded border text-sm font-medium ${
              overallStatus === 'healthy'
                ? 'bg-mc-accent-green/20 border-mc-accent-green text-mc-accent-green'
                : overallStatus === 'warning'
                ? 'bg-mc-accent-yellow/20 border-mc-accent-yellow text-mc-accent-yellow'
                : 'bg-mc-accent-red/20 border-mc-accent-red text-mc-accent-red'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                overallStatus === 'healthy' ? 'bg-mc-accent-green' :
                overallStatus === 'warning' ? 'bg-mc-accent-yellow' :
                'bg-mc-accent-red'
              }`} />
              {overallStatus.toUpperCase()}
            </div>
            <div className="text-sm text-mc-text-secondary">
              Last updated: {format(lastUpdated, 'HH:mm:ss')}
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Cost Today */}
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <DollarSign className="w-5 h-5 text-mc-accent-green" />
              <div>
                <p className="text-2xl font-bold text-mc-text">${totalCostToday.toFixed(2)}</p>
                <p className="text-sm text-mc-text-secondary">Cost Today</p>
              </div>
            </div>
          </div>

          {/* Active Providers */}
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-mc-accent-cyan" />
              <div>
                <p className="text-2xl font-bold text-mc-text">{usage.length}</p>
                <p className="text-sm text-mc-text-secondary">Active Providers</p>
              </div>
            </div>
          </div>

          {/* Critical Alerts */}
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-mc-accent-red" />
              <div>
                <p className="text-2xl font-bold text-mc-text">{criticalAlerts}</p>
                <p className="text-sm text-mc-text-secondary">Critical Alerts</p>
              </div>
            </div>
          </div>

          {/* Warning Alerts */}
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-mc-accent-yellow" />
              <div>
                <p className="text-2xl font-bold text-mc-text">{warningAlerts}</p>
                <p className="text-sm text-mc-text-secondary">Warnings</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Provider Usage */}
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg">
            <div className="p-4 border-b border-mc-border">
              <h3 className="text-lg font-semibold text-mc-text">Provider Usage</h3>
              <p className="text-sm text-mc-text-secondary">Current usage and limits per provider</p>
            </div>
            <div className="divide-y divide-mc-border max-h-96 overflow-y-auto">
              {usage.length === 0 ? (
                <div className="p-8 text-center">
                  <Activity className="w-12 h-12 text-mc-text-tertiary mx-auto mb-3" />
                  <p className="text-mc-text-secondary">No API usage data</p>
                </div>
              ) : (
                usage.map((provider, index) => (
                  <div key={index} className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-mc-text">{provider.provider}</h4>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            provider.status === 'healthy'
                              ? 'bg-mc-accent-green/20 text-mc-accent-green'
                              : provider.status === 'warning'
                              ? 'bg-mc-accent-yellow/20 text-mc-accent-yellow'
                              : 'bg-mc-accent-red/20 text-mc-accent-red'
                          }`}>
                            {provider.status}
                          </span>
                        </div>
                        <p className="text-sm text-mc-text-secondary">{provider.model}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-mc-text">{provider.weeklyPercentage}%</p>
                        <p className="text-xs text-mc-text-secondary">weekly usage</p>
                      </div>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="mb-3">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-mc-text-secondary">Weekly Usage</span>
                        <span className="text-mc-text-secondary">
                          {provider.weeklyUsed.toLocaleString()} / {provider.weeklyLimit.toLocaleString()}
                        </span>
                      </div>
                      <div className="w-full bg-mc-bg h-2 rounded-full">
                        <div 
                          className={`h-2 rounded-full ${
                            provider.weeklyPercentage >= 85 ? 'bg-mc-accent-red' :
                            provider.weeklyPercentage >= 70 ? 'bg-mc-accent-yellow' :
                            'bg-mc-accent-green'
                          }`}
                          style={{ width: `${Math.min(provider.weeklyPercentage, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-mc-text-secondary">Requests Today</p>
                        <p className="font-medium text-mc-text">{provider.requestsToday.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-mc-text-secondary">Tokens Today</p>
                        <p className="font-medium text-mc-text">{provider.tokensToday.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-mc-text-secondary">Cost Today</p>
                        <p className="font-medium text-mc-text">${provider.costToday.toFixed(2)}</p>
                      </div>
                    </div>

                    {/* Rate Limit Info */}
                    {provider.rateLimitRemaining !== null && (
                      <div className="mt-3 pt-3 border-t border-mc-border">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-mc-text-secondary">Rate Limit</span>
                          <span className="text-mc-text">
                            {provider.rateLimitRemaining} remaining
                            {provider.rateLimitReset && (
                              <span className="ml-2 text-mc-text-secondary">
                                (resets {formatDistanceToNow(provider.rateLimitReset, { addSuffix: true })})
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Active Alerts */}
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg">
            <div className="p-4 border-b border-mc-border">
              <h3 className="text-lg font-semibold text-mc-text">Active Alerts</h3>
              <p className="text-sm text-mc-text-secondary">Usage warnings and critical alerts</p>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="p-8 text-center">
                  <AlertTriangle className="w-12 h-12 text-mc-text-tertiary mx-auto mb-3" />
                  <p className="text-mc-text-secondary">No active alerts</p>
                  <p className="text-xs text-mc-text-secondary mt-1">All providers operating normally</p>
                </div>
              ) : (
                <div className="divide-y divide-mc-border">
                  {alerts.map((alert) => (
                    <div key={alert.id} className="p-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${
                          alert.alertType === 'critical' ? 'text-mc-accent-red' : 'text-mc-accent-yellow'
                        }`} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-1 rounded text-xs font-medium uppercase ${
                              alert.alertType === 'critical'
                                ? 'bg-mc-accent-red/20 text-mc-accent-red'
                                : 'bg-mc-accent-yellow/20 text-mc-accent-yellow'
                            }`}>
                              {alert.alertType}
                            </span>
                            <span className="font-medium text-mc-text">{alert.provider}</span>
                          </div>
                          <p className="text-sm text-mc-text-secondary mb-2">
                            {alert.currentUsage}% usage exceeds {alert.threshold}% threshold
                          </p>
                          <p className="text-xs text-mc-text-secondary">
                            {formatDistanceToNow(alert.createdAt, { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}