'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Clock, AlertTriangle, Bug, ExternalLink, Play, Pause, CheckCircle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

interface QATest {
  id: string;
  tool_name: string;
  test_status: 'pending' | 'in_progress' | 'passed' | 'failed' | 'blocked';
  test_type: 'functional' | 'performance' | 'accessibility' | 'integration' | 'regression';
  last_tested: string;
  tester: string;
  issues_found: number;
  passed_checks: number;
  total_checks: number;
  notes?: string;
  bug_reports?: string[]; // IDs of related bug reports
}

interface BugReport {
  id: string;
  tool_name: string;
  description: string;
  status: 'new' | 'in_progress' | 'fixed' | 'duplicate' | 'wont_fix';
  priority: 'low' | 'medium' | 'high' | 'critical';
  created_at: string;
  mc_task_id?: string;
}

interface QATrackerProps {
  workspaceId: string;
}

const STATUS_COLORS = {
  pending: 'bg-mc-text-tertiary/20 text-mc-text-tertiary border-mc-text-tertiary',
  in_progress: 'bg-mc-accent-yellow/20 text-mc-accent-yellow border-mc-accent-yellow',
  passed: 'bg-mc-accent-green/20 text-mc-accent-green border-mc-accent-green',
  failed: 'bg-mc-accent-red/20 text-mc-accent-red border-mc-accent-red',
  blocked: 'bg-mc-accent-purple/20 text-mc-accent-purple border-mc-accent-purple',
};

const TEST_TYPE_COLORS = {
  functional: 'bg-mc-accent/20 text-mc-accent',
  performance: 'bg-mc-accent-yellow/20 text-mc-accent-yellow',
  accessibility: 'bg-mc-accent-green/20 text-mc-accent-green',
  integration: 'bg-mc-accent-purple/20 text-mc-accent-purple',
  regression: 'bg-mc-accent-red/20 text-mc-accent-red',
};

export function QATracker({ workspaceId }: QATrackerProps) {
  const [qaTests, setQATests] = useState<QATest[]>([]);
  const [filteredTests, setFilteredTests] = useState<QATest[]>([]);
  const [bugReports, setBugReports] = useState<BugReport[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedTestType, setSelectedTestType] = useState<string>('all');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [selectedTest, setSelectedTest] = useState<QATest | null>(null);
  const [creatingTask, setCreatingTask] = useState<string | null>(null);

  const loadQAData = async () => {
    try {
      // Load QA tests
      const qaRes = await fetch('/api/qa');
      if (qaRes.ok) {
        const qaData = await qaRes.json();
        setQATests(qaData);
      }

      // Load bug reports for linking
      const bugsRes = await fetch('/api/bugs');
      if (bugsRes.ok) {
        const bugsData = await bugsRes.json();
        setBugReports(bugsData);
      }

      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to load QA data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQAData();

    // Auto-refresh every 3 minutes
    const interval = setInterval(loadQAData, 180000);
    return () => clearInterval(interval);
  }, []);

  // Filter tests based on selected filters
  useEffect(() => {
    let filtered = qaTests;
    
    if (selectedStatus !== 'all') {
      filtered = filtered.filter(test => test.test_status === selectedStatus);
    }
    
    if (selectedTestType !== 'all') {
      filtered = filtered.filter(test => test.test_type === selectedTestType);
    }

    setFilteredTests(filtered);
  }, [qaTests, selectedStatus, selectedTestType]);

  const updateTestStatus = async (testId: string, status: QATest['test_status'], notes?: string) => {
    try {
      const res = await fetch(`/api/qa/${testId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          test_status: status,
          notes,
          last_tested: new Date().toISOString(),
        }),
      });

      if (res.ok) {
        loadQAData(); // Refresh the list
      }
    } catch (error) {
      console.error('Failed to update test status:', error);
    }
  };

  const createTaskForFailedTest = async (test: QATest) => {
    setCreatingTask(test.id);
    try {
      const relatedBugs = test.bug_reports ? 
        bugReports.filter(bug => test.bug_reports!.includes(bug.id)) : [];

      const bugContext = relatedBugs.length > 0 ? 
        `\n\n**Related Bug Reports:**\n${relatedBugs.map(bug => `- ${bug.description} (ID: ${bug.id})`).join('\n')}` : '';

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Fix QA failures in ${test.tool_name}`,
          description: `**QA Test Failed**\n\n**Tool:** ${test.tool_name}\n**Test Type:** ${test.test_type}\n**Issues Found:** ${test.issues_found}\n**Passed Checks:** ${test.passed_checks}/${test.total_checks}\n\n**Notes:**\n${test.notes || 'No additional notes'}\n\n**Last Tested:** ${format(new Date(test.last_tested), 'MMM d, yyyy HH:mm')}\n**Tester:** ${test.tester}${bugContext}\n\n**QA Test ID:** ${test.id}`,
          priority: test.issues_found > 3 ? 'urgent' : test.issues_found > 1 ? 'high' : 'normal',
          workspace_id: workspaceId,
        }),
      });

      if (res.ok) {
        const task = await res.json();
        
        // Update the test to link it to the task
        await fetch(`/api/qa/${test.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            test_status: 'blocked',
            notes: `${test.notes ? test.notes + '\n\n' : ''}Task created: ${task.id}`,
          }),
        });

        loadQAData(); // Refresh the list
      }
    } catch (error) {
      console.error('Failed to create task for failed test:', error);
    } finally {
      setCreatingTask(null);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-mc-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-mc-text-secondary">Loading QA tracker...</p>
        </div>
      </div>
    );
  }

  const statusCounts = {
    all: qaTests.length,
    pending: qaTests.filter(t => t.test_status === 'pending').length,
    in_progress: qaTests.filter(t => t.test_status === 'in_progress').length,
    passed: qaTests.filter(t => t.test_status === 'passed').length,
    failed: qaTests.filter(t => t.test_status === 'failed').length,
    blocked: qaTests.filter(t => t.test_status === 'blocked').length,
  };

  const overallProgress = qaTests.length > 0 ? 
    Math.round((statusCounts.passed / qaTests.length) * 100) : 0;

  const criticalFailures = qaTests.filter(t => 
    t.test_status === 'failed' && t.issues_found > 2
  ).length;

  return (
    <div className="flex-1 overflow-hidden">
      <div className="h-full flex">
        {/* Main Dashboard */}
        <div className="flex-1 overflow-auto">
          <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold text-mc-text">QA Tracker</h2>
                  <div className="bg-mc-accent text-white text-xs px-2 py-1 rounded-full font-bold">
                    {overallProgress}% COMPLETE
                  </div>
                  {criticalFailures > 0 && (
                    <div className="bg-mc-accent-red text-white text-xs px-2 py-1 rounded-full font-bold">
                      {criticalFailures} CRITICAL
                    </div>
                  )}
                </div>
                <p className="text-mc-text-secondary">Atelier Tools Testing Dashboard</p>
              </div>
              <div className="text-sm text-mc-text-secondary">
                Last updated: {format(lastUpdated, 'HH:mm:ss')}
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-mc-text-tertiary" />
                  <div>
                    <p className="text-2xl font-bold text-mc-text">{statusCounts.pending}</p>
                    <p className="text-sm text-mc-text-secondary">Pending</p>
                  </div>
                </div>
              </div>

              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <Play className="w-5 h-5 text-mc-accent-yellow" />
                  <div>
                    <p className="text-2xl font-bold text-mc-text">{statusCounts.in_progress}</p>
                    <p className="text-sm text-mc-text-secondary">Testing</p>
                  </div>
                </div>
              </div>

              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-mc-accent-green" />
                  <div>
                    <p className="text-2xl font-bold text-mc-text">{statusCounts.passed}</p>
                    <p className="text-sm text-mc-text-secondary">Passed</p>
                  </div>
                </div>
              </div>

              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <XCircle className="w-5 h-5 text-mc-accent-red" />
                  <div>
                    <p className="text-2xl font-bold text-mc-text">{statusCounts.failed}</p>
                    <p className="text-sm text-mc-text-secondary">Failed</p>
                  </div>
                </div>
              </div>

              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <Pause className="w-5 h-5 text-mc-accent-purple" />
                  <div>
                    <p className="text-2xl font-bold text-mc-text">{statusCounts.blocked}</p>
                    <p className="text-sm text-mc-text-secondary">Blocked</p>
                  </div>
                </div>
              </div>

              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-mc-accent" />
                  <div>
                    <p className="text-2xl font-bold text-mc-text">{overallProgress}%</p>
                    <p className="text-sm text-mc-text-secondary">Complete</p>
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
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="passed">Passed</option>
                  <option value="failed">Failed</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-mc-text">Test Type:</label>
                <select
                  value={selectedTestType}
                  onChange={(e) => setSelectedTestType(e.target.value)}
                  className="bg-mc-bg-secondary border border-mc-border rounded px-3 py-1 text-sm"
                >
                  <option value="all">All</option>
                  <option value="functional">Functional</option>
                  <option value="performance">Performance</option>
                  <option value="accessibility">Accessibility</option>
                  <option value="integration">Integration</option>
                  <option value="regression">Regression</option>
                </select>
              </div>
            </div>

            {/* QA Test List */}
            <div className="space-y-3">
              {filteredTests.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="w-12 h-12 text-mc-text-tertiary mx-auto mb-3" />
                  <p className="text-mc-text-secondary">No QA tests found</p>
                  <p className="text-sm text-mc-text-secondary mt-1">
                    {selectedStatus !== 'all' || selectedTestType !== 'all' 
                      ? 'Try adjusting your filters'
                      : 'Ready to set up your first QA tests'
                    }
                  </p>
                </div>
              ) : (
                filteredTests.map((test) => (
                  <div
                    key={test.id}
                    onClick={() => setSelectedTest(test)}
                    className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4 hover:bg-mc-bg-tertiary cursor-pointer transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium text-mc-text">{test.tool_name}</span>
                          <span className={`px-2 py-1 rounded text-xs font-medium border ${STATUS_COLORS[test.test_status]}`}>
                            {test.test_status.replace('_', ' ')}
                          </span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${TEST_TYPE_COLORS[test.test_type]}`}>
                            {test.test_type}
                          </span>
                          {test.issues_found > 0 && (
                            <span className="px-2 py-1 rounded text-xs font-medium bg-mc-accent-red/20 text-mc-accent-red">
                              {test.issues_found} issues
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mb-2">
                          <div className="text-sm text-mc-text">
                            Progress: {test.passed_checks}/{test.total_checks} checks
                            <div className="w-32 h-1 bg-mc-border rounded-full mt-1">
                              <div 
                                className="h-full bg-mc-accent rounded-full transition-all"
                                style={{ width: `${(test.passed_checks / test.total_checks) * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-mc-text-secondary">
                          <span>Tested: {formatDistanceToNow(new Date(test.last_tested), { addSuffix: true })}</span>
                          <span>by {test.tester}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        {test.test_status === 'failed' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              createTaskForFailedTest(test);
                            }}
                            disabled={creatingTask === test.id}
                            className="flex items-center gap-1 px-3 py-1 bg-mc-accent-red text-white rounded text-xs font-medium hover:bg-mc-accent-red/80 disabled:opacity-50"
                          >
                            <Bug className="w-3 h-3" />
                            {creatingTask === test.id ? 'Creating...' : 'Create Task'}
                          </button>
                        )}
                        {test.test_status === 'pending' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateTestStatus(test.id, 'in_progress');
                            }}
                            className="px-3 py-1 bg-mc-accent text-white rounded text-xs font-medium hover:bg-mc-accent/80"
                          >
                            Start Test
                          </button>
                        )}
                        {test.test_status === 'in_progress' && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateTestStatus(test.id, 'passed', 'All checks passed');
                              }}
                              className="px-3 py-1 bg-mc-accent-green text-white rounded text-xs font-medium hover:bg-mc-accent-green/80"
                            >
                              Pass
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateTestStatus(test.id, 'failed', 'Issues found during testing');
                              }}
                              className="px-3 py-1 bg-mc-accent-red text-white rounded text-xs font-medium hover:bg-mc-accent-red/80"
                            >
                              Fail
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Test Details Sidebar */}
        {selectedTest && (
          <div className="w-96 bg-mc-bg-secondary border-l border-mc-border overflow-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-mc-text">Test Details</h3>
                <button
                  onClick={() => setSelectedTest(null)}
                  className="text-mc-text-secondary hover:text-mc-text"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-mc-text mb-2">Tool</h4>
                  <p className="text-mc-text-secondary">{selectedTest.tool_name}</p>
                </div>

                <div className="flex items-center gap-4">
                  <div>
                    <h4 className="font-medium text-mc-text mb-1">Status</h4>
                    <span className={`px-2 py-1 rounded text-xs font-medium border ${STATUS_COLORS[selectedTest.test_status]}`}>
                      {selectedTest.test_status.replace('_', ' ')}
                    </span>
                  </div>
                  <div>
                    <h4 className="font-medium text-mc-text mb-1">Type</h4>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${TEST_TYPE_COLORS[selectedTest.test_type]}`}>
                      {selectedTest.test_type}
                    </span>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-mc-text mb-2">Progress</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-mc-text-secondary">Checks passed:</span>
                      <span className="text-mc-text">{selectedTest.passed_checks}/{selectedTest.total_checks}</span>
                    </div>
                    <div className="w-full h-2 bg-mc-border rounded-full">
                      <div 
                        className="h-full bg-mc-accent rounded-full transition-all"
                        style={{ width: `${(selectedTest.passed_checks / selectedTest.total_checks) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>

                {selectedTest.issues_found > 0 && (
                  <div>
                    <h4 className="font-medium text-mc-text mb-2">Issues Found</h4>
                    <div className="bg-mc-accent-red/10 border border-mc-accent-red/20 rounded p-3">
                      <div className="flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-mc-accent-red" />
                        <span className="text-mc-accent-red font-medium">{selectedTest.issues_found} issues</span>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="font-medium text-mc-text mb-2">Tester</h4>
                  <p className="text-mc-text-secondary">{selectedTest.tester}</p>
                </div>

                {selectedTest.notes && (
                  <div>
                    <h4 className="font-medium text-mc-text mb-2">Notes</h4>
                    <pre className="text-sm text-mc-text-secondary bg-mc-bg p-3 rounded whitespace-pre-wrap">
                      {selectedTest.notes}
                    </pre>
                  </div>
                )}

                {selectedTest.bug_reports && selectedTest.bug_reports.length > 0 && (
                  <div>
                    <h4 className="font-medium text-mc-text mb-2">Related Bug Reports</h4>
                    <div className="space-y-2">
                      {selectedTest.bug_reports.map(bugId => {
                        const bug = bugReports.find(b => b.id === bugId);
                        return bug ? (
                          <div key={bugId} className="bg-mc-bg p-2 rounded border border-mc-border">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-mc-text">{bug.description}</p>
                                <p className="text-xs text-mc-text-secondary">Priority: {bug.priority}</p>
                              </div>
                              {bug.mc_task_id && (
                                <a
                                  href={`/tasks/${bug.mc_task_id}`}
                                  className="flex items-center gap-1 px-2 py-1 bg-mc-accent/20 text-mc-accent rounded text-xs font-medium hover:bg-mc-accent/30"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  Task
                                </a>
                              )}
                            </div>
                          </div>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="font-medium text-mc-text mb-2">Timeline</h4>
                  <div className="text-sm text-mc-text-secondary">
                    Last tested: {format(new Date(selectedTest.last_tested), 'MMM d, yyyy HH:mm')}
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