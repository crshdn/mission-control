'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, X, Send, Loader2, Minimize2, Maximize2 } from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  status?: 'sending' | 'sent' | 'error' | 'timeout';
}

export function ChatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      inputRef.current?.focus();
    }
  }, [isOpen, isMinimized]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
      status: 'sending',
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsSending(true);
    setError(null);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          sessionId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send message');
      }

      // Save session ID for future messages
      if (data.sessionId) {
        setSessionId(data.sessionId);
      }

      // Update user message status
      setMessages((prev) =>
        prev.map((m) =>
          m.id === userMsg.id ? { ...m, status: 'sent' } : m
        )
      );

      if (data.status === 'ok' && data.response) {
        const assistantMsg: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.response,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else if (data.status === 'timeout') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === userMsg.id ? { ...m, status: 'timeout' } : m
          )
        );
        setError('Eve is still thinking... Response may appear later.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setMessages((prev) =>
        prev.map((m) =>
          m.id === userMsg.id ? { ...m, status: 'error' } : m
        )
      );
      setError(errorMessage);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Floating button when closed
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-mc-accent rounded-full shadow-lg hover:bg-mc-accent/90 transition-all hover:scale-105 flex items-center justify-center group"
        title="Chat with Eve"
      >
        <MessageSquare className="w-6 h-6 text-mc-bg" />
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-mc-accent-green rounded-full border-2 border-mc-bg animate-pulse" />
        {/* Tooltip */}
        <span className="absolute right-full mr-3 px-3 py-1.5 bg-mc-bg-secondary text-mc-text text-sm rounded-lg border border-mc-border opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
          Chat with Eve 💬
        </span>
      </button>
    );
  }

  // Minimized bar
  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 bg-mc-bg-secondary border border-mc-border rounded-lg shadow-xl flex items-center gap-3 px-4 py-2">
        <span className="text-lg">🤖</span>
        <span className="text-sm font-medium">Eve Chat</span>
        {messages.length > 0 && (
          <span className="bg-mc-accent text-mc-bg text-xs px-2 py-0.5 rounded-full">
            {messages.length}
          </span>
        )}
        <button
          onClick={() => setIsMinimized(false)}
          className="p-1 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            setIsOpen(false);
            setIsMinimized(false);
          }}
          className="p-1 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Full chat panel
  return (
    <div className="fixed bottom-6 right-6 z-50 w-[420px] h-[600px] bg-mc-bg-secondary border border-mc-border rounded-xl shadow-2xl flex flex-col overflow-hidden animate-slide-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-mc-border bg-mc-bg-tertiary/50">
        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="text-2xl">🤖</span>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-mc-accent-green rounded-full border-2 border-mc-bg-secondary" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Eve</h3>
            <p className="text-xs text-mc-text-secondary">AI Orchestrator</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1.5 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary"
            title="Minimize"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <span className="text-4xl mb-3">💬</span>
            <p className="text-mc-text-secondary text-sm">
              Start chatting with Eve.<br />
              She&apos;s your AI orchestrator.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm ${
                msg.role === 'user'
                  ? 'bg-mc-accent text-mc-bg rounded-br-sm'
                  : 'bg-mc-bg-tertiary text-mc-text rounded-bl-sm'
              }`}
            >
              <div className="whitespace-pre-wrap break-words">{msg.content}</div>
              <div
                className={`flex items-center gap-2 mt-1 text-[10px] ${
                  msg.role === 'user'
                    ? 'text-mc-bg/60'
                    : 'text-mc-text-secondary'
                }`}
              >
                <span>
                  {msg.timestamp.toLocaleTimeString('th-TH', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                {msg.status === 'sending' && (
                  <Loader2 className="w-3 h-3 animate-spin" />
                )}
                {msg.status === 'error' && (
                  <span className="text-mc-accent-red">Failed</span>
                )}
                {msg.status === 'timeout' && (
                  <span className="text-mc-accent-yellow">Thinking...</span>
                )}
              </div>
            </div>
          </div>
        ))}

        {isSending && (
          <div className="flex justify-start">
            <div className="bg-mc-bg-tertiary rounded-xl rounded-bl-sm px-4 py-3">
              <div className="flex items-center gap-2 text-mc-text-secondary">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Eve is typing...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-mc-accent-red/10 border-t border-mc-accent-red/20">
          <p className="text-xs text-mc-accent-red">{error}</p>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-mc-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Eve..."
            rows={1}
            className="flex-1 bg-mc-bg border border-mc-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-mc-accent max-h-24"
            style={{
              height: 'auto',
              minHeight: '36px',
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = Math.min(target.scrollHeight, 96) + 'px';
            }}
            disabled={isSending}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isSending}
            className="p-2 bg-mc-accent text-mc-bg rounded-lg hover:bg-mc-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            {isSending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
