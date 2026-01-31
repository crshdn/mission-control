'use client';

import { useState } from 'react';
import { Plus, ChevronRight } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import type { Agent, AgentStatus } from '@/lib/types';
import { AgentModal } from './AgentModal';

type FilterTab = 'all' | 'working' | 'standby';

export function AgentsSidebar() {
  const { agents, selectedAgent, setSelectedAgent } = useMissionControl();
  const [filter, setFilter] = useState<FilterTab>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  const filteredAgents = agents.filter((agent) => {
    if (filter === 'all') return true;
    return agent.status === filter;
  });

  const getStatusBadge = (status: AgentStatus) => {
    const styles = {
      standby: 'status-standby',
      working: 'status-working',
      offline: 'status-offline',
    };
    return styles[status] || styles.standby;
  };

  return (
    <aside className="w-64 bg-mc-bg-secondary border-r border-mc-border flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-mc-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ChevronRight className="w-4 h-4 text-mc-text-secondary" />
            <span className="text-sm font-medium uppercase tracking-wider">Agents</span>
            <span className="bg-mc-bg-tertiary text-mc-text-secondary text-xs px-2 py-0.5 rounded">
              {agents.length}
            </span>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1">
          {(['all', 'working', 'standby'] as FilterTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1 text-xs rounded uppercase ${
                filter === tab
                  ? 'bg-mc-accent text-mc-bg font-medium'
                  : 'text-mc-text-secondary hover:bg-mc-bg-tertiary'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Agent List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredAgents.map((agent) => (
          <button
            key={agent.id}
            onClick={() => {
              setSelectedAgent(agent);
              setEditingAgent(agent);
            }}
            className={`w-full flex items-center gap-3 p-2 rounded hover:bg-mc-bg-tertiary transition-colors text-left ${
              selectedAgent?.id === agent.id ? 'bg-mc-bg-tertiary' : ''
            }`}
          >
            {/* Avatar */}
            <div className="text-2xl">{agent.avatar_emoji}</div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate">{agent.name}</span>
                {agent.is_master && (
                  <span className="text-xs text-mc-accent-yellow">★</span>
                )}
              </div>
              <div className="text-xs text-mc-text-secondary truncate">
                {agent.role}
              </div>
            </div>

            {/* Status */}
            <span
              className={`text-xs px-2 py-0.5 rounded uppercase ${getStatusBadge(
                agent.status
              )}`}
            >
              {agent.status}
            </span>
          </button>
        ))}
      </div>

      {/* Add Agent Button */}
      <div className="p-3 border-t border-mc-border">
        <button
          onClick={() => setShowCreateModal(true)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-mc-bg-tertiary hover:bg-mc-border rounded text-sm text-mc-text-secondary hover:text-mc-text transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Agent
        </button>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <AgentModal onClose={() => setShowCreateModal(false)} />
      )}
      {editingAgent && (
        <AgentModal
          agent={editingAgent}
          onClose={() => setEditingAgent(null)}
        />
      )}
    </aside>
  );
}
