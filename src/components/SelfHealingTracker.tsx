'use client';

import { useState, useEffect } from 'react';
import { Wrench, RefreshCw, AlertTriangle, CheckCircle, Clock, Settings, FileText, Zap } from 'lucide-react';

interface SystemImprovement {
  id: string;
  timestamp: string;
  title: string;
  gapDetected: string;
  rootCause: string[];
  actions: string[];
  outcome?: string;
  type: 'process' | 'technical' | 'policy' | 'automation';
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface SelfHealingTrackerProps {
  workspaceId: string;
}

export function SelfHealingTracker({ workspaceId }: SelfHealingTrackerProps) {
  const [improvements, setImprovements] = useState<SystemImprovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadImprovements();
  }, [workspaceId]);

  const loadImprovements = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/self-healing');
      if (response.ok) {
        const improvementData = await response.json();
        setImprovements(improvementData.improvements || improvementData);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Failed to load improvements:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    const colors: Record<string, string> = {
      'critical': 'bg-mc-accent-red/10 text-mc-accent-red border-mc-accent-red/20',
      'high': 'bg-orange-500/10 text-orange-400 border-orange-500/20',
      'medium': 'bg-mc-accent-yellow/10 text-mc-accent-yellow border-mc-accent-yellow/20',
      'low': 'bg-mc-accent-green/10 text-mc-accent-green border-mc-accent-green/20'
    };
    return colors[severity] || colors['low'];
  };

  const getTypeIcon = (type: string) => {
    const icons: Record<string, React.ReactNode> = {
      'automation': <Zap className="w-4 h-4" />,
      'technical': <Settings className="w-4 h-4" />,
      'policy': <FileText className="w-4 h-4" />,
      'process': <Wrench className="w-4 h-4" />
    };
    return icons[type] || icons['process'];
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      'automation': 'bg-purple-500/10 text-purple-400',
      'technical': 'bg-blue-500/10 text-blue-400',
      'policy': 'bg-green-500/10 text-green-400',
      'process': 'bg-mc-accent/10 text-mc-accent'
    };
    return colors[type] || colors['process'];
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getImprovementsByType = () => {
    const byType: Record<string, SystemImprovement[]> = {};
    improvements.forEach(imp => {
      if (!byType[imp.type]) byType[imp.type] = [];
      byType[imp.type].push(imp);
    });
    return byType;
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Wrench className="w-6 h-6 text-mc-accent" />
          <h2 className="text-xl font-semibold text-mc-text">Self-Healing System</h2>
          <span className="text-sm text-mc-text-secondary">
            ({improvements.length} improvements)
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadImprovements}
            disabled={loading}
            className="p-2 hover:bg-mc-bg-secondary rounded-lg transition-colors"
            title="Refresh improvements"
          >
            <RefreshCw className={`w-4 h-4 text-mc-text-secondary ${loading ? 'animate-spin' : ''}`} />
          </button>
          <div className="text-sm text-mc-text-secondary">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-mc-bg-secondary rounded-lg p-8 text-center">
          <RefreshCw className="w-8 h-8 text-mc-accent animate-spin mx-auto mb-4" />
          <p className="text-mc-text-secondary">Loading system improvements...</p>
        </div>
      ) : improvements.length === 0 ? (
        <div className="bg-mc-bg-secondary rounded-lg p-8 text-center">
          <Wrench className="w-12 h-12 text-mc-text-secondary mx-auto mb-4" />
          <p className="text-mc-text-secondary">No system improvements found</p>
          <p className="text-sm text-mc-text-muted mt-2">Check /agents/polly/memory/system-improvements.md</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="bg-mc-bg-secondary rounded-lg p-4">
            <h3 className="font-medium text-mc-text mb-3">Improvement Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {['critical', 'high', 'medium', 'low'].map(severity => {
                const count = improvements.filter(imp => imp.severity === severity).length;
                return (
                  <div key={severity} className="text-center">
                    <div className="text-2xl font-bold text-mc-text">{count}</div>
                    <div className="text-sm text-mc-text-secondary capitalize">{severity}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Improvements by Type */}
          {Object.entries(getImprovementsByType()).map(([type, typeImprovements]) => (
            <div key={type} className="bg-mc-bg-secondary rounded-lg p-4">
              <div className="flex items-center gap-3 mb-4">
                {getTypeIcon(type)}
                <h3 className="font-medium text-mc-text capitalize">{type} Improvements</h3>
                <span className="text-sm text-mc-text-secondary">({typeImprovements.length})</span>
              </div>

              <div className="space-y-3">
                {typeImprovements.map((improvement) => (
                  <div
                    key={improvement.id}
                    className="bg-mc-bg border border-mc-border rounded-lg p-4 hover:border-mc-accent/50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-mc-text-secondary" />
                          <span className="text-sm text-mc-text-secondary">
                            {formatTimeAgo(improvement.timestamp)}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getTypeColor(improvement.type)}`}>
                            {getTypeIcon(improvement.type)}
                            {improvement.type}
                          </span>
                          <span className={`px-2 py-1 rounded text-xs font-medium border ${getSeverityColor(improvement.severity)}`}>
                            {improvement.severity}
                          </span>
                        </div>
                      </div>
                    </div>

                    <h4 className="font-medium text-mc-text mb-2">{improvement.title}</h4>
                    
                    <div className="mb-3">
                      <div className="text-sm font-medium text-mc-accent mb-1">Gap Detected</div>
                      <p className="text-sm text-mc-text-secondary">{improvement.gapDetected}</p>
                    </div>

                    {improvement.rootCause.length > 0 && improvement.rootCause[0] !== 'See details' && (
                      <div className="mb-3">
                        <div className="text-sm font-medium text-mc-accent-yellow mb-1">Root Cause</div>
                        <ul className="text-sm text-mc-text-secondary space-y-1">
                          {improvement.rootCause.map((cause, index) => (
                            <li key={index} className="flex items-start gap-2">
                              <span className="text-mc-accent-yellow mt-1">•</span>
                              <span>{cause}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {improvement.actions.length > 0 && improvement.actions[0] !== 'See details' && (
                      <div className="mb-3">
                        <div className="text-sm font-medium text-mc-accent-green mb-1">Auto-Fix Actions</div>
                        <ul className="text-sm text-mc-text-secondary space-y-1">
                          {improvement.actions.map((action, index) => (
                            <li key={index} className="flex items-start gap-2">
                              <CheckCircle className="w-3 h-3 text-mc-accent-green mt-1 flex-shrink-0" />
                              <span>{action}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {improvement.outcome && (
                      <div>
                        <div className="text-sm font-medium text-mc-text mb-1">Outcome</div>
                        <p className="text-sm text-mc-text-secondary">{improvement.outcome}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Timeline View */}
          <div className="bg-mc-bg-secondary rounded-lg p-4">
            <h3 className="font-medium text-mc-text mb-4">Improvement Timeline</h3>
            <div className="space-y-4">
              {improvements.slice(0, 10).map((improvement, index) => (
                <div key={improvement.id} className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-3 h-3 rounded-full border-2 ${
                      improvement.severity === 'critical' ? 'border-mc-accent-red bg-mc-accent-red' :
                      improvement.severity === 'high' ? 'border-orange-500 bg-orange-500' :
                      improvement.severity === 'medium' ? 'border-mc-accent-yellow bg-mc-accent-yellow' :
                      'border-mc-accent-green bg-mc-accent-green'
                    }`} />
                    {index < improvements.slice(0, 10).length - 1 && (
                      <div className={`w-px bg-mc-border mt-2 ${expandedId === improvement.id ? 'h-auto min-h-[2rem]' : 'h-8'}`} />
                    )}
                  </div>
                  <div 
                    className="flex-1 min-w-0 cursor-pointer hover:bg-mc-bg-tertiary rounded-lg p-2 -m-2 transition-colors"
                    onClick={() => setExpandedId(expandedId === improvement.id ? null : improvement.id)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-mc-text">{improvement.title}</span>
                      <span className="text-xs text-mc-text-secondary">
                        {formatTimeAgo(improvement.timestamp)}
                      </span>
                    </div>
                    <p className={`text-sm text-mc-text-secondary ${expandedId === improvement.id ? '' : 'line-clamp-2'}`}>
                      {improvement.gapDetected}
                    </p>
                    {expandedId === improvement.id && (
                      <div className="mt-3 space-y-3 text-sm">
                        {improvement.rootCause.length > 0 && improvement.rootCause[0] !== 'See details' && (
                          <div>
                            <p className="font-medium text-mc-text mb-1">Root Cause:</p>
                            <ul className="list-disc list-inside text-mc-text-secondary space-y-1">
                              {improvement.rootCause.map((cause, i) => (
                                <li key={i}>{cause}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {improvement.actions.length > 0 && improvement.actions[0] !== 'See details' && (
                          <div>
                            <p className="font-medium text-mc-text mb-1">Actions Taken:</p>
                            <ul className="list-disc list-inside text-mc-text-secondary space-y-1">
                              {improvement.actions.map((action, i) => (
                                <li key={i}>{action}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {improvement.outcome && (
                          <p className="text-mc-text-secondary">
                            <span className="font-medium text-mc-text">Outcome:</span> {improvement.outcome}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
