'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, X, Minimize2, Maximize2, ChevronLeft, Inbox } from 'lucide-react';
import { ChatConversation } from './ChatConversation';
import { ChatInbox } from './ChatInbox';

export interface UnreadTask {
  task_id: string;
  task_title: string;
  task_status: string;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_role: string | null;
  assigned_agent_name: string | null;
  assigned_agent_emoji: string | null;
}

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskTitle, setSelectedTaskTitle] = useState<string>('');
  const [unreadTasks, setUnreadTasks] = useState<UnreadTask[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks/unread');
      if (res.ok) {
        const data: UnreadTask[] = await res.json();
        setUnreadTasks(data);
        setTotalUnread(data.reduce((sum, t) => sum + t.unread_count, 0));
      }
    } catch {
      // Silent — will retry
    }
  }, []);

  useEffect(() => {
    fetchUnread();
    pollRef.current = setInterval(fetchUnread, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchUnread]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+Shift+C to toggle chat
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'c') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        if (selectedTaskId) {
          setSelectedTaskId(null);
        } else {
          setIsOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedTaskId]);

  // Listen for chat:toggle custom event (from CommandPalette)
  useEffect(() => {
    const handleToggle = () => setIsOpen(prev => !prev);
    window.addEventListener('chat:toggle', handleToggle);
    return () => window.removeEventListener('chat:toggle', handleToggle);
  }, []);

  const handleSelectTask = (taskId: string, title: string) => {
    setSelectedTaskId(taskId);
    setSelectedTaskTitle(title);
    // Mark as read
    fetch(`/api/tasks/${taskId}/read`, { method: 'POST' }).catch(() => {});
  };

  const handleBack = () => {
    setSelectedTaskId(null);
    fetchUnread(); // Refresh counts
  };

  const handleClose = () => {
    setIsOpen(false);
    setSelectedTaskId(null);
  };

  const widthClass = isExpanded ? 'w-[560px]' : 'w-[380px]';
  const heightClass = isExpanded ? 'h-[600px]' : 'h-[480px]';

  return (
    <>
      {/* Floating Chat Bubble */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-5 right-5 z-[45] w-14 h-14 bg-mc-accent rounded-full shadow-lg shadow-mc-accent/20 flex items-center justify-center hover:bg-mc-accent/90 transition-all hover:scale-105 group"
          title="Open Chat (⌘⇧C)"
        >
          <MessageSquare className="w-6 h-6 text-mc-bg" />
          {totalUnread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 bg-mc-accent-red text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div
          className={`fixed bottom-5 right-5 z-[45] ${widthClass} ${heightClass} max-h-[85vh] max-w-[95vw] bg-mc-bg-secondary border border-mc-border rounded-xl shadow-2xl shadow-black/40 flex flex-col overflow-hidden transition-all duration-200`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-mc-border bg-mc-bg-secondary flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {selectedTaskId && (
                <button
                  onClick={handleBack}
                  className="p-1 hover:bg-mc-bg-tertiary rounded transition-colors"
                  title="Back to inbox"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              {selectedTaskId ? (
                <span className="text-sm font-medium truncate" title={selectedTaskTitle}>
                  {selectedTaskTitle}
                </span>
              ) : (
                <div className="flex items-center gap-2">
                  <Inbox className="w-4 h-4 text-mc-accent" />
                  <span className="text-sm font-medium">Chat Inbox</span>
                  {unreadTasks.length > 0 && (
                    <span className="text-xs text-mc-text-secondary">
                      {unreadTasks.length} conversation{unreadTasks.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 hover:bg-mc-bg-tertiary rounded transition-colors"
                title={isExpanded ? 'Compact' : 'Expand'}
              >
                {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={handleClose}
                className="p-1.5 hover:bg-mc-bg-tertiary rounded transition-colors"
                title="Close (Esc)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            {selectedTaskId ? (
              <ChatConversation
                taskId={selectedTaskId}
                onMarkRead={() => {
                  fetch(`/api/tasks/${selectedTaskId}/read`, { method: 'POST' }).catch(() => {});
                }}
              />
            ) : (
              <ChatInbox
                tasks={unreadTasks}
                onSelectTask={handleSelectTask}
              />
            )}
          </div>

          {/* Footer hint */}
          <div className="px-3 py-1.5 border-t border-mc-border/50 bg-mc-bg flex-shrink-0">
            <span className="text-[10px] text-mc-text-secondary/50">
              ⌘⇧C toggle · Esc close · ⌘K commands · @ mention agents
            </span>
          </div>
        </div>
      )}
    </>
  );
}
