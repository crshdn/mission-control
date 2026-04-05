'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Send, Check, Loader, MessageSquare } from 'lucide-react';
import { MentionInput } from './MentionInput';
import type { TaskNote } from '@/lib/types';

interface ChatConversationProps {
  taskId: string;
  onMarkRead?: () => void;
}

export function ChatConversation({ taskId, onMarkRead }: ChatConversationProps) {
  const [notes, setNotes] = useState<TaskNote[]>([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevNotesLenRef = useRef(0);

  const loadNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/chat`);
      if (res.ok) {
        const data: TaskNote[] = await res.json();
        setNotes(data);
        // Auto-mark as read when new messages arrive
        if (data.length > prevNotesLenRef.current && onMarkRead) {
          onMarkRead();
        }
        prevNotesLenRef.current = data.length;
      }
    } catch {
      // Silent
    }
  }, [taskId, onMarkRead]);

  useEffect(() => {
    loadNotes();
    const interval = setInterval(loadNotes, 2000);
    return () => clearInterval(interval);
  }, [loadNotes]);

  const waiting = useMemo(() => {
    if (notes.length === 0) return false;
    const last = notes[notes.length - 1];
    if (last.role === 'assistant') return false;
    if (last.role !== 'user') return false;
    const age = Date.now() - new Date(last.created_at).getTime();
    return age < 300000;
  }, [notes]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [notes, waiting]);

  const handleSend = async (text?: string) => {
    const msg = text || message;
    if (!msg.trim() || sending) return;
    setError(null);
    setSending(true);

    try {
      const res = await fetch(`/api/tasks/${taskId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to send' }));
        setError(data.error || 'Failed to send message');
        return;
      }

      setMessage('');
      await loadNotes();
    } catch {
      setError('Network error — please try again');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {notes.length === 0 && !waiting && (
          <div className="text-center py-8">
            <MessageSquare className="w-7 h-7 text-mc-text-secondary mx-auto mb-2 opacity-40" />
            <p className="text-mc-text-secondary text-xs">No messages yet</p>
            <p className="text-mc-text-secondary/50 text-[10px] mt-1">
              Send a message — it dispatches automatically
            </p>
          </div>
        )}

        {notes.map(note => {
          const isAgent = note.role === 'assistant';
          return (
            <div key={note.id} className={isAgent ? 'mr-6' : 'ml-6'}>
              <div className={`border rounded-lg px-2.5 py-1.5 ${
                isAgent
                  ? 'bg-green-500/10 border-green-500/20'
                  : 'bg-blue-500/10 border-blue-500/20'
              }`}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10px] font-medium text-mc-text-secondary">
                    {isAgent ? 'Agent' : 'You'}
                  </span>
                  {!isAgent && note.status === 'pending' && (
                    <span className="flex items-center gap-0.5 text-[10px] text-amber-400">
                      <Loader className="w-2.5 h-2.5 animate-spin" />
                      Sending
                    </span>
                  )}
                  {!isAgent && note.status === 'delivered' && (
                    <span className="flex items-center gap-0.5 text-[10px] text-green-400">
                      <Check className="w-2.5 h-2.5" />
                    </span>
                  )}
                  <span className="ml-auto text-[10px] text-mc-text-secondary/40">
                    {new Date(note.created_at.endsWith('Z') ? note.created_at : note.created_at + 'Z').toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-xs text-mc-text whitespace-pre-wrap leading-relaxed">{note.content}</div>
              </div>
            </div>
          );
        })}

        {waiting && (
          <div className="mr-6">
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1.5">
              <span className="text-[10px] font-medium text-mc-text-secondary">Agent</span>
              <div className="flex gap-0.5">
                <span className="w-1 h-1 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-mc-border p-2 space-y-1.5 flex-shrink-0">
        {error && (
          <div className="text-[10px] text-red-400 px-1">{error}</div>
        )}
        <MentionInput
          taskId={taskId}
          value={message}
          onChange={setMessage}
          onSend={() => handleSend()}
          sending={sending}
          placeholder="Message the agent... (@ to mention, / for commands)"
          onSlashCommand={(cmd) => {
            window.dispatchEvent(new CustomEvent('commandpalette:open', { detail: { filter: cmd, taskId } }));
          }}
        />
      </div>
    </div>
  );
}
