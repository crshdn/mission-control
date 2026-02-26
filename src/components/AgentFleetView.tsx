'use client';

import { useState, useCallback } from 'react';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import { Plus, MoreVertical, Play, Pause, WifiOff } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import { TaskModal } from './TaskModal';
import { AgentModal } from './AgentModal';
import { QuickCreateModal } from './QuickCreateModal';
import type { Agent, Task, AgentStatus } from '@/lib/types';

interface AgentFleetViewProps {
  workspaceId: string;
}

// Status visuals
const STATUS_CONFIG: Record<AgentStatus, { dot: string; glow: string; label: string }> = {
  working: {
    dot: 'bg-mc-accent-green',
    glow: 'ring-1 ring-mc-accent-green/30 shadow-[0_0_12px_rgba(34,197,94,0.15)]',
    label: 'Working',
  },
  standby: {
    dot: 'bg-mc-accent-yellow',
    glow: '',
    label: 'Standby',
  },
  offline: {
    dot: 'bg-mc-text-secondary',
    glow: '',
    label: 'Offline',
  },
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-mc-accent-red/20 text-mc-accent-red',
  high: 'bg-orange-500/20 text-orange-400',
  normal: 'bg-mc-accent-cyan/20 text-mc-accent-cyan',
  low: 'bg-mc-text-secondary/20 text-mc-text-secondary',
};

export function AgentFleetView({ workspaceId }: AgentFleetViewProps) {
  const { agents, tasks, updateTask } = useMissionControl();

  // Modal states
  const [showSpawnModal, setShowSpawnModal] = useState(false);
  const [taskModalAgent, setTaskModalAgent] = useState<string | undefined>(undefined);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Get tasks for a specific agent
  const getAgentTasks = useCallback(
    (agentId: string) =>
      tasks.filter(
        (t) => t.assigned_agent_id === agentId && t.status !== 'done'
      ),
    [tasks]
  );

  // Unassigned tasks (not done, no agent)
  const unassignedTasks = tasks.filter(
    (t) => !t.assigned_agent_id && t.status !== 'done'
  );

  // DnD handler
  const handleDragEnd = async (result: DropResult) => {
    const { draggableId, destination } = result;
    if (!destination) return;

    const taskId = draggableId;
    const destId = destination.droppableId;

    const isUnassign = destId === 'unassigned';
    const newAgentId = isUnassign ? null : destId;
    const newStatus = isUnassign ? 'inbox' : 'assigned';

    // Find original task for rollback
    const original = tasks.find((t) => t.id === taskId);
    if (!original) return;

    // Skip if same destination
    if (
      (isUnassign && !original.assigned_agent_id) ||
      (!isUnassign && original.assigned_agent_id === newAgentId)
    ) {
      return;
    }

    // Optimistic update
    const optimistic: Task = {
      ...original,
      assigned_agent_id: newAgentId ?? null,
      status: newStatus as Task['status'],
    };
    updateTask(optimistic);

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assigned_agent_id: newAgentId,
          status: newStatus,
        }),
      });

      if (!res.ok) throw new Error('API error');
      const saved = await res.json();
      updateTask(saved);
    } catch {
      // Revert on failure
      updateTask(original);
    }
  };

  const toggleAgentStatus = async (agent: Agent) => {
    const next: AgentStatus =
      agent.status === 'working'
        ? 'standby'
        : agent.status === 'standby'
          ? 'offline'
          : 'working';

    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) {
        const updated = await res.json();
        useMissionControl.getState().updateAgent(updated);
      }
    } catch (error) {
      console.error('Failed to toggle agent status:', error);
    }
    setOpenMenuId(null);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-mc-border bg-mc-bg-secondary/50">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-sm uppercase tracking-wider text-mc-text-secondary">
              Agent Fleet
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-mc-accent/10 text-mc-accent text-xs font-medium">
              {agents.length}
            </span>
          </div>
          <button
            onClick={() => setShowSpawnModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-mc-accent text-mc-bg rounded text-sm font-medium hover:bg-mc-accent/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Spawn Agent
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Agent Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {agents.map((agent) => {
              const agentTasks = getAgentTasks(agent.id);
              const config = STATUS_CONFIG[agent.status];

              return (
                <Droppable key={agent.id} droppableId={agent.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`relative rounded-lg border bg-mc-bg-secondary p-4 transition-all ${
                        config.glow
                      } ${
                        snapshot.isDraggingOver
                          ? 'border-mc-accent bg-mc-accent/5 scale-[1.02]'
                          : 'border-mc-border'
                      }`}
                    >
                      {/* Agent Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <span className="text-2xl">{agent.avatar_emoji}</span>
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-mc-bg-secondary ${config.dot}`}
                            />
                          </div>
                          <div>
                            <div className="font-medium text-sm">{agent.name}</div>
                            <div className="text-xs text-mc-text-secondary">{agent.role}</div>
                          </div>
                        </div>

                        {/* Three-dot menu */}
                        <div className="relative">
                          <button
                            onClick={() =>
                              setOpenMenuId(openMenuId === agent.id ? null : agent.id)
                            }
                            className="p-1 hover:bg-mc-bg-tertiary rounded"
                          >
                            <MoreVertical className="w-4 h-4 text-mc-text-secondary" />
                          </button>

                          {openMenuId === agent.id && (
                            <div className="absolute right-0 top-8 w-40 bg-mc-bg-secondary border border-mc-border rounded-lg shadow-lg z-20">
                              <button
                                onClick={() => toggleAgentStatus(agent)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-mc-bg-tertiary text-left"
                              >
                                {agent.status === 'working' ? (
                                  <Pause className="w-3.5 h-3.5" />
                                ) : agent.status === 'standby' ? (
                                  <WifiOff className="w-3.5 h-3.5" />
                                ) : (
                                  <Play className="w-3.5 h-3.5" />
                                )}
                                {agent.status === 'working'
                                  ? 'Set Standby'
                                  : agent.status === 'standby'
                                    ? 'Set Offline'
                                    : 'Set Working'}
                              </button>
                              <button
                                onClick={() => {
                                  setTaskModalAgent(agent.id);
                                  setOpenMenuId(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-mc-bg-tertiary text-left"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                Create Task
                              </button>
                              <button
                                onClick={() => {
                                  setEditingAgent(agent);
                                  setOpenMenuId(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-mc-bg-tertiary text-left"
                              >
                                Edit Agent
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Status badge */}
                      <div className="mb-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                            agent.status === 'working'
                              ? 'bg-mc-accent-green/20 text-mc-accent-green'
                              : agent.status === 'standby'
                                ? 'bg-mc-accent-yellow/20 text-mc-accent-yellow'
                                : 'bg-mc-text-secondary/20 text-mc-text-secondary'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                          {config.label}
                        </span>
                        <span className="ml-2 text-xs text-mc-text-secondary">
                          {agentTasks.length} task{agentTasks.length !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {/* Task mini-cards */}
                      <div className="space-y-1.5 min-h-[32px]">
                        {agentTasks.slice(0, 3).map((task, index) => (
                          <Draggable
                            key={task.id}
                            draggableId={task.id}
                            index={index}
                          >
                            {(dragProvided, dragSnapshot) => (
                              <div
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                                className={`flex items-center gap-2 px-2 py-1.5 rounded border text-xs transition-colors ${
                                  dragSnapshot.isDragging
                                    ? 'border-mc-accent bg-mc-accent/10 shadow-lg'
                                    : 'border-mc-border/50 bg-mc-bg hover:bg-mc-bg-tertiary'
                                }`}
                              >
                                <span
                                  className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                    PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.normal
                                  }`}
                                >
                                  {task.priority[0].toUpperCase()}
                                </span>
                                <span className="truncate">{task.title}</span>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {agentTasks.length > 3 && (
                          <div className="text-xs text-mc-text-secondary pl-2">
                            +{agentTasks.length - 3} more
                          </div>
                        )}
                        {agentTasks.length === 0 && !snapshot.isDraggingOver && (
                          <div className="text-xs text-mc-text-secondary/50 text-center py-2">
                            No active tasks
                          </div>
                        )}
                        {snapshot.isDraggingOver && (
                          <div className="border border-dashed border-mc-accent/40 rounded py-2 text-center text-xs text-mc-accent/60">
                            Drop to assign
                          </div>
                        )}
                      </div>
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              );
            })}

            {/* Placeholder card */}
            <button
              onClick={() => setShowSpawnModal(true)}
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-mc-border/50 p-4 min-h-[180px] hover:border-mc-accent/40 hover:bg-mc-bg-secondary/50 transition-all"
            >
              <Plus className="w-6 h-6 text-mc-text-secondary" />
              <span className="text-sm text-mc-text-secondary">Spawn Agent</span>
            </button>
          </div>

          {/* Unassigned Task Pool */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-mc-text-secondary mb-3">
              Unassigned Tasks
              <span className="ml-2 px-1.5 py-0.5 rounded-full bg-mc-accent-purple/10 text-mc-accent-purple text-xs">
                {unassignedTasks.length}
              </span>
            </h3>

            <Droppable droppableId="unassigned" direction="horizontal">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`flex gap-2 overflow-x-auto pb-2 min-h-[48px] rounded-lg border p-2 transition-colors ${
                    snapshot.isDraggingOver
                      ? 'border-mc-accent-purple bg-mc-accent-purple/5'
                      : 'border-mc-border/50 bg-mc-bg-secondary/30'
                  }`}
                >
                  {unassignedTasks.length === 0 && !snapshot.isDraggingOver && (
                    <div className="flex-1 flex items-center justify-center text-xs text-mc-text-secondary/50">
                      Drag tasks here to unassign
                    </div>
                  )}
                  {unassignedTasks.map((task, index) => (
                    <Draggable key={task.id} draggableId={task.id} index={index}>
                      {(dragProvided, dragSnapshot) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          {...dragProvided.dragHandleProps}
                          className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded border text-xs transition-colors ${
                            dragSnapshot.isDragging
                              ? 'border-mc-accent bg-mc-accent/10 shadow-lg'
                              : 'border-mc-border/50 bg-mc-bg hover:bg-mc-bg-tertiary'
                          }`}
                        >
                          <span
                            className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.normal
                            }`}
                          >
                            {task.priority[0].toUpperCase()}
                          </span>
                          <span className="truncate max-w-[150px]">{task.title}</span>
                          <span className="text-[10px] text-mc-text-secondary uppercase">
                            {task.status.replace('_', ' ')}
                          </span>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showSpawnModal && (
        <QuickCreateModal
          workspaceId={workspaceId}
          onClose={() => setShowSpawnModal(false)}
        />
      )}

      {taskModalAgent !== undefined && (
        <TaskModal
          workspaceId={workspaceId}
          initialAgentId={taskModalAgent}
          onClose={() => setTaskModalAgent(undefined)}
        />
      )}

      {editingAgent && (
        <AgentModal
          agent={editingAgent}
          workspaceId={workspaceId}
          onClose={() => setEditingAgent(null)}
        />
      )}
    </DragDropContext>
  );
}
