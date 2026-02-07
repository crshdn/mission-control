/**
 * useSSE Hook
 * Establishes and maintains Server-Sent Events connection for real-time updates
 */

'use client';

import { useEffect, useRef } from 'react';
import { useMissionControl } from '@/lib/store';
import { debug } from '@/lib/debug';
import type { SSEEvent, Task } from '@/lib/types';

export function useSSE() {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  // Use ref to track selectedTask ID without causing re-renders
  const selectedTaskIdRef = useRef<string | undefined>();
  const {
    updateTask,
    addTask,
    setIsOnline,
    selectedTask,
    setSelectedTask,
  } = useMissionControl();

  // Update ref when selectedTask changes (outside the SSE effect)
  useEffect(() => {
    selectedTaskIdRef.current = selectedTask?.id;
  }, [selectedTask]);

  useEffect(() => {
    let isConnecting = false;

    const connect = () => {
      if (isConnecting || eventSourceRef.current?.readyState === EventSource.OPEN) {
        return;
      }

      isConnecting = true;
      debug.sse('Connecting to event stream...');

      const eventSource = new EventSource('/api/events/stream');
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        debug.sse('Connected');
        setIsOnline(true);
        isConnecting = false;
        // Clear any pending reconnect
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
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

            default:
              debug.sse('Unknown event type', sseEvent);
          }
        } catch (error) {
          console.error('[SSE] Error parsing event:', error);
        }
      };

      eventSource.onerror = (error) => {
        debug.sse('Connection error', error);
        setIsOnline(false);
        isConnecting = false;

        // Close the connection
        eventSource.close();
        eventSourceRef.current = null;

        // Attempt reconnection after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          debug.sse('Attempting to reconnect...');
          connect();
        }, 5000);
      };
    };

    // Initial connection
    connect();

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        debug.sse('Disconnecting...');
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  // selectedTask and setSelectedTask removed from deps to prevent re-connection loop
  // We use selectedTaskIdRef to check the current selected task ID without triggering re-renders
  }, [addTask, updateTask, setIsOnline]);
}
