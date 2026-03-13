'use client';

import { useState, useEffect } from 'react';
import { Bug, AlertCircle, CheckCircle, Clock, Plus, ExternalLink } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

interface BugReport {
  id: string;
  tool_name: string;
  description: string;
  status: 'new' | 'in_progress' | 'fixed' | 'duplicate' | 'wont_fix' | 'confirmed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  created_at: string;
  updated_at: string;
  user_email?: string;
  error_details?: string;
  reproduction_steps?: string;
  expected_behavior?: string;
  actual_behavior?: string;
  user_agent?: string;
  mc_task_id?: string; // If a task was created for this bug
}

// Detect "All good" QA confirmations (not real bugs)
const isAllGoodReport = (description: string): boolean => {
  const lowerDesc = description.toLowerCase();
  return (
    lowerDesc.includes('all good') ||
    lowerDesc.includes('works good') ||
    lowerDesc.includes('works fine') ||
    lowerDesc.includes('working fine') ||
    lowerDesc.includes('no issues') ||
    (lowerDesc.includes('[bug]') && lowerDesc.replace('[bug]', '').trim().toLowerCase() === 'all good') ||
    (lowerDesc.includes('[other]') && (lowerDesc.includes('good') || lowerDesc.includes('fine')))
  );
};

interface BugReportsProps {
  workspaceId: string;
}

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-mc-accent-red/20 text-mc-accent-red border-mc-accent-red',
  in_progress: 'bg-mc-accent-yellow/20 text-mc-accent-yellow border-mc-accent-yellow',
  fixed: 'bg-mc-accent-green/20 text-mc-accent-green border-mc-accent-green',
  duplicate: 'bg-mc-text-tertiary/20 text-mc-text-tertiary border-mc-text-tertiary',
  wont_fix: 'bg-mc-text-tertiary/20 text-mc-text-tertiary border-mc-text-tertiary',
  confirmed: 'bg-mc-accent-green/20 text-mc-accent-green border-mc-accent-green',
};

const PRIORITY_COLORS = {
  low: 'bg-mc-accent-green/20 text-mc-accent-green',
  medium: 'bg-mc-accent-yellow/20 text-mc-accent-yellow',
  high: 'bg-mc-accent-red/20 text-mc-accent-red',
  critical: 'bg-mc-accent-purple/20 text-mc-accent-purple',
};

export function BugReports({ workspaceId }: BugReportsProps) {
  const [bugs, setBugs] = useState<BugReport[]>([]);
  const [filteredBugs, setFilteredBugs] = useState<BugReport[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [selectedBug, setSelectedBug] = useState<BugReport | null>(null);
  const [creatingTask, setCreatingTask] = useState<string | null>(null);
  const [showConfirmed, setShowConfirmed] = useState(false);
  const [dismissingAll, setDismissingAll] = useState(false);

  const loadBugReports = async () => {
    try {
      const res = await fetch('/api/bugs');
      if (res.ok) {
        const data = await res.json();
        setBugs(data);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Failed to load bug reports:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBugReports();

    // Auto-refresh every 5 minutes
    const interval = setInterval(loadBugReports, 300000);
    return () => clearInterval(interval);
  }, []);

  // Separate "All good" confirmations from real bugs
  const allGoodReports = bugs.filter(bug => 
    isAllGoodReport(bug.description) && bug.status !== 'confirmed'
  );
  const confirmedReports = bugs.filter(bug => bug.status === 'confirmed');
  const realBugs = bugs.filter(bug => 
    !isAllGoodReport(bug.description) && bug.status !== 'confirmed'
  );

  // Filter bugs based on selected filters
  useEffect(() => {
    let filtered = realBugs;
    
    if (selectedStatus !== 'all') {
      filtered = filtered.filter(bug => bug.status === selectedStatus);
    }
    
    if (selectedPriority !== 'all') {
      filtered = filtered.filter(bug => bug.priority === selectedPriority);
    }

    setFilteredBugs(filtered);
  }, [bugs, selectedStatus, selectedPriority]);

  const createTaskForBug = async (bug: BugReport) => {
    setCreatingTask(bug.id);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Fix bug in ${bug.tool_name}`,
          description: `Bug report: ${bug.description}\n\n**User Email:** ${bug.user_email || 'Anonymous'}\n\n**Steps to Reproduce:**\n${bug.reproduction_steps || 'Not provided'}\n\n**Expected Behavior:**\n${bug.expected_behavior || 'Not provided'}\n\n**Actual Behavior:**\n${bug.actual_behavior || 'Not provided'}\n\n**Error Details:**\n${bug.error_details || 'None'}\n\n**User Agent:**\n${bug.user_agent || 'Not provided'}\n\n**Bug Report ID:** ${bug.id}`,
          priority: bug.priority === 'critical' ? 'urgent' : bug.priority === 'high' ? 'high' : 'normal',
          workspace_id: workspaceId,
        }),
      });

      if (res.ok) {
        const task = await res.json();
        
        // Update the bug to link it to the task
        await fetch(`/api/bugs/${bug.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'in_progress',
            mc_task_id: task.id,
          }),
        });

        loadBugReports(); // Refresh the list
      }
    } catch (error) {
      console.error('Failed to create task for bug:', error);
    } finally {
      setCreatingTask(null);
    }
  };

  const markAsDuplicate = async (bug: BugReport) => {
    try {
      await fetch(`/api/bugs/${bug.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'duplicate' }),
      });
      loadBugReports();
    } catch (error) {
      console.error('Failed to mark bug as duplicate:', error);
    }
  };

  const markAsConfirmed = async (bug: BugReport) => {
    try {
      await fetch(`/api/bugs/${bug.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed' }),
      });
      loadBugReports();
    } catch (error) {
      console.error('Failed to mark bug as confirmed:', error);
    }
  };

  const dismissAllGoodReports = async () => {
    if (allGoodReports.length === 0) return;
    
    setDismissingAll(true);
    try {
      // Batch dismiss all "All good" reports
      await Promise.all(
        allGoodReports.map(bug =>
          fetch(`/api/bugs/${bug.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'confirmed' }),
          })
        )
      );
      loadBugReports();
    } catch (error) {
      console.error('Failed to dismiss all good reports:', error);
    } finally {
      setDismissingAll(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-mc-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-mc-text-secondary">Loading bug reports...</p>
        </div>
      </div>
    );
  }

  const statusCounts = {
    all: realBugs.length,
    new: realBugs.filter(b => b.status === 'new').length,
    in_progress: realBugs.filter(b => b.status === 'in_progress').length,
    fixed: realBugs.filter(b => b.status === 'fixed').length,
    allGood: allGoodReports.length,
    confirmed: confirmedReports.length,
  };

  const newBugsCount = realBugs.filter(b => b.status === 'new').length;

  return (
    <div className="flex-1 overflow-hidden">
      <div className="h-full flex">
        {/* Main List */}
        <div className="flex-1 overflow-auto">
          <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold text-mc-text">Bug Reports</h2>
                  {newBugsCount > 0 && (
                    <div className="bg-mc-accent-red text-white text-xs px-2 py-1 rounded-full font-bold">
                      {newBugsCount} NEW
                    </div>
                  )}
                </div>
                <p className="text-mc-text-secondary">
                  Customer reported issues from Supabase{' '}
                  <a 
                    href="https://gist.github.com/Boscoeuk/5d41075977df2b8430fc79aca10e2403" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-mc-accent hover:underline inline-flex items-center gap-1"
                  >
                    View Bug Tracker <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
              </div>
              <div className="text-sm text-mc-text-secondary">
                Last updated: {format(lastUpdated, 'HH:mm:ss')}
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <Bug className="w-5 h-5 text-mc-accent-red" />
                  <div>
                    <p className="text-2xl font-bold text-mc-text">{statusCounts.new}</p>
                    <p className="text-sm text-mc-text-secondary">New Reports</p>
                  </div>
                </div>
              </div>

              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-mc-accent-yellow" />
                  <div>
                    <p className="text-2xl font-bold text-mc-text">{statusCounts.in_progress}</p>
                    <p className="text-sm text-mc-text-secondary">In Progress</p>
                  </div>
                </div>
              </div>

              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-mc-accent-green" />
                  <div>
                    <p className="text-2xl font-bold text-mc-text">{statusCounts.fixed}</p>
                    <p className="text-sm text-mc-text-secondary">Fixed</p>
                  </div>
                </div>
              </div>

              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-mc-accent" />
                  <div>
                    <p className="text-2xl font-bold text-mc-text">{statusCounts.all}</p>
                    <p className="text-sm text-mc-text-secondary">Total Reports</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-mc-text">Status:</label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="bg-mc-bg-secondary border border-mc-border rounded px-3 py-1 text-sm"
                >
                  <option value="all">All Real Bugs</option>
                  <option value="new">New</option>
                  <option value="in_progress">In Progress</option>
                  <option value="fixed">Fixed</option>
                  <option value="duplicate">Duplicate</option>
                  <option value="wont_fix">Won&apos;t Fix</option>
                  <option value="confirmed">Confirmed Working</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-mc-text">Priority:</label>
                <select
                  value={selectedPriority}
                  onChange={(e) => setSelectedPriority(e.target.value)}
                  className="bg-mc-bg-secondary border border-mc-border rounded px-3 py-1 text-sm"
                >
                  <option value="all">All</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>

            {/* "All Good" QA Confirmations Section */}
            {allGoodReports.length > 0 && (
              <div className="bg-mc-accent-green/10 border border-mc-accent-green/30 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-mc-accent-green" />
                    <div>
                      <p className="font-medium text-mc-text">
                        {allGoodReports.length} &quot;All Good&quot; QA Confirmation{allGoodReports.length !== 1 ? 's' : ''}
                      </p>
                      <p className="text-sm text-mc-text-secondary">
                        Tools confirmed working by tester — ready to dismiss
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowConfirmed(!showConfirmed)}
                      className="px-3 py-1 bg-mc-bg-secondary text-mc-text rounded text-sm font-medium hover:bg-mc-bg-tertiary"
                    >
                      {showConfirmed ? 'Hide' : 'Review'}
                    </button>
                    <button
                      onClick={dismissAllGoodReports}
                      disabled={dismissingAll}
                      className="px-3 py-1 bg-mc-accent-green text-white rounded text-sm font-medium hover:bg-mc-accent-green/80 disabled:opacity-50"
                    >
                      {dismissingAll ? 'Dismissing...' : 'Dismiss All'}
                    </button>
                  </div>
                </div>
                
                {showConfirmed && (
                  <div className="mt-4 space-y-2">
                    {allGoodReports.map((bug) => (
                      <div
                        key={bug.id}
                        className="flex items-center justify-between bg-mc-bg-secondary rounded p-3"
                      >
                        <div>
                          <span className="font-medium text-mc-text">{bug.tool_name}</span>
                          <span className="text-mc-text-secondary ml-2 text-sm">{bug.description}</span>
                        </div>
                        <button
                          onClick={() => markAsConfirmed(bug)}
                          className="px-2 py-1 text-xs bg-mc-accent-green/20 text-mc-accent-green rounded hover:bg-mc-accent-green/30"
                        >
                          Dismiss
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Bug List */}
            <div className="space-y-3">
              {filteredBugs.length === 0 ? (
                <div className="text-center py-12">
                  <Bug className="w-12 h-12 text-mc-text-tertiary mx-auto mb-3" />
                  <p className="text-mc-text-secondary">No bug reports found</p>
                  <p className="text-sm text-mc-text-secondary mt-1">
                    {selectedStatus !== 'all' || selectedPriority !== 'all' 
                      ? 'Try adjusting your filters'
                      : 'All systems running smoothly'
                    }
                  </p>
                </div>
              ) : (
                filteredBugs.map((bug) => (
                  <div
                    key={bug.id}
                    onClick={() => setSelectedBug(bug)}
                    className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4 hover:bg-mc-bg-tertiary cursor-pointer transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium text-mc-text">{bug.tool_name}</span>
                          <span className={`px-2 py-1 rounded text-xs font-medium border ${STATUS_COLORS[bug.status]}`}>
                            {bug.status.replace('_', ' ')}
                          </span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${PRIORITY_COLORS[bug.priority]}`}>
                            {bug.priority}
                          </span>
                          {bug.mc_task_id && (
                            <span className="px-2 py-1 rounded text-xs font-medium bg-mc-accent/20 text-mc-accent">
                              Task Created
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-mc-text mb-2 line-clamp-2">{bug.description}</p>
                        <div className="flex items-center gap-4 text-xs text-mc-text-secondary">
                          <span>{formatDistanceToNow(new Date(bug.created_at), { addSuffix: true })}</span>
                          {bug.user_email && <span>by {bug.user_email}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        {bug.status === 'new' && !bug.mc_task_id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              createTaskForBug(bug);
                            }}
                            disabled={creatingTask === bug.id}
                            className="flex items-center gap-1 px-3 py-1 bg-mc-accent text-white rounded text-xs font-medium hover:bg-mc-accent/80 disabled:opacity-50"
                          >
                            <Plus className="w-3 h-3" />
                            {creatingTask === bug.id ? 'Creating...' : 'Create Task'}
                          </button>
                        )}
                        {bug.mc_task_id && (
                          <a
                            href={`/tasks/${bug.mc_task_id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 px-3 py-1 bg-mc-bg-tertiary text-mc-text rounded text-xs font-medium hover:bg-mc-border"
                          >
                            <ExternalLink className="w-3 h-3" />
                            View Task
                          </a>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsDuplicate(bug);
                          }}
                          className="px-3 py-1 bg-mc-text-tertiary/20 text-mc-text-secondary rounded text-xs font-medium hover:bg-mc-text-tertiary/30"
                        >
                          Duplicate
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Bug Details Sidebar */}
        {selectedBug && (
          <div className="w-96 bg-mc-bg-secondary border-l border-mc-border overflow-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-mc-text">Bug Details</h3>
                <button
                  onClick={() => setSelectedBug(null)}
                  className="text-mc-text-secondary hover:text-mc-text"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-mc-text mb-2">Tool</h4>
                  <p className="text-mc-text-secondary">{selectedBug.tool_name}</p>
                </div>

                <div>
                  <h4 className="font-medium text-mc-text mb-2">Description</h4>
                  <p className="text-mc-text-secondary">{selectedBug.description}</p>
                </div>

                <div className="flex items-center gap-4">
                  <div>
                    <h4 className="font-medium text-mc-text mb-1">Status</h4>
                    <span className={`px-2 py-1 rounded text-xs font-medium border ${STATUS_COLORS[selectedBug.status]}`}>
                      {selectedBug.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div>
                    <h4 className="font-medium text-mc-text mb-1">Priority</h4>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${PRIORITY_COLORS[selectedBug.priority]}`}>
                      {selectedBug.priority}
                    </span>
                  </div>
                </div>

                {selectedBug.user_email && (
                  <div>
                    <h4 className="font-medium text-mc-text mb-2">Reported By</h4>
                    <p className="text-mc-text-secondary">{selectedBug.user_email}</p>
                  </div>
                )}

                {selectedBug.reproduction_steps && (
                  <div>
                    <h4 className="font-medium text-mc-text mb-2">Steps to Reproduce</h4>
                    <pre className="text-sm text-mc-text-secondary bg-mc-bg p-3 rounded whitespace-pre-wrap">
                      {selectedBug.reproduction_steps}
                    </pre>
                  </div>
                )}

                {selectedBug.expected_behavior && (
                  <div>
                    <h4 className="font-medium text-mc-text mb-2">Expected Behavior</h4>
                    <p className="text-mc-text-secondary">{selectedBug.expected_behavior}</p>
                  </div>
                )}

                {selectedBug.actual_behavior && (
                  <div>
                    <h4 className="font-medium text-mc-text mb-2">Actual Behavior</h4>
                    <p className="text-mc-text-secondary">{selectedBug.actual_behavior}</p>
                  </div>
                )}

                {selectedBug.error_details && (
                  <div>
                    <h4 className="font-medium text-mc-text mb-2">Error Details</h4>
                    <pre className="text-sm text-mc-text-secondary bg-mc-bg p-3 rounded whitespace-pre-wrap">
                      {selectedBug.error_details}
                    </pre>
                  </div>
                )}

                <div>
                  <h4 className="font-medium text-mc-text mb-2">Timeline</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-mc-text-secondary">Created:</span>
                      <span className="text-mc-text">{format(new Date(selectedBug.created_at), 'MMM d, yyyy HH:mm')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-mc-text-secondary">Updated:</span>
                      <span className="text-mc-text">{format(new Date(selectedBug.updated_at), 'MMM d, yyyy HH:mm')}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}