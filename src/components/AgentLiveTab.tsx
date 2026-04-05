'use client';

import { useState, useEffect, useRef } from 'react';
import { Radio, AlertCircle, Wifi, WifiOff } from 'lucide-react';

interface StreamMessage {
  index: number;
  role: string;
  content: string;
  stream?: string; // e.g. 'text', 'tool_use', 'thinking' for agent_stream events
  timestamp?: string;
}

type StreamStatus = 'connecting' | 'streaming' | 'no_session' | 'session_ended' | 'error' | 'disconnected';

interface AgentLiveTabProps {
  taskId: string;
}

export function AgentLiveTab({ taskId }: AgentLiveTabProps) {
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [streamBuffer, setStreamBuffer] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/tasks/${taskId}/agent-stream`);
    eventSourceRef.current = es;

    es.onopen = () => {
      // Connection established, waiting for data
    };

    es.onmessage = (event) => {
      try {
        if (event.data.startsWith(':')) return; // skip comments

        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'message':
            // Complete chat turn (user or assistant)
            setMessages(prev => {
              if (prev.some(m => m.index === data.index)) return prev;
              return [...prev, {
                index: data.index,
                role: data.role,
                content: data.content,
                timestamp: data.timestamp,
              }];
            });
            // Clear stream buffer when a complete message arrives
            setStreamBuffer({});
            break;

          case 'agent_stream':
            // Real-time streaming token from agent
            setStreamBuffer(prev => {
              const streamType = data.stream || 'text';
              const current = prev[streamType] || '';
              return { ...prev, [streamType]: current + (data.data || '') };
            });
            break;

          case 'streaming':
            setStatus('streaming');
            break;
          case 'no_session':
            setStatus('no_session');
            break;
          case 'session_ended':
            setStatus('session_ended');
            break;
          case 'gateway_disconnected':
            setStatus('disconnected');
            break;
          case 'error':
            setStatus('error');
            break;
        }
      } catch {
        // Ignore parse errors
      }
    };

    es.onerror = () => {
      setStatus('disconnected');
      // EventSource will auto-reconnect
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [taskId]);

  // Auto-scroll on new messages or stream updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamBuffer]);

  const roleStyles: Record<string, { bg: string; label: string; align: string }> = {
    user: { bg: 'bg-blue-500/10 border-blue-500/20', label: 'Operator', align: 'ml-8' },
    assistant: { bg: 'bg-green-500/10 border-green-500/20', label: 'Agent', align: 'mr-8' },
    system: { bg: 'bg-mc-bg-tertiary border-mc-border', label: 'System', align: 'mx-8' },
  };

  const streamTypeStyles: Record<string, { bg: string; label: string }> = {
    text: { bg: 'bg-green-500/10 border-green-500/20', label: 'Writing' },
    thinking: { bg: 'bg-purple-500/10 border-purple-500/20', label: 'Thinking' },
    tool_use: { bg: 'bg-cyan-500/10 border-cyan-500/20', label: 'Running tool' },
    tool_result: { bg: 'bg-cyan-500/10 border-cyan-500/20', label: 'Tool result' },
  };

  // Check if there's active streaming content
  const activeStreams = Object.entries(streamBuffer).filter(([, v]) => v.length > 0);

  return (
    <div className="flex flex-col h-full min-h-[400px]">
      {/* Status bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-mc-border text-xs">
        {status === 'streaming' && (
          <>
            <Radio className="w-3.5 h-3.5 text-green-400 animate-pulse" />
            <span className="text-green-400">Live</span>
          </>
        )}
        {status === 'connecting' && (
          <>
            <Wifi className="w-3.5 h-3.5 text-mc-text-secondary animate-pulse" />
            <span className="text-mc-text-secondary">Connecting...</span>
          </>
        )}
        {status === 'no_session' && (
          <>
            <WifiOff className="w-3.5 h-3.5 text-mc-text-secondary" />
            <span className="text-mc-text-secondary">No active session — dispatch the task to see live activity</span>
          </>
        )}
        {status === 'session_ended' && (
          <>
            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-amber-400">Session ended</span>
          </>
        )}
        {status === 'disconnected' && (
          <>
            <WifiOff className="w-3.5 h-3.5 text-red-400" />
            <span className="text-red-400">Disconnected — reconnecting...</span>
          </>
        )}
        {status === 'error' && (
          <>
            <AlertCircle className="w-3.5 h-3.5 text-red-400" />
            <span className="text-red-400">Error connecting to agent stream</span>
          </>
        )}
        {(messages.length > 0 || activeStreams.length > 0) && (
          <span className="ml-auto text-mc-text-secondary">{messages.length} messages</span>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && activeStreams.length === 0 && status !== 'no_session' && (
          <div className="text-center py-8 text-mc-text-secondary text-sm">
            Waiting for agent messages...
          </div>
        )}

        {status === 'no_session' && messages.length === 0 && (
          <div className="text-center py-12">
            <Radio className="w-8 h-8 text-mc-text-secondary mx-auto mb-3 opacity-50" />
            <p className="text-mc-text-secondary text-sm">No active agent session</p>
            <p className="text-mc-text-secondary/60 text-xs mt-1">Dispatch the task to start streaming agent activity</p>
          </div>
        )}

        {/* Completed messages */}
        {messages.map((msg) => {
          const style = roleStyles[msg.role] || roleStyles.system;
          return (
            <div key={msg.index} className={`${style.align}`}>
              <div className={`${style.bg} border rounded-lg px-3 py-2`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-mc-text-secondary">{style.label}</span>
                  {msg.timestamp && (
                    <span className="text-xs text-mc-text-secondary/50">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  )}
                </div>
                <div className="text-sm text-mc-text whitespace-pre-wrap break-words">
                  {msg.content}
                </div>
              </div>
            </div>
          );
        })}

        {/* Live streaming content */}
        {activeStreams.map(([streamType, content]) => {
          const style = streamTypeStyles[streamType] || streamTypeStyles.text;
          return (
            <div key={`stream-${streamType}`} className="mr-8">
              <div className={`${style.bg} border rounded-lg px-3 py-2`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-mc-text-secondary">{style.label}</span>
                  <span className="flex items-center gap-1 text-xs text-green-400">
                    <Radio className="w-3 h-3 animate-pulse" />
                    streaming
                  </span>
                </div>
                <div className="text-sm text-mc-text whitespace-pre-wrap break-words font-mono">
                  {content}
                </div>
              </div>
            </div>
          );
        })}

        {status === 'session_ended' && messages.length > 0 && (
          <div className="text-center py-3">
            <span className="text-xs bg-amber-500/20 text-amber-400 px-3 py-1 rounded-full">
              Session ended
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
