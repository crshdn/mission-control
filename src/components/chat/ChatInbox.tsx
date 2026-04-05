'use client';

import { MessageSquare, Bot, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { UnreadTask } from './ChatWidget';

interface ChatInboxProps {
  tasks: UnreadTask[];
  onSelectTask: (taskId: string, title: string) => void;
}

const statusColors: Record<string, string> = {
  inbox: 'bg-mc-accent-pink/20 text-mc-accent-pink',
  assigned: 'bg-mc-accent-yellow/20 text-mc-accent-yellow',
  in_progress: 'bg-mc-accent/20 text-mc-accent',
  convoy_active: 'bg-cyan-500/20 text-cyan-400',
  testing: 'bg-mc-accent-cyan/20 text-mc-accent-cyan',
  review: 'bg-mc-accent-purple/20 text-mc-accent-purple',
  verification: 'bg-orange-500/20 text-orange-400',
  planning: 'bg-purple-500/20 text-purple-400',
};

export function ChatInbox({ tasks, onSelectTask }: ChatInboxProps) {
  if (tasks.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <MessageSquare className="w-10 h-10 text-mc-text-secondary/30 mb-3" />
        <p className="text-sm text-mc-text-secondary">No conversations yet</p>
        <p className="text-xs text-mc-text-secondary/60 mt-1">
          Send a message to any task to start a conversation
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {tasks.map((task) => (
        <button
          key={task.task_id}
          onClick={() => onSelectTask(task.task_id, task.task_title)}
          className="w-full px-3 py-2.5 border-b border-mc-border/30 hover:bg-mc-bg-tertiary/50 transition-colors text-left flex gap-3 items-start"
        >
          {/* Avatar / Agent indicator */}
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-mc-bg-tertiary flex items-center justify-center text-sm mt-0.5">
            {task.assigned_agent_emoji || '🤖'}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium truncate">{task.task_title}</span>
              {task.unread_count > 0 && (
                <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 bg-mc-accent text-mc-bg text-[10px] font-bold rounded-full flex items-center justify-center">
                  {task.unread_count}
                </span>
              )}
            </div>

            {/* Preview */}
            {task.last_message_preview && (
              <p className="text-xs text-mc-text-secondary truncate mt-0.5">
                {task.last_message_role === 'assistant' && (
                  <Bot className="w-3 h-3 inline mr-1 opacity-60" />
                )}
                {task.last_message_role === 'user' && (
                  <User className="w-3 h-3 inline mr-1 opacity-60" />
                )}
                {task.last_message_preview}
              </p>
            )}

            {/* Meta row */}
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusColors[task.task_status] || 'bg-mc-bg-tertiary text-mc-text-secondary'}`}>
                {task.task_status.replace(/_/g, ' ')}
              </span>
              {task.assigned_agent_name && (
                <span className="text-[10px] text-mc-text-secondary truncate">
                  {task.assigned_agent_name}
                </span>
              )}
              {task.last_message_at && (
                <span className="text-[10px] text-mc-text-secondary/50 ml-auto flex-shrink-0">
                  {formatDistanceToNow(new Date(task.last_message_at.endsWith('Z') ? task.last_message_at : task.last_message_at + 'Z'), { addSuffix: true })}
                </span>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
