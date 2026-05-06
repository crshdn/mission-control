'use client';

import { useState, useEffect, useCallback } from 'react';
import { Clock, CheckCircle, XCircle, AlertTriangle, TrendingUp } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

interface QCMetrics {
  reviewQueue: number;
  avgReviewTime: number; // in minutes
  approvedToday: number;
  rejectedToday: number;
  escalatedToday: number;
  approvedWeek: number;
  rejectedWeek: number;
  escalatedWeek: number;
  approvedMonth: number;
  rejectedMonth: number;
  escalatedMonth: number;
}

interface QCDecision {
  id: string;
  taskId: string;
  taskTitle: string;
  decision: 'approved' | 'rejected' | 'escalated';
  reason?: string;
  reviewedAt: string;
  reviewTime: number; // in minutes
}

interface RejectionPattern {
  reason: string;
  count: number;
  percentage: number;
}

interface QCDashboardProps {
  workspaceId: string;
}

export function QCDashboard({ workspaceId }: QCDashboardProps) {
  const [metrics, setMetrics] = useState<QCMetrics>({
    reviewQueue: 0,
    avgReviewTime: 0,
    approvedToday: 0,
    rejectedToday: 0,
    escalatedToday: 0,
    approvedWeek: 0,
    rejectedWeek: 0,
    escalatedWeek: 0,
    approvedMonth: 0,
    rejectedMonth: 0,
    escalatedMonth: 0,
  });
  const [recentDecisions, setRecentDecisions] = useState<QCDecision[]>([]);
  const [rejectionPatterns, setRejectionPatterns] = useState<RejectionPattern[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);

  const loadQCData = useCallback(async () => {
    try {
      // Load QC metrics
      const metricsRes = await fetch(`/api/qc/metrics?workspace_id=${workspaceId}`);
      if (metricsRes.ok) {
        setMetrics(await metricsRes.json());
      }

      // Load recent QC decisions
      const decisionsRes = await fetch(`/api/qc/decisions?workspace_id=${workspaceId}&limit=20`);
      if (decisionsRes.ok) {
        setRecentDecisions(await decisionsRes.json());
      }

      // Load rejection patterns
      const patternsRes = await fetch(`/api/qc/patterns?workspace_id=${workspaceId}`);
      if (patternsRes.ok) {
        setRejectionPatterns(await patternsRes.json());
      }

      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to load QC data:', error);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadQCData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(loadQCData, 30000);
    return () => clearInterval(interval);
  }, [workspaceId, loadQCData]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-mc-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-mc-text-secondary">Loading QC data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-mc-text">QC Process Visibility</h2>
            <p className="text-mc-text-secondary">Quality control oversight and patterns</p>
          </div>
          <div className="text-sm text-mc-text-secondary">
            Last updated: {format(lastUpdated, 'HH:mm:ss')}
          </div>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Review Queue */}
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-mc-accent-yellow" />
              <div>
                <p className="text-2xl font-bold text-mc-text">{metrics.reviewQueue}</p>
                <p className="text-sm text-mc-text-secondary">Awaiting Review</p>
              </div>
            </div>
          </div>

          {/* Average Review Time */}
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-mc-accent-cyan" />
              <div>
                <p className="text-2xl font-bold text-mc-text">{Math.round(metrics.avgReviewTime)}m</p>
                <p className="text-sm text-mc-text-secondary">Avg Review Time</p>
              </div>
            </div>
          </div>

          {/* Approved - all periods */}
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-mc-accent-green" />
              <span className="text-sm font-medium text-mc-accent-green">Approved</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-lg font-bold text-mc-text">{metrics.approvedToday}</p>
                <p className="text-xs text-mc-text-secondary">Today</p>
              </div>
              <div>
                <p className="text-lg font-bold text-mc-text">{metrics.approvedWeek}</p>
                <p className="text-xs text-mc-text-secondary">7 days</p>
              </div>
              <div>
                <p className="text-lg font-bold text-mc-text">{metrics.approvedMonth}</p>
                <p className="text-xs text-mc-text-secondary">30 days</p>
              </div>
            </div>
          </div>

          {/* Rejected - all periods */}
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="w-4 h-4 text-mc-accent-red" />
              <span className="text-sm font-medium text-mc-accent-red">Rejected</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-lg font-bold text-mc-text">{metrics.rejectedToday}</p>
                <p className="text-xs text-mc-text-secondary">Today</p>
              </div>
              <div>
                <p className="text-lg font-bold text-mc-text">{metrics.rejectedWeek}</p>
                <p className="text-xs text-mc-text-secondary">7 days</p>
              </div>
              <div>
                <p className="text-lg font-bold text-mc-text">{metrics.rejectedMonth}</p>
                <p className="text-xs text-mc-text-secondary">30 days</p>
              </div>
            </div>
          </div>

          {/* Escalated - all periods */}
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-mc-accent-purple" />
              <span className="text-sm font-medium text-mc-accent-purple">Escalated</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-lg font-bold text-mc-text">{metrics.escalatedToday}</p>
                <p className="text-xs text-mc-text-secondary">Today</p>
              </div>
              <div>
                <p className="text-lg font-bold text-mc-text">{metrics.escalatedWeek}</p>
                <p className="text-xs text-mc-text-secondary">7 days</p>
              </div>
              <div>
                <p className="text-lg font-bold text-mc-text">{metrics.escalatedMonth}</p>
                <p className="text-xs text-mc-text-secondary">30 days</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* QC Decision Feed */}
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg">
            <div className="p-4 border-b border-mc-border">
              <h3 className="text-lg font-semibold text-mc-text">Recent QC Decisions</h3>
              <p className="text-sm text-mc-text-secondary">Latest quality control reviews</p>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {recentDecisions.length === 0 ? (
                <div className="p-8 text-center">
                  <CheckCircle className="w-12 h-12 text-mc-text-tertiary mx-auto mb-3" />
                  <p className="text-mc-text-secondary">No recent QC decisions</p>
                </div>
              ) : (
                <div className="divide-y divide-mc-border">
                  {recentDecisions.map((decision) => (
                    <div key={decision.id} className="p-4 hover:bg-mc-bg-tertiary">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0">
                          {decision.decision === 'approved' && (
                            <CheckCircle className="w-5 h-5 text-mc-accent-green" />
                          )}
                          {decision.decision === 'rejected' && (
                            <XCircle className="w-5 h-5 text-mc-accent-red" />
                          )}
                          {decision.decision === 'escalated' && (
                            <AlertTriangle className="w-5 h-5 text-mc-accent-purple" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-mc-text">
                              {decision.decision === 'approved' && 'APPROVED'}
                              {decision.decision === 'rejected' && 'REJECTED'}
                              {decision.decision === 'escalated' && 'ESCALATED'}
                            </span>
                            <span className="text-sm text-mc-text-secondary">
                              {decision.taskTitle}
                            </span>
                          </div>
                          {decision.reason && (
                            <p className="text-sm text-mc-text-secondary mb-1">{decision.reason}</p>
                          )}
                          <div className="flex items-center gap-3 text-xs text-mc-text-secondary">
                            <span>{formatDistanceToNow(new Date(decision.reviewedAt), { addSuffix: true })}</span>
                            <span>Review time: {Math.round(decision.reviewTime)}m</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Rejection Patterns */}
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg">
            <div className="p-4 border-b border-mc-border">
              <h3 className="text-lg font-semibold text-mc-text">Common Rejection Reasons</h3>
              <p className="text-sm text-mc-text-secondary">Most frequent failure patterns</p>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {rejectionPatterns.length === 0 ? (
                <div className="p-8 text-center">
                  <XCircle className="w-12 h-12 text-mc-text-tertiary mx-auto mb-3" />
                  <p className="text-mc-text-secondary">No rejection patterns yet</p>
                </div>
              ) : (
                <div className="p-4 space-y-3">
                  {rejectionPatterns.map((pattern, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-mc-bg-tertiary rounded">
                      <div className="flex-1">
                        <p className="font-medium text-mc-text">{pattern.reason}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 bg-mc-bg h-2 rounded-full">
                            <div 
                              className="h-2 bg-mc-accent-red rounded-full"
                              style={{ width: `${pattern.percentage}%` }}
                            />
                          </div>
                          <span className="text-sm text-mc-text-secondary">{pattern.percentage}%</span>
                        </div>
                      </div>
                      <div className="ml-4 text-right">
                        <p className="text-lg font-bold text-mc-text">{pattern.count}</p>
                        <p className="text-xs text-mc-text-secondary">times</p>
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