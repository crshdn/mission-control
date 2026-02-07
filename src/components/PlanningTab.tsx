'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle, Circle, Lock, AlertCircle, Loader2, X } from 'lucide-react';

interface PlanningOption {
  id: string;
  label: string;
}

interface PlanningQuestion {
  question: string;
  options: PlanningOption[];
}

interface PlanningMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface PlanningState {
  taskId: string;
  sessionKey?: string;
  messages: PlanningMessage[];
  currentQuestion?: PlanningQuestion;
  isComplete: boolean;
  spec?: {
    title: string;
    summary: string;
    deliverables: string[];
    success_criteria: string[];
    constraints: Record<string, unknown>;
  };
  agents?: Array<{
    name: string;
    role: string;
    avatar_emoji: string;
    soul_md: string;
    instructions: string;
  }>;
  isStarted: boolean;
}

interface PlanningTabProps {
  taskId: string;
  onSpecLocked?: () => void;
}

export function PlanningTab({ taskId, onSpecLocked }: PlanningTabProps) {
  const [state, setState] = useState<PlanningState | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otherText, setOtherText] = useState('');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);

  // Refs to track polling state without triggering re-renders
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);
  const lastSubmissionRef = useRef<{ answer: string; otherText?: string } | null>(null);

  // Load planning state (initial load only)
  const loadState = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/planning`);
      if (res.ok) {
        const data = await res.json();
        setState(data);
        // Don't call onSpecLocked on initial load - only when planning completes actively
      }
    } catch (err) {
      console.error('Failed to load planning state:', err);
      setError('Failed to load planning state');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  // Stop polling (defined first to avoid circular dependency)
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
    setIsWaitingForResponse(false);
  }, []);

  // Poll for updates using the poll endpoint (lightweight OpenClaw check)
  const pollForUpdates = useCallback(async () => {
    if (isPollingRef.current) return; // Prevent overlapping polls
    isPollingRef.current = true;

    try {
      const res = await fetch(`/api/tasks/${taskId}/planning/poll`);
      if (res.ok) {
        const data = await res.json();

        if (data.hasUpdates) {
          setState(prev => ({
            ...prev!,
            messages: data.messages,
            isComplete: data.complete,
            spec: data.spec,
            agents: data.agents,
            currentQuestion: data.currentQuestion,
          }));

          // Only clear selection and other text when the question actually changes
          // This prevents clearing selection when getting updates for the same question
          const questionChanged = !state?.currentQuestion ||
            state.currentQuestion.question !== data.currentQuestion?.question;

          if (questionChanged) {
            setSelectedOption(null);
            setOtherText('');
          }

          if (data.complete && onSpecLocked) {
            onSpecLocked();
          }

          setIsWaitingForResponse(false);
          stopPolling(); // Stop polling when we get a response
        }
      }
    } catch (err) {
      console.error('Failed to poll for updates:', err);
    } finally {
      isPollingRef.current = false;
    }
  }, [taskId, onSpecLocked, stopPolling]);

  // Start polling when waiting for response
  const startPolling = useCallback(() => {
    stopPolling();
    setIsWaitingForResponse(true);

    // Poll every 2 seconds - need faster feedback for planning UX
    // Planning is typically short-lived, so this is acceptable
    pollingIntervalRef.current = setInterval(() => {
      pollForUpdates();
    }, 2000);

    // Set a 30-second timeout - if no response, show error
    // Don't clear selection - user can retry with same selection
    pollingTimeoutRef.current = setTimeout(() => {
      stopPolling();
      setError('Charlie is taking too long to respond. Please try submitting again or refresh the page.');
    }, 30000);
  }, [pollForUpdates, stopPolling]);

  // Initial load
  useEffect(() => {
    loadState();
    return () => stopPolling();
  }, [loadState, stopPolling]);

  // Start planning session
  const startPlanning = async () => {
    setStarting(true);
    setError(null);

    try {
      const res = await fetch(`/api/tasks/${taskId}/planning`, { method: 'POST' });
      const data = await res.json();

      if (res.ok) {
        setState(prev => ({
          ...prev!,
          sessionKey: data.sessionKey,
          messages: data.messages || [],
          isStarted: true,
        }));

        // Start polling for the first question
        startPolling();
      } else {
        setError(data.error || 'Failed to start planning');
      }
    } catch (err) {
      setError('Failed to start planning');
    } finally {
      setStarting(false);
    }
  };

  // Submit answer
  const submitAnswer = async () => {
    if (!selectedOption) return;

    setSubmitting(true);
    setError(null);

    // Store submission for retry
    const submission = {
      answer: selectedOption === 'other' ? 'Other' : selectedOption,
      otherText: selectedOption === 'other' ? otherText : undefined,
    };
    lastSubmissionRef.current = submission;

    try {
      const res = await fetch(`/api/tasks/${taskId}/planning/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submission),
      });

      const data = await res.json();

      if (res.ok) {
        // Start polling for the next question or completion
        // Don't clear selection yet - keep it visible while waiting for response
        startPolling();
      } else {
        setError(data.error || 'Failed to submit answer');
        // Clear selection on error so user can try again
        setSelectedOption(null);
        setOtherText('');
      }
    } catch (err) {
      setError('Failed to submit answer');
      // Clear selection on error so user can try again
      setSelectedOption(null);
      setOtherText('');
    } finally {
      setSubmitting(false);
    }
  };

  // Retry last submission
  const handleRetry = async () => {
    const submission = lastSubmissionRef.current;
    if (!submission) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/tasks/${taskId}/planning/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submission),
      });

      const data = await res.json();

      if (res.ok) {
        startPolling();
      } else {
        setError(data.error || 'Failed to submit answer');
      }
    } catch (err) {
      setError('Failed to submit answer');
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel planning
  const cancelPlanning = async () => {
    if (!confirm('Are you sure you want to cancel planning? This will reset the planning state.')) {
      return;
    }

    setCanceling(true);
    setError(null);
    stopPolling(); // Stop polling when canceling

    try {
      const res = await fetch(`/api/tasks/${taskId}/planning`, {
        method: 'DELETE',
      });

      if (res.ok) {
        // Reset state
        setState({
          taskId,
          isStarted: false,
          messages: [],
          isComplete: false,
        });
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to cancel planning');
      }
    } catch (err) {
      setError('Failed to cancel planning');
    } finally {
      setCanceling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-mc-accent" />
        <span className="ml-2 text-mc-text-secondary">Loading planning state...</span>
      </div>
    );
  }

  // Planning complete - show spec and agents
  if (state?.isComplete && state?.spec) {
    return (
      <div className="p-4 space-y-6">
        <div className="flex items-center gap-2 text-green-400">
          <Lock className="w-5 h-5" />
          <span className="font-medium">Planning Complete</span>
        </div>
        
        {/* Spec Summary */}
        <div className="bg-mc-bg border border-mc-border rounded-lg p-4">
          <h3 className="font-medium mb-2">{state.spec.title}</h3>
          <p className="text-sm text-mc-text-secondary mb-4">{state.spec.summary}</p>
          
          {state.spec.deliverables?.length > 0 && (
            <div className="mb-3">
              <h4 className="text-sm font-medium mb-1">Deliverables:</h4>
              <ul className="list-disc list-inside text-sm text-mc-text-secondary">
                {state.spec.deliverables.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}
          
          {state.spec.success_criteria?.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-1">Success Criteria:</h4>
              <ul className="list-disc list-inside text-sm text-mc-text-secondary">
                {state.spec.success_criteria.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        
        {/* Generated Agents */}
        {state.agents && state.agents.length > 0 && (
          <div>
            <h3 className="font-medium mb-2">Agents Created:</h3>
            <div className="space-y-2">
              {state.agents.map((agent, i) => (
                <div key={i} className="bg-mc-bg border border-mc-border rounded-lg p-3 flex items-center gap-3">
                  <span className="text-2xl">{agent.avatar_emoji}</span>
                  <div>
                    <p className="font-medium">{agent.name}</p>
                    <p className="text-sm text-mc-text-secondary">{agent.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Not started - show start button
  if (!state?.isStarted) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-medium mb-2">Start Planning</h3>
          <p className="text-mc-text-secondary text-sm max-w-md">
            I&apos;ll ask you a few questions to understand exactly what you need. 
            All questions are multiple choice — just click to answer.
          </p>
        </div>
        
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}
        
        <button
          onClick={startPlanning}
          disabled={starting}
          className="px-6 py-3 bg-mc-accent text-mc-bg rounded-lg font-medium hover:bg-mc-accent/90 disabled:opacity-50 flex items-center gap-2"
        >
          {starting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Starting...
            </>
          ) : (
            <>📋 Start Planning</>
          )}
        </button>
      </div>
    );
  }

  // Show current question
  return (
    <div className="flex flex-col h-full">
      {/* Progress indicator with cancel button */}
      <div className="p-4 border-b border-mc-border flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-mc-text-secondary">
          <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
          <span>Planning in progress...</span>
        </div>
        <button
          onClick={cancelPlanning}
          disabled={canceling}
          className="flex items-center gap-2 px-3 py-2 text-sm text-mc-accent-red hover:bg-mc-accent-red/10 rounded disabled:opacity-50"
        >
          {canceling ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Canceling...
            </>
          ) : (
            <>
              <X className="w-4 h-4" />
              Cancel
            </>
          )}
        </button>
      </div>

      {/* Question area */}
      <div className="flex-1 overflow-y-auto p-6">
        {state?.currentQuestion ? (
          <div className="max-w-xl mx-auto">
            <h3 className="text-lg font-medium mb-6">
              {state.currentQuestion.question}
            </h3>

            <div className="space-y-3">
              {state.currentQuestion.options.map((option) => {
                const isSelected = selectedOption === option.label;
                const isOther = option.id === 'other' || option.label.toLowerCase() === 'other';

                return (
                  <div key={option.id}>
                    <button
                      onClick={() => setSelectedOption(option.label)}
                      disabled={submitting}
                      className={`w-full flex items-center gap-3 p-4 rounded-lg border transition-all text-left ${
                        isSelected
                          ? 'border-mc-accent bg-mc-accent/10'
                          : 'border-mc-border hover:border-mc-accent/50'
                      } disabled:opacity-50`}
                    >
                      <span className={`w-8 h-8 rounded flex items-center justify-center text-sm font-bold ${
                        isSelected ? 'bg-mc-accent text-mc-bg' : 'bg-mc-bg-tertiary'
                      }`}>
                        {option.id.toUpperCase()}
                      </span>
                      <span className="flex-1">{option.label}</span>
                      {isSelected && <CheckCircle className="w-5 h-5 text-mc-accent" />}
                    </button>

                    {/* Other text input */}
                    {isOther && isSelected && (
                      <div className="mt-2 ml-11">
                        <input
                          type="text"
                          value={otherText}
                          onChange={(e) => setOtherText(e.target.value)}
                          placeholder="Please specify..."
                          className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
                          disabled={submitting}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-red-400 text-sm">{error}</p>
                    {!isWaitingForResponse && lastSubmissionRef.current && (
                      <button
                        onClick={handleRetry}
                        disabled={submitting}
                        className="mt-2 text-xs text-red-400 hover:text-red-300 underline disabled:opacity-50"
                      >
                        {submitting ? 'Retrying...' : 'Retry'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Submit button */}
            <div className="mt-6">
              <button
                onClick={submitAnswer}
                disabled={!selectedOption || submitting || (selectedOption === 'Other' && !otherText.trim())}
                className="w-full px-6 py-3 bg-mc-accent text-mc-bg rounded-lg font-medium hover:bg-mc-accent/90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Continue →'
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-mc-accent mx-auto mb-2" />
              <p className="text-mc-text-secondary">
                {isWaitingForResponse ? 'Waiting for Charlie to respond...' : 'Waiting for next question...'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Conversation history (collapsed by default) */}
      {state?.messages && state.messages.length > 0 && (
        <details className="border-t border-mc-border">
          <summary className="p-3 text-sm text-mc-text-secondary cursor-pointer hover:bg-mc-bg-tertiary">
            View conversation ({state.messages.length} messages)
          </summary>
          <div className="p-3 space-y-2 max-h-48 overflow-y-auto bg-mc-bg">
            {state.messages.map((msg, i) => (
              <div key={i} className={`text-sm ${msg.role === 'user' ? 'text-mc-accent' : 'text-mc-text-secondary'}`}>
                <span className="font-medium">{msg.role === 'user' ? 'You' : 'Charlie'}:</span>{' '}
                <span className="opacity-75">{msg.content.substring(0, 100)}...</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
