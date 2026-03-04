'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Coffee,
  Monitor,
  RefreshCw,
  Calendar,
  User,
  MessageSquare,
  Laptop
} from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  emoji: string;
  status: 'working' | 'idle' | 'offline' | 'break';
  currentTask?: string;
  position: { x: number; y: number };
  lastActivity?: string;
}

interface OfficeData {
  agents: Agent[];
  lastUpdated: string;
}

interface OfficeVisualizationProps {
  workspaceId: string;
}

export function OfficeVisualization({ workspaceId }: OfficeVisualizationProps) {
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  const { data: officeData, refetch, isLoading } = useQuery({
    queryKey: ['office-data', workspaceId],
    queryFn: async (): Promise<OfficeData> => {
      const response = await fetch('/api/office');
      if (!response.ok) throw new Error('Failed to fetch office data');
      return response.json();
    },
    refetchInterval: 10000 // 10s polling for more responsive office
  });

  useEffect(() => {
    if (officeData) {
      setLastUpdated(new Date());
    }
  }, [officeData]);

  const getAgentStatusColor = (status: Agent['status']) => {
    switch (status) {
      case 'working':
        return 'bg-green-500 animate-pulse';
      case 'idle':
        return 'bg-yellow-500';
      case 'offline':
        return 'bg-gray-500';
      case 'break':
        return 'bg-blue-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getAgentStatusText = (status: Agent['status']) => {
    switch (status) {
      case 'working':
        return 'Working';
      case 'idle':
        return 'Available';
      case 'offline':
        return 'Offline';
      case 'break':
        return 'Break';
      default:
        return 'Unknown';
    }
  };

  // Office layout positions for agents
  const deskPositions = [
    { id: 'ged', x: 20, y: 20, label: 'CEO Desk' },
    { id: 'lilly', x: 120, y: 20, label: 'CTO Desk' },
    { id: 'polly', x: 220, y: 20, label: 'Dispatch Desk' },
    { id: 'mason', x: 20, y: 120, label: 'Builder Desk' },
    { id: 'vale', x: 120, y: 120, label: 'Research Desk' },
    { id: 'archie', x: 220, y: 120, label: 'Systems Desk' },
    { id: 'riff', x: 320, y: 120, label: 'Content Desk' },
    { id: 'max', x: 320, y: 20, label: 'Creative Desk' }
  ];

  const waterCoolerPosition = { x: 170, y: 200 };

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center">
            <Monitor className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-mc-text">Office View</h1>
            <p className="text-mc-text-secondary">Live agent activity in the virtual office</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-mc-text-secondary">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Last updated: {lastUpdated.toLocaleTimeString()}
          </div>
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 bg-mc-bg-secondary hover:bg-mc-bg-tertiary rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Office Floor Plan */}
      <div className="bg-mc-bg-secondary rounded-xl p-6 border border-mc-border">
        <div 
          className="relative bg-mc-bg-tertiary rounded-lg overflow-hidden"
          style={{ width: '400px', height: '280px', margin: '0 auto' }}
        >
          {/* Office Background Grid */}
          <div 
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: 'repeating-linear-gradient(90deg, #374151 0px, #374151 1px, transparent 1px, transparent 20px), repeating-linear-gradient(0deg, #374151 0px, #374151 1px, transparent 1px, transparent 20px)',
            }}
          />

          {/* Desks */}
          {deskPositions.map((desk) => {
            const agent = officeData?.agents.find(a => a.id === desk.id);
            return (
              <div key={desk.id} className="absolute group">
                {/* Desk */}
                <div
                  className="w-16 h-12 bg-amber-800 rounded-sm border border-amber-700 flex items-center justify-center cursor-pointer hover:bg-amber-700 transition-colors"
                  style={{ left: `${desk.x}px`, top: `${desk.y}px` }}
                  onClick={() => setSelectedAgent(agent || null)}
                  title={desk.label}
                >
                  <Laptop className="w-4 h-4 text-amber-200" />
                </div>

                {/* Agent Avatar */}
                {agent && (
                  <div
                    className="absolute -top-2 -left-2 w-8 h-8 rounded-full border-2 border-mc-border flex items-center justify-center text-xs font-bold cursor-pointer hover:scale-110 transition-transform"
                    style={{ left: `${desk.x + 8}px`, top: `${desk.y - 8}px` }}
                    onClick={() => setSelectedAgent(agent)}
                  >
                    <div className={`absolute inset-0 rounded-full ${getAgentStatusColor(agent.status)}`} />
                    <span className="relative z-10 text-white">
                      {agent.emoji}
                    </span>
                  </div>
                )}

                {/* Status Indicator */}
                {agent && (
                  <div
                    className="absolute -bottom-4 left-0 text-xs px-2 py-0.5 rounded bg-mc-bg-tertiary text-mc-text-secondary opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
                    style={{ left: `${desk.x}px`, top: `${desk.y + 50}px` }}
                  >
                    {agent.name}: {getAgentStatusText(agent.status)}
                  </div>
                )}

                {/* Current Task Bubble */}
                {agent && agent.status === 'working' && agent.currentTask && (
                  <div
                    className="absolute bg-white text-gray-900 text-xs px-2 py-1 rounded-lg border border-gray-300 max-w-32 truncate opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ 
                      left: `${desk.x + 70}px`, 
                      top: `${desk.y - 10}px`,
                      fontSize: '10px'
                    }}
                  >
                    {agent.currentTask}
                  </div>
                )}
              </div>
            );
          })}

          {/* Water Cooler */}
          <div
            className="absolute w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-blue-500 transition-colors group"
            style={{ left: `${waterCoolerPosition.x}px`, top: `${waterCoolerPosition.y}px` }}
            title="Water Cooler - Agent Communications"
          >
            <Coffee className="w-4 h-4 text-white" />
            <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-mc-bg-tertiary text-mc-text text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
              Water Cooler Chat
            </div>
          </div>

          {/* Office Walls */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-mc-border" />
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-mc-border" />
          <div className="absolute top-0 bottom-0 left-0 w-1 bg-mc-border" />
          <div className="absolute top-0 bottom-0 right-0 w-1 bg-mc-border" />
        </div>

        {/* Office Stats */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-mc-bg-tertiary rounded-lg p-3">
            <div className="text-sm text-mc-text-secondary mb-1">Online</div>
            <div className="text-xl font-bold text-green-400">
              {officeData?.agents.filter(a => a.status !== 'offline').length || 0}
            </div>
          </div>
          <div className="bg-mc-bg-tertiary rounded-lg p-3">
            <div className="text-sm text-mc-text-secondary mb-1">Working</div>
            <div className="text-xl font-bold text-blue-400">
              {officeData?.agents.filter(a => a.status === 'working').length || 0}
            </div>
          </div>
          <div className="bg-mc-bg-tertiary rounded-lg p-3">
            <div className="text-sm text-mc-text-secondary mb-1">Available</div>
            <div className="text-xl font-bold text-yellow-400">
              {officeData?.agents.filter(a => a.status === 'idle').length || 0}
            </div>
          </div>
          <div className="bg-mc-bg-tertiary rounded-lg p-3">
            <div className="text-sm text-mc-text-secondary mb-1">Total Agents</div>
            <div className="text-xl font-bold text-mc-text">
              {officeData?.agents.length || 0}
            </div>
          </div>
        </div>
      </div>

      {/* Agent Detail Panel */}
      {selectedAgent && (
        <div className="bg-mc-bg-secondary rounded-xl p-6 border border-mc-border">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-12 h-12 rounded-full ${getAgentStatusColor(selectedAgent.status)} flex items-center justify-center text-xl`}>
              {selectedAgent.emoji}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-mc-text">{selectedAgent.name}</h3>
              <p className="text-sm text-mc-text-secondary">{getAgentStatusText(selectedAgent.status)}</p>
            </div>
            <button
              onClick={() => setSelectedAgent(null)}
              className="ml-auto text-mc-text-secondary hover:text-mc-text"
            >
              ✕
            </button>
          </div>

          {selectedAgent.currentTask && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-mc-text mb-2">Current Task</h4>
              <p className="text-sm text-mc-text bg-mc-bg-tertiary rounded-lg p-3">
                {selectedAgent.currentTask}
              </p>
            </div>
          )}

          {selectedAgent.lastActivity && (
            <div className="text-xs text-mc-text-secondary">
              Last activity: {new Date(selectedAgent.lastActivity).toLocaleString()}
            </div>
          )}
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-12 text-mc-text-secondary">
          <RefreshCw className="w-8 h-8 mx-auto mb-4 animate-spin" />
          <p>Loading office data...</p>
        </div>
      )}

      {/* No Data State */}
      {!officeData?.agents.length && !isLoading && (
        <div className="text-center py-12 text-mc-text-secondary">
          <Monitor className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Office is empty</p>
          <p className="text-sm">Agent data will appear here once available</p>
        </div>
      )}
    </div>
  );
}