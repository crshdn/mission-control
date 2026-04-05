/**
 * useSSE Hook
 * Establishes and maintains Server-Sent Events connection for real-time updates
 */

'use client';


import { logger } from '@/lib/logger';
import { useEffect, useRef } from 'react';
import { useMissionControl } from '@/lib/store';
import { debug } from '@/lib/debug';
import { showToast } from '@/components/Toast';
import type { SSEEvent, Task } from '@/lib/types';
import { SSE_RECONNECT_DELAY_MS } from '@/lib/constants';

export function useSSE() {
  const eventSourceRef = useRef<EventSource | null>(null);
  // Use ref to track selectedTask ID without causing re-renders
  const selectedTaskIdRef = useRef<string | undefined>(undefined);
  const {
    updateTask,
    addTask,
    removeTask,
    setIsOnline,
    selectedTask,
    setSelectedTask,
  } = useMissionControl();

  // Update ref when selectedTask changes (outside the SSE effect)
  useEffect(() => {
    selectedTaskIdRef.current = selectedTask?.id;
  }, [selectedTask]);

  useEffect(() => {
    let mounted = true;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (!mounted) return;
      if (eventSourceRef.current?.readyState === EventSource.OPEN) {
        return;
      }

      debug.sse('Connecting to event stream...');

      const eventSource = new EventSource('/api/events/stream');
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        if (!mounted) return;
        debug.sse('Connected');
        setIsOnline(true);
        // Clear any pending reconnect
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }
      };

      eventSource.onmessage = (event) => {
        try {
          // Skip keep-alive messages (they start with ":")
          if (event.data.startsWith(':')) {
            return;
          }

          const sseEvent: SSEEvent = JSON.parse(event.data);
          debug.sse(`Received event: ${sseEvent.type}`, sseEvent.payload);

          switch (sseEvent.type) {
            case 'task_created':
              debug.sse('Adding new task to store', { id: (sseEvent.payload as Task).id });
              addTask(sseEvent.payload as Task);
              break;

            case 'task_updated':
              const incomingTask = sseEvent.payload as Task;
              debug.sse('Task update received', {
                id: incomingTask.id,
                status: incomingTask.status,
                title: incomingTask.title
              });
              updateTask(incomingTask);

              // Update selected task if viewing this task (for modal)
              // Use ref to avoid dependency on selectedTask
              if (selectedTaskIdRef.current === incomingTask.id) {
                debug.sse('Also updating selectedTask for modal');
                setSelectedTask(incomingTask);
              }
              break;

            case 'task_deleted':
              removeTask((sseEvent.payload as { id: string }).id);
              if (selectedTaskIdRef.current === (sseEvent.payload as { id: string }).id) {
                setSelectedTask(null);
              }
              break;

            case 'activity_logged':
              debug.sse('Activity logged', sseEvent.payload);
              // Activities are fetched when task detail is opened
              break;

            case 'deliverable_added':
              debug.sse('Deliverable added', sseEvent.payload);
              // Deliverables are fetched when task detail is opened
              break;

            case 'agent_spawned':
              debug.sse('Agent spawned', sseEvent.payload);
              // Will trigger re-fetch of sub-agent count
              break;

            case 'agent_completed':
              debug.sse('Agent completed', sseEvent.payload);
              break;

            case 'convoy_created':
            case 'convoy_progress':
            case 'convoy_completed':
              debug.sse(`Convoy event: ${sseEvent.type}`, sseEvent.payload);
              // Convoy events trigger task re-fetch via task_updated events
              break;

            case 'agent_health_changed':
              debug.sse('Agent health changed', sseEvent.payload);
              break;

            case 'checkpoint_saved':
              debug.sse('Checkpoint saved', sseEvent.payload);
              break;

            case 'mail_received':
              debug.sse('Mail received', sseEvent.payload);
              break;

            case 'research_started':
            case 'research_completed':
            case 'research_phase':
            case 'ideation_phase':
            case 'autopilot_activity':
            case 'ideas_generated':
            case 'idea_swiped':
            case 'idea_building':
            case 'idea_shipped':
            case 'maybe_resurfaced':
            case 'preference_updated':
              debug.sse(`Autopilot event: ${sseEvent.type}`, sseEvent.payload);
              // Surface autopilot errors as toasts
              if (sseEvent.type === 'autopilot_activity') {
                const p = sseEvent.payload as { eventType?: string; message?: string; detail?: string };
                if (p.eventType === 'error') {
                  showToast({
                    type: 'error',
                    title: p.message || 'Autopilot error',
                    message: p.detail,
                    duration: 0,
                  });
                }
              }
              break;

            case 'health_score_updated':
              debug.sse('Health score updated', sseEvent.payload);
              // Dispatch custom event for health score listeners
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('health-score-updated', { detail: sseEvent.payload }));
              }
              break;

            case 'cost_cap_warning':
              debug.sse('Cost cap warning', sseEvent.payload);
              showToast({
                type: 'warning',
                title: 'Cost cap warning',
                message: (sseEvent.payload as { message?: string }).message || 'Approaching cost limit',
              });
              break;

            case 'cost_cap_exceeded':
              debug.sse('Cost cap exceeded', sseEvent.payload);
              showToast({
                type: 'error',
                title: 'Cost cap exceeded',
                message: (sseEvent.payload as { message?: string }).message || 'Operations paused — cost limit reached',
                duration: 0,
              });
              break;

            default:
              debug.sse('Unknown event type', sseEvent);
          }
        } catch (error) {
          logger.error('[SSE] Error parsing event:', error);
        }
      };

      eventSource.onerror = (error) => {
        if (!mounted) return;
        debug.sse('Connection error', error);
        setIsOnline(false);

        // Close the connection
        eventSource.close();
        eventSourceRef.current = null;

        // Attempt reconnection after delay only if still mounted
        if (mounted) {
          reconnectTimeout = setTimeout(() => {
            if (mounted) {
              debug.sse('Attempting to reconnect...');
              connect();
            }
          }, SSE_RECONNECT_DELAY_MS);
        }
      };
    };

    // Initial connection
    connect();

    // Cleanup on unmount
    return () => {
      mounted = false;
      if (eventSourceRef.current) {
        debug.sse('Disconnecting...');
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
    };
  // selectedTask removed from deps to prevent re-connection loop
  // We use selectedTaskIdRef to check the current selected task ID without triggering re-renders
  }, [addTask, removeTask, updateTask, setIsOnline, setSelectedTask]);
}
