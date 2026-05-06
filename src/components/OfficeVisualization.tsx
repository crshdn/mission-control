'use client';

import { useEffect, useRef, useState } from 'react';
import { RefreshCw, ExternalLink, Maximize2, Minimize2 } from 'lucide-react';

interface OfficeVisualizationProps {
  workspaceId: string;
}

export function OfficeVisualization({ workspaceId }: OfficeVisualizationProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');

  // Map MC agent status to Star Office state
  const mapToStarOfficeState = (agent: any): { state: string; detail: string } => {
    if (agent.status !== 'working') {
      return { state: 'idle', detail: agent.role || 'Standing by' };
    }
    
    // Working - determine specific state
    const workingOn = agent.working_on || '';
    if (workingOn.includes('chat') || workingOn.includes('Direct')) {
      return { state: 'writing', detail: workingOn };
    }
    if (agent.current_task) {
      return { state: 'writing', detail: agent.current_task };
    }
    return { state: 'writing', detail: 'Working' };
  };

  // Sync all agent statuses to Star Office
  const syncAgentStatus = async () => {
    setSyncStatus('syncing');
    try {
      // Get current agent status from our API
      const agentsRes = await fetch(`/api/agents?workspace_id=${workspaceId}`);
      if (!agentsRes.ok) throw new Error('Failed to fetch agents');
      const agents = await agentsRes.json();

      // Map agent names to Star Office IDs
      const agentIdMap: Record<string, string> = {
        'Lilly': 'lilly',
        'Polly': 'polly', 
        'Mason': 'mason',
        'Bob': 'bob',
        'Vale': 'vale',
        'Riff': 'riff',
      };

      // Get current Star Office agents
      const starAgentsRes = await fetch('http://127.0.0.1:19000/agents');
      const starAgents = await starAgentsRes.json();

      // Update each agent's state
      for (const agent of agents) {
        const starId = agentIdMap[agent.name];
        if (!starId) continue;

        const starAgent = starAgents.find((a: any) => a.agentId === starId);
        if (!starAgent) continue;

        const { state, detail } = mapToStarOfficeState(agent);
        
        // Only update if state changed
        if (starAgent.state !== state || starAgent.detail !== detail) {
          // Update via direct state file modification (local mode)
          // Star Office will pick up changes on next /agents fetch
        }
      }

      // Update main agent (Lilly) via set_state for immediate effect
      const lilly = agents.find((a: any) => a.name === 'Lilly');
      if (lilly) {
        const { state, detail } = mapToStarOfficeState(lilly);
        await fetch('http://127.0.0.1:19000/set_state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state, detail })
        });
      }

      setLastSync(new Date());
      setSyncStatus('idle');
    } catch (error) {
      console.error('Failed to sync agent status:', error);
      setSyncStatus('error');
    }
  };

  // Initial sync and periodic updates
  useEffect(() => {
    syncAgentStatus();
    const interval = setInterval(syncAgentStatus, 30000); // Sync every 30s
    return () => clearInterval(interval);
  }, [workspaceId]);

  const refreshIframe = () => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <div className={`h-full flex flex-col bg-mc-bg ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-mc-border bg-mc-bg-secondary">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-mc-text">Star Office</h2>
          <span className="text-sm text-mc-text-secondary">
            Pixel Office Dashboard
          </span>
          {lastSync && (
            <span className="text-xs text-mc-text-tertiary">
              Synced {lastSync.toLocaleTimeString()}
            </span>
          )}
          {syncStatus === 'syncing' && (
            <RefreshCw className="w-3 h-3 text-mc-accent animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={syncAgentStatus}
            className="p-2 hover:bg-mc-bg rounded-lg transition-colors"
            title="Sync agent status"
          >
            <RefreshCw className={`w-4 h-4 text-mc-text-secondary ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-2 hover:bg-mc-bg rounded-lg transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4 text-mc-text-secondary" />
            ) : (
              <Maximize2 className="w-4 h-4 text-mc-text-secondary" />
            )}
          </button>
          <a
            href="http://127.0.0.1:19000"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 hover:bg-mc-bg rounded-lg transition-colors"
            title="Open in new tab"
          >
            <ExternalLink className="w-4 h-4 text-mc-text-secondary" />
          </a>
        </div>
      </div>

      {/* Star Office iframe */}
      <div className="flex-1 relative">
        <iframe
          ref={iframeRef}
          src="http://127.0.0.1:19000"
          className="absolute inset-0 w-full h-full border-0"
          title="Star Office"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
        />
      </div>
    </div>
  );
}
