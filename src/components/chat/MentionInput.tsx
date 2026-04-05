'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Loader } from 'lucide-react';

interface ChatAgent {
  id: string;
  name: string;
  avatar_emoji: string;
  role: string;
  status: string;
  is_assigned: boolean;
  is_convoy_member: boolean;
}

interface MentionInputProps {
  taskId: string;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  placeholder?: string;
  onSlashCommand?: (command: string) => void;
}

export function MentionInput({
  taskId,
  value,
  onChange,
  onSend,
  sending,
  placeholder,
  onSlashCommand,
}: MentionInputProps) {
  const [agents, setAgents] = useState<ChatAgent[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load agents for this task
  useEffect(() => {
    fetch(`/api/tasks/${taskId}/chat/agents`)
      .then(res => res.ok ? res.json() : [])
      .then(setAgents)
      .catch(() => {});
  }, [taskId]);

  const specialTargets = [
    { id: '__all__', name: 'all', avatar_emoji: '📢', role: 'Broadcast to all agents', status: 'standby', is_assigned: false, is_convoy_member: false },
    { id: '__lead__', name: 'lead', avatar_emoji: '⭐', role: 'Lead / assigned agent', status: 'standby', is_assigned: false, is_convoy_member: false },
  ];

  const filteredAgents = [...specialTargets, ...agents].filter(a =>
    a.name.toLowerCase().includes(mentionFilter.toLowerCase()) ||
    a.role.toLowerCase().includes(mentionFilter.toLowerCase())
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = newValue.slice(0, cursorPos);

    // Check for @ mention trigger
    const atIndex = textBeforeCursor.lastIndexOf('@');
    if (atIndex >= 0 && (atIndex === 0 || textBeforeCursor[atIndex - 1] === ' ')) {
      const query = textBeforeCursor.slice(atIndex + 1);
      if (!query.includes(' ')) {
        setMentionStart(atIndex);
        setMentionFilter(query);
        setShowMentions(true);
        setSelectedIndex(0);
        return;
      }
    }

    setShowMentions(false);

    // Check for / command trigger at start
    if (newValue.startsWith('/') && onSlashCommand) {
      onSlashCommand(newValue);
    }
  }, [onChange, onSlashCommand]);

  const insertMention = useCallback((agent: ChatAgent) => {
    if (mentionStart < 0) return;
    const before = value.slice(0, mentionStart);
    const cursorPos = inputRef.current?.selectionStart || value.length;
    const after = value.slice(cursorPos);
    const newValue = `${before}@${agent.name} ${after}`;
    onChange(newValue);
    setShowMentions(false);
    setMentionStart(-1);
    // Focus back
    setTimeout(() => {
      if (inputRef.current) {
        const pos = before.length + agent.name.length + 2; // @name + space
        inputRef.current.focus();
        inputRef.current.setSelectionRange(pos, pos);
      }
    }, 0);
  }, [mentionStart, value, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showMentions && filteredAgents.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredAgents.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredAgents.length) % filteredAgents.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredAgents[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentions(false);
        return;
      }
    }

    // Send on Enter (not Shift+Enter)
    if (e.key === 'Enter' && !e.shiftKey && !showMentions) {
      e.preventDefault();
      onSend();
    }
  }, [showMentions, filteredAgents, selectedIndex, insertMention, onSend]);

  return (
    <div className="relative">
      {/* Mention Dropdown */}
      {showMentions && filteredAgents.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-mc-bg-secondary border border-mc-border rounded-lg shadow-xl max-h-[200px] overflow-y-auto z-10">
          {filteredAgents.map((agent, i) => (
            <button
              key={agent.id}
              onClick={() => insertMention(agent)}
              className={`w-full px-3 py-2 flex items-center gap-2 text-left text-xs hover:bg-mc-bg-tertiary transition-colors ${
                i === selectedIndex ? 'bg-mc-bg-tertiary' : ''
              }`}
            >
              <span className="text-base">{agent.avatar_emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">{agent.name}</span>
                  {agent.is_assigned && (
                    <span className="text-[9px] px-1 py-0.5 bg-mc-accent/20 text-mc-accent rounded">assigned</span>
                  )}
                  {agent.is_convoy_member && (
                    <span className="text-[9px] px-1 py-0.5 bg-cyan-500/20 text-cyan-400 rounded">convoy</span>
                  )}
                  {agent.status === 'working' && (
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                  )}
                </div>
                <span className="text-mc-text-secondary truncate block">{agent.role}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-1.5">
        <textarea
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 bg-mc-bg border border-mc-border rounded-lg px-2.5 py-1.5 text-xs text-mc-text resize-none focus:outline-none focus:border-mc-accent/60"
          rows={2}
        />
        <button
          onClick={onSend}
          disabled={!value.trim() || sending}
          className="self-end min-h-9 min-w-9 flex items-center justify-center rounded-lg bg-mc-accent text-white hover:bg-mc-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {sending ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}
