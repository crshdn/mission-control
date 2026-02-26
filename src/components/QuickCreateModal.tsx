'use client';

import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import { AGENT_ROLE_TEMPLATES } from '@/lib/agent-templates';
import { AgentModal } from './AgentModal';
import type { AgentRoleTemplate } from '@/lib/types';

interface QuickCreateModalProps {
  workspaceId: string;
  onClose: () => void;
}

export function QuickCreateModal({ workspaceId, onClose }: QuickCreateModalProps) {
  const { addAgent, addEvent } = useMissionControl();
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [showCustomModal, setShowCustomModal] = useState(false);

  const handleTemplateClick = async (template: AgentRoleTemplate) => {
    if (creatingId) return;
    setCreatingId(template.id);

    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: template.name,
          role: template.role,
          description: template.description,
          avatar_emoji: template.avatar_emoji,
          soul_md: template.soul_md,
          workspace_id: workspaceId,
        }),
      });

      if (res.ok) {
        const agent = await res.json();
        addAgent(agent);
        addEvent({
          id: crypto.randomUUID(),
          type: 'agent_joined',
          agent_id: agent.id,
          message: `${agent.avatar_emoji} ${agent.name} spawned`,
          created_at: new Date().toISOString(),
        });
        onClose();
      }
    } catch (error) {
      console.error('Failed to create agent:', error);
    } finally {
      setCreatingId(null);
    }
  };

  if (showCustomModal) {
    return <AgentModal workspaceId={workspaceId} onClose={onClose} />;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-mc-bg-secondary border border-mc-border rounded-lg w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-mc-border">
          <h2 className="text-lg font-semibold">Spawn Agent</h2>
          <button onClick={onClose} className="p-1 hover:bg-mc-bg-tertiary rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Template Grid */}
        <div className="p-4 grid grid-cols-2 gap-3">
          {AGENT_ROLE_TEMPLATES.map((template) => (
            <button
              key={template.id}
              onClick={() => handleTemplateClick(template)}
              disabled={creatingId !== null}
              className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                creatingId === template.id
                  ? 'border-mc-accent bg-mc-accent/10'
                  : 'border-mc-border hover:border-mc-accent/50 hover:bg-mc-bg-tertiary'
              } disabled:opacity-50`}
            >
              <span className="text-2xl flex-shrink-0">
                {creatingId === template.id ? (
                  <Loader2 className="w-6 h-6 animate-spin text-mc-accent" />
                ) : (
                  template.avatar_emoji
                )}
              </span>
              <div className="min-w-0">
                <div className="font-medium text-sm">{template.name}</div>
                <div className="text-xs text-mc-text-secondary truncate">{template.role}</div>
              </div>
            </button>
          ))}

          {/* Custom Agent button */}
          <button
            onClick={() => setShowCustomModal(true)}
            className="flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-mc-border hover:border-mc-accent/50 hover:bg-mc-bg-tertiary transition-all col-span-2"
          >
            <span className="text-mc-text-secondary text-sm">Custom Agent...</span>
          </button>
        </div>
      </div>
    </div>
  );
}
