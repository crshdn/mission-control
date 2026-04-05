'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Command, Pause, Play, Save, ArrowRight, MessageSquare,
  Search, RefreshCw
} from 'lucide-react';

export interface PaletteCommand {
  id: string;
  label: string;
  description: string;
  category: 'agent' | 'navigation' | 'chat';
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void | Promise<void>;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
  initialFilter?: string;
}

export function CommandPalette({ isOpen, onClose, commands, initialFilter = '' }: CommandPaletteProps) {
  const [query, setQuery] = useState(initialFilter);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery(initialFilter);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, initialFilter]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase().replace(/^\//, '');
    return commands.filter(
      cmd => cmd.label.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q) ||
        cmd.id.toLowerCase().includes(q)
    );
  }, [query, commands]);

  const grouped = useMemo(() => {
    const groups: Record<string, PaletteCommand[]> = {};
    for (const cmd of filtered) {
      if (!groups[cmd.category]) groups[cmd.category] = [];
      groups[cmd.category].push(cmd);
    }
    return groups;
  }, [filtered]);

  const flatFiltered = useMemo(() => filtered, [filtered]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % flatFiltered.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + flatFiltered.length) % flatFiltered.length);
      return;
    }
    if (e.key === 'Enter' && flatFiltered.length > 0) {
      e.preventDefault();
      flatFiltered[selectedIndex]?.action();
      onClose();
      return;
    }
  }, [flatFiltered, selectedIndex, onClose]);

  if (!isOpen) return null;

  const categoryLabels: Record<string, string> = {
    agent: '🤖 Agent Commands',
    navigation: '🧭 Navigation',
    chat: '💬 Chat Actions',
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-lg bg-mc-bg-secondary border border-mc-border rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-mc-border">
          <Command className="w-4 h-4 text-mc-text-secondary flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-sm text-mc-text placeholder:text-mc-text-secondary/50 focus:outline-none"
          />
          <kbd className="text-[10px] text-mc-text-secondary bg-mc-bg-tertiary px-1.5 py-0.5 rounded">esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[360px] overflow-y-auto py-1">
          {flatFiltered.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-mc-text-secondary">
              No commands matching &ldquo;{query}&rdquo;
            </div>
          )}

          {Object.entries(grouped).map(([category, cmds]) => (
            <div key={category}>
              <div className="px-4 py-1.5 text-[10px] font-medium text-mc-text-secondary uppercase tracking-wider">
                {categoryLabels[category] || category}
              </div>
              {cmds.map(cmd => {
                const globalIndex = flatFiltered.indexOf(cmd);
                return (
                  <button
                    key={cmd.id}
                    onClick={() => { cmd.action(); onClose(); }}
                    className={`w-full px-4 py-2 flex items-center gap-3 text-left hover:bg-mc-bg-tertiary transition-colors ${
                      globalIndex === selectedIndex ? 'bg-mc-bg-tertiary' : ''
                    }`}
                  >
                    <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-mc-text-secondary">
                      {cmd.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-mc-text">{cmd.label}</span>
                      <span className="text-xs text-mc-text-secondary ml-2">{cmd.description}</span>
                    </div>
                    {cmd.shortcut && (
                      <kbd className="flex-shrink-0 text-[10px] text-mc-text-secondary bg-mc-bg px-1.5 py-0.5 rounded border border-mc-border">
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-mc-border/50 flex items-center gap-3 text-[10px] text-mc-text-secondary/50">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Default commands builder — call with task-specific context to get the standard command set
 */
export function buildDefaultCommands(options: {
  selectedTaskId?: string;
  onNavigateToTask?: (taskId: string) => void;
  onToggleChat?: () => void;
}): PaletteCommand[] {
  const { selectedTaskId, onNavigateToTask, onToggleChat } = options;

  const commands: PaletteCommand[] = [];

  // Agent commands (require a selected task)
  if (selectedTaskId) {
    commands.push(
      {
        id: 'pause',
        label: '/pause',
        description: 'Pause the current agent dispatch',
        category: 'agent',
        icon: <Pause className="w-4 h-4" />,
        action: async () => {
          await fetch(`/api/tasks/${selectedTaskId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'review' }),
          });
        },
      },
      {
        id: 'resume',
        label: '/resume',
        description: 'Resume / re-dispatch the agent',
        category: 'agent',
        icon: <Play className="w-4 h-4" />,
        action: async () => {
          await fetch(`/api/tasks/${selectedTaskId}/dispatch`, {
            method: 'POST',
          });
        },
      },
      {
        id: 'checkpoint',
        label: '/checkpoint',
        description: 'Force a checkpoint save',
        category: 'agent',
        icon: <Save className="w-4 h-4" />,
        action: async () => {
          await fetch(`/api/tasks/${selectedTaskId}/checkpoint`, {
            method: 'POST',
          });
        },
      },
      {
        id: 'redirect',
        label: '/redirect',
        description: 'Redirect task to a different status',
        category: 'agent',
        icon: <ArrowRight className="w-4 h-4" />,
        action: () => {
          if (onNavigateToTask) onNavigateToTask(selectedTaskId);
        },
      },
      {
        id: 'retry',
        label: '/retry',
        description: 'Retry dispatch from last checkpoint',
        category: 'agent',
        icon: <RefreshCw className="w-4 h-4" />,
        action: async () => {
          await fetch(`/api/tasks/${selectedTaskId}/checkpoint/restore`, {
            method: 'POST',
          });
        },
      }
    );
  }

  // Navigation commands
  commands.push(
    {
      id: 'search-tasks',
      label: 'Search tasks',
      description: 'Find a task by name',
      category: 'navigation',
      icon: <Search className="w-4 h-4" />,
      action: () => {
        // Focus on the main search — could dispatch a custom event
        document.querySelector<HTMLInputElement>('[data-search-input]')?.focus();
      },
    }
  );

  // Chat actions
  if (onToggleChat) {
    commands.push(
      {
        id: 'toggle-chat',
        label: 'Toggle Chat',
        description: 'Open or close the chat widget',
        category: 'chat',
        icon: <MessageSquare className="w-4 h-4" />,
        shortcut: '⌘⇧C',
        action: onToggleChat,
      }
    );
  }

  return commands;
}
