'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, RefreshCw, Clock, Bot, User, ChevronDown, ChevronRight } from 'lucide-react';

interface HistoryMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{ type: string; text?: string; [key: string]: unknown }>;
  timestamp?: string;
  model?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

interface SessionInfo {
  id: string;
  channel?: string;
  model?: string;
  status?: string;
}

interface AgentHistoryTabProps {
  agentId: string;
  agentName: string;
}

function extractTextContent(content: HistoryMessage['content']): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((block) => block.type === 'text' && block.text)
      .map((block) => block.text as string)
      .join('\n');
  }
  return String(content);
}

function formatTime(timestamp?: string): string {
  if (!timestamp) return '';
  try {
    const date = new Date(timestamp);
    return date.toLocaleString('th-TH', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function AgentHistoryTab({ agentId, agentName }: AgentHistoryTabProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load sessions for this agent
  useEffect(() => {
    const loadSessions = async () => {
      setLoading(true);
      setError(null);
      try {
        // Get all live sessions from Gateway
        const res = await fetch('/api/openclaw/sessions');
        if (!res.ok) throw new Error('Failed to load sessions');
        
        const data = await res.json();
        
        // Gateway returns: { sessions: { sessions: [...], ts, count, ... } }
        let allSessions: SessionInfo[] = [];
        const sessionsData = data.sessions;
        
        if (Array.isArray(sessionsData)) {
          allSessions = sessionsData;
        } else if (sessionsData && typeof sessionsData === 'object' && Array.isArray(sessionsData.sessions)) {
          allSessions = sessionsData.sessions.map((s: Record<string, unknown>) => ({
            id: (s.key as string) || '',
            channel: s.channel as string,
            model: s.model as string,
            status: s.kind as string,
          }));
        }

        // Filter sessions for this agent
        const nameLower = agentName.toLowerCase();
        const agentSessions = allSessions.filter((s: SessionInfo) => {
          const sid = (s.id || '').toLowerCase();
          return sid.includes(`agent:${nameLower}`) || sid.includes(agentId.toLowerCase());
        });

        setSessions(agentSessions);

        // Auto-select the first session
        if (agentSessions.length > 0 && !selectedSession) {
          setSelectedSession(agentSessions[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    loadSessions();
  }, [agentId, agentName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load history for selected session
  useEffect(() => {
    if (!selectedSession) return;

    const loadHistory = async () => {
      setHistoryLoading(true);
      try {
        const res = await fetch(
          `/api/openclaw/sessions/${encodeURIComponent(selectedSession)}/history`
        );
        if (!res.ok) throw new Error('Failed to load history');
        
        const data = await res.json();
        const msgs = data.history || data || [];
        setHistory(msgs);
      } catch (err) {
        console.error('Failed to load history:', err);
        setHistory([]);
      } finally {
        setHistoryLoading(false);
      }
    };

    loadHistory();
  }, [selectedSession]);

  // Scroll to bottom when history loads
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-mc-accent animate-spin" />
        <span className="ml-3 text-mc-text-secondary">Loading sessions...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-mc-text-secondary">
        <p className="mb-3">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-3 py-2 bg-mc-bg-tertiary rounded hover:bg-mc-border text-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-mc-text-secondary">
        <span className="text-4xl mb-3">📭</span>
        <p className="text-sm">No chat history found for this agent.</p>
        <p className="text-xs mt-1">The agent may not have any active Gateway sessions.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Session Picker */}
      <div className="mb-4">
        <button
          onClick={() => setShowSessionPicker(!showSessionPicker)}
          className="w-full flex items-center justify-between bg-mc-bg rounded-lg border border-mc-border px-3 py-2 text-sm hover:border-mc-accent/50 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            {showSessionPicker ? (
              <ChevronDown className="w-4 h-4 text-mc-text-secondary flex-shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-mc-text-secondary flex-shrink-0" />
            )}
            <span className="font-mono truncate text-mc-text">
              {selectedSession || 'Select session'}
            </span>
          </div>
          <span className="text-xs text-mc-text-secondary ml-2 flex-shrink-0">
            {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </span>
        </button>

        {showSessionPicker && (
          <div className="mt-1 bg-mc-bg border border-mc-border rounded-lg overflow-hidden max-h-40 overflow-y-auto">
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSelectedSession(s.id);
                  setShowSessionPicker(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-mc-bg-tertiary transition-colors ${
                  selectedSession === s.id
                    ? 'bg-mc-accent/10 text-mc-accent'
                    : 'text-mc-text'
                }`}
              >
                <div className="font-mono text-xs truncate">{s.id}</div>
                <div className="flex items-center gap-2 mt-1">
                  {s.channel && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-mc-bg-tertiary rounded">
                      {s.channel}
                    </span>
                  )}
                  {s.model && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-mc-accent/10 rounded text-mc-accent">
                      {s.model.split('/').pop()}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto space-y-3 max-h-[400px]">
        {historyLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-mc-accent animate-spin" />
            <span className="ml-2 text-mc-text-secondary text-sm">Loading history...</span>
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-mc-text-secondary">
            <span className="text-3xl mb-2">💬</span>
            <p className="text-sm">No messages in this session yet.</p>
          </div>
        ) : (
          history
            .filter((msg) => msg.role !== 'system') // Hide system messages
            .map((msg, idx) => {
              const text = extractTextContent(msg.content);
              if (!text.trim()) return null;

              return (
                <div
                  key={idx}
                  className={`flex gap-3 ${
                    msg.role === 'user' ? 'flex-row-reverse' : ''
                  }`}
                >
                  {/* Avatar */}
                  <div className="flex-shrink-0 mt-1">
                    {msg.role === 'assistant' ? (
                      <div className="w-8 h-8 rounded-full bg-mc-accent/20 flex items-center justify-center">
                        <Bot className="w-4 h-4 text-mc-accent" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-mc-accent-purple/20 flex items-center justify-center">
                        <User className="w-4 h-4 text-mc-accent-purple" />
                      </div>
                    )}
                  </div>

                  {/* Bubble */}
                  <div
                    className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
                      msg.role === 'user'
                        ? 'bg-mc-accent/20 text-mc-text rounded-tr-sm'
                        : 'bg-mc-bg rounded-tl-sm border border-mc-border text-mc-text'
                    }`}
                  >
                    <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                      {text.length > 2000 ? text.slice(0, 2000) + '…' : text}
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-[10px] text-mc-text-secondary">
                      {msg.timestamp && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTime(msg.timestamp)}
                        </span>
                      )}
                      {msg.model && (
                        <span className="px-1 py-0.5 bg-mc-bg-tertiary rounded">
                          {msg.model.split('/').pop()}
                        </span>
                      )}
                      {msg.usage && (
                        <span>
                          {(msg.usage.input_tokens || 0) + (msg.usage.output_tokens || 0)} tok
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
