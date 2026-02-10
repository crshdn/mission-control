'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Send } from 'lucide-react';
import { AgentBanner } from '@/components/AgentBanner';
import { SkeletonList } from '@/components/LoadingSkeleton';
import type { GatewayMessagePart } from '@/lib/types';

type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string | GatewayMessagePart[];
  timestamp?: number;
};

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/gateway/chat');
      if (!res.ok) return;
      const data = (await res.json()) as { messages: ChatMessage[] };
      setMessages(data.messages ?? []);
    } catch {
      // keep existing
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Polling: 3s while sending, 15s otherwise
  useEffect(() => {
    const interval = sending ? 3_000 : 15_000;
    const id = setInterval(fetchHistory, interval);
    return () => clearInterval(id);
  }, [sending, fetchHistory]);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    setInput('');
    setSending(true);

    // Optimistic user message
    setMessages((prev) => [...prev, { role: 'user', content: text, timestamp: Date.now() }]);

    try {
      await fetch('/api/gateway/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      // Response arrives via polling
    } catch {
      // polling will pick up the actual state
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = e.currentTarget.value.trim();
      if (!text || sending) return;
      setInput('');
      setSending(true);
      setMessages((prev) => [...prev, { role: 'user', content: text, timestamp: Date.now() }]);
      fetch('/api/gateway/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      }).finally(() => {
        setSending(false);
        inputRef.current?.focus();
      });
    }
  };

  const toggleTool = (idx: number) =>
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 animate-fade-in flex flex-col" style={{ height: 'calc(100vh - 3.5rem)' }}>
      <AgentBanner />

      <h1 className="text-lg font-semibold text-mc-text mt-6 mb-4">Chat</h1>

      {/* Messages area */}
      <div className="flex-1 overflow-auto space-y-3 mb-4">
        {loading ? (
          <SkeletonList rows={6} />
        ) : messages.length === 0 ? (
          <div className="text-center py-12 text-mc-text-secondary">
            <p className="text-lg mb-2">No messages yet</p>
            <p className="text-sm">Send a message to the OpenClaw agent below.</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <MessageBubble
              key={idx}
              msg={msg}
              idx={idx}
              expandedTools={expandedTools}
              toggleTool={toggleTool}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="shrink-0 border-t border-mc-border pt-3">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={sending ? 'Waiting for response...' : 'Send a message...'}
            disabled={sending}
            rows={1}
            className="flex-1 resize-none rounded-lg border border-mc-border bg-mc-bg px-3 py-2 text-sm text-mc-text placeholder:text-mc-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-mc-accent disabled:opacity-50"
            style={{ minHeight: '2.5rem', maxHeight: '8rem' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
            }}
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="shrink-0 p-2.5 rounded-lg bg-mc-accent text-white hover:bg-mc-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="text-[10px] text-mc-text-secondary/50 mt-1">
          Enter to send, Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}

function MessageBubble({
  msg,
  idx,
  expandedTools,
  toggleTool,
}: {
  msg: ChatMessage;
  idx: number;
  expandedTools: Set<number>;
  toggleTool: (idx: number) => void;
}) {
  if (msg.role === 'system') {
    return (
      <div className="text-center">
        <span className="text-xs text-mc-text-secondary/60 italic">
          {typeof msg.content === 'string' ? msg.content : '[system]'}
        </span>
      </div>
    );
  }

  const isUser = msg.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? 'bg-mc-accent/15 text-mc-text'
            : 'bg-mc-bg-secondary border border-mc-border text-mc-text'
        }`}
      >
        {typeof msg.content === 'string' ? (
          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
        ) : (
          <div className="space-y-1">
            {(msg.content as GatewayMessagePart[]).map((part, pi) => {
              if (part.type === 'toolCall') {
                const toolIdx = idx * 1000 + pi;
                return (
                  <div key={pi}>
                    <button
                      onClick={() => toggleTool(toolIdx)}
                      className="text-xs text-mc-accent hover:underline"
                    >
                      {part.name ?? 'tool call'}
                    </button>
                    {expandedTools.has(toolIdx) && part.arguments && (
                      <pre className="mt-1 text-xs text-mc-text-secondary bg-mc-bg rounded p-2 overflow-x-auto max-h-40 border border-mc-border">
                        {formatArgs(part.arguments)}
                      </pre>
                    )}
                  </div>
                );
              }
              return (
                <p key={pi} className="whitespace-pre-wrap break-words">
                  {part.text ?? ''}
                </p>
              );
            })}
          </div>
        )}
        {msg.timestamp && (
          <span className="block text-[10px] text-mc-text-secondary/50 mt-1">
            {new Date(msg.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}

function formatArgs(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
