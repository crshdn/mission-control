'use client';

import { useState, useEffect } from 'react';
import { Network, RefreshCw, User, CheckCircle, XCircle, Cpu, Users } from 'lucide-react';

interface AgentInfo {
  id: string;
  name: string;
  role: string;
  description?: string;
  values?: string[];
  capabilities?: string[];
  restrictions?: string[];
  status: 'active' | 'inactive';
  specializations?: string[];
}

interface TeamScreenProps {
  workspaceId: string;
}

export function TeamScreen({ workspaceId }: TeamScreenProps) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    loadTeam();
  }, [workspaceId]);

  const loadTeam = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/team');
      if (response.ok) {
        const teamData = await response.json();
        setAgents(teamData.agents || teamData);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Failed to load team:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      'Builder': 'bg-blue-500/10 text-blue-400',
      'Researcher': 'bg-green-500/10 text-green-400',
      'Creative': 'bg-purple-500/10 text-purple-400',
      'Architect': 'bg-orange-500/10 text-orange-400',
      'CTO': 'bg-red-500/10 text-red-400',
      'Dispatcher': 'bg-yellow-500/10 text-yellow-400',
      'Marketing': 'bg-pink-500/10 text-pink-400',
      'Finance': 'bg-indigo-500/10 text-indigo-400'
    };
    return colors[role] || 'bg-mc-text-secondary/10 text-mc-text-secondary';
  };

  const getStatusIcon = (status: string) => {
    return status === 'active' 
      ? <CheckCircle className="w-4 h-4 text-mc-accent-green" />
      : <XCircle className="w-4 h-4 text-mc-text-secondary" />;
  };

  const groupAgentsByRole = () => {
    const groups: Record<string, AgentInfo[]> = {};
    agents.forEach(agent => {
      if (!groups[agent.role]) groups[agent.role] = [];
      groups[agent.role].push(agent);
    });
    return groups;
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Network className="w-6 h-6 text-mc-accent" />
          <h2 className="text-xl font-semibold text-mc-text">Team Overview</h2>
          <span className="text-sm text-mc-text-secondary">
            ({agents.length} agents)
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadTeam}
            disabled={loading}
            className="p-2 hover:bg-mc-bg-secondary rounded-lg transition-colors"
            title="Refresh team data"
          >
            <RefreshCw className={`w-4 h-4 text-mc-text-secondary ${loading ? 'animate-spin' : ''}`} />
          </button>
          <div className="text-sm text-mc-text-secondary">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-mc-bg-secondary rounded-lg p-8 text-center">
          <RefreshCw className="w-8 h-8 text-mc-accent animate-spin mx-auto mb-4" />
          <p className="text-mc-text-secondary">Loading team from SOUL.md files...</p>
        </div>
      ) : agents.length === 0 ? (
        <div className="bg-mc-bg-secondary rounded-lg p-8 text-center">
          <Users className="w-12 h-12 text-mc-text-secondary mx-auto mb-4" />
          <p className="text-mc-text-secondary">No agents found</p>
          <p className="text-sm text-mc-text-muted mt-2">Check /Users/lilly/clawd/agents/ directory</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Team Summary */}
          <div className="bg-mc-bg-secondary rounded-lg p-4">
            <h3 className="font-medium text-mc-text mb-3">Team Status</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-mc-accent-green">
                  {agents.filter(a => a.status === 'active').length}
                </div>
                <div className="text-sm text-mc-text-secondary">Active</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-mc-text-secondary">
                  {agents.filter(a => a.status === 'inactive').length}
                </div>
                <div className="text-sm text-mc-text-secondary">Inactive</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-mc-accent">
                  {Object.keys(groupAgentsByRole()).length}
                </div>
                <div className="text-sm text-mc-text-secondary">Roles</div>
              </div>
            </div>
          </div>

          {/* Agents by Role */}
          {Object.entries(groupAgentsByRole()).map(([role, roleAgents]) => (
            <div key={role} className="bg-mc-bg-secondary rounded-lg p-4">
              <div className="flex items-center gap-3 mb-4">
                <Cpu className="w-5 h-5 text-mc-accent" />
                <h3 className="font-medium text-mc-text">{role}</h3>
                <span className="text-sm text-mc-text-secondary">({roleAgents.length})</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {roleAgents.map((agent) => (
                  <div
                    key={agent.id}
                    className="bg-mc-bg border border-mc-border rounded-lg p-4 hover:border-mc-accent/50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <User className="w-5 h-5 text-mc-text-secondary" />
                        <div>
                          <h4 className="font-medium text-mc-text">{agent.name}</h4>
                          <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getRoleColor(agent.role)}`}>
                            {agent.role}
                          </span>
                        </div>
                      </div>
                      {getStatusIcon(agent.status)}
                    </div>

                    {agent.description && (
                      <p className="text-sm text-mc-text-secondary mb-3 line-clamp-2">
                        {agent.description}
                      </p>
                    )}

                    {agent.specializations && agent.specializations.length > 0 && (
                      <div className="mb-3">
                        <div className="text-xs font-medium text-mc-text-secondary mb-2">Specializations</div>
                        <div className="flex flex-wrap gap-1">
                          {agent.specializations.slice(0, 3).map((spec) => (
                            <span
                              key={spec}
                              className="px-2 py-1 bg-mc-accent/10 text-mc-accent text-xs rounded"
                            >
                              {spec}
                            </span>
                          ))}
                          {agent.specializations.length > 3 && (
                            <span className="px-2 py-1 bg-mc-text-secondary/10 text-mc-text-secondary text-xs rounded">
                              +{agent.specializations.length - 3}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {agent.values && agent.values.length > 0 && (
                      <div className="mb-3">
                        <div className="text-xs font-medium text-mc-text-secondary mb-2">Core Values</div>
                        <div className="text-xs text-mc-text-secondary">
                          {agent.values.slice(0, 2).join(', ')}
                          {agent.values.length > 2 && ` (+${agent.values.length - 2} more)`}
                        </div>
                      </div>
                    )}

                    {agent.restrictions && agent.restrictions.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-mc-text-secondary mb-2">Restrictions</div>
                        <div className="text-xs text-mc-text-secondary">
                          {agent.restrictions.slice(0, 2).join(', ')}
                          {agent.restrictions.length > 2 && ` (+${agent.restrictions.length - 2} more)`}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Org Chart Visualization */}
          <div className="bg-mc-bg-secondary rounded-lg p-4">
            <h3 className="font-medium text-mc-text mb-4">Organization Structure</h3>
            <div className="space-y-4">
              {/* Leadership */}
              <div className="text-center">
                <div className="inline-block bg-mc-bg border border-mc-border rounded-lg p-3">
                  <div className="font-medium text-mc-text">Leadership</div>
                  <div className="text-sm text-mc-text-secondary mt-1">
                    {agents.filter(a => a.role === 'CTO' || a.role === 'Dispatcher').map(a => a.name).join(', ') || 'None'}
                  </div>
                </div>
              </div>

              {/* Engineering */}
              <div className="flex justify-center gap-8 flex-wrap">
                {['Builder', 'Architect', 'Researcher'].map(role => {
                  const roleAgents = agents.filter(a => a.role === role);
                  if (roleAgents.length === 0) return null;
                  
                  return (
                    <div key={role} className="text-center">
                      <div className="bg-mc-bg border border-mc-border rounded-lg p-3">
                        <div className="font-medium text-mc-text">{role}</div>
                        <div className="text-sm text-mc-text-secondary mt-1">
                          {roleAgents.map(a => a.name).join(', ')}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Support */}
              <div className="flex justify-center gap-8 flex-wrap">
                {['Creative', 'Marketing', 'Finance'].map(role => {
                  const roleAgents = agents.filter(a => a.role === role);
                  if (roleAgents.length === 0) return null;
                  
                  return (
                    <div key={role} className="text-center">
                      <div className="bg-mc-bg border border-mc-border rounded-lg p-3">
                        <div className="font-medium text-mc-text">{role}</div>
                        <div className="text-sm text-mc-text-secondary mt-1">
                          {roleAgents.map(a => a.name).join(', ')}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
