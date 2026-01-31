'use client';

import { create } from 'zustand';
import type { Agent, Task, Conversation, Message, Event, TaskStatus } from './types';

interface MissionControlState {
  // Data
  agents: Agent[];
  tasks: Task[];
  conversations: Conversation[];
  events: Event[];
  currentConversation: Conversation | null;
  messages: Message[];

  // UI State
  selectedAgent: Agent | null;
  selectedTask: Task | null;
  isOnline: boolean;
  isLoading: boolean;
  selectedBusiness: string;

  // Actions
  setAgents: (agents: Agent[]) => void;
  setTasks: (tasks: Task[]) => void;
  setConversations: (conversations: Conversation[]) => void;
  setEvents: (events: Event[]) => void;
  addEvent: (event: Event) => void;
  setCurrentConversation: (conversation: Conversation | null) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  setSelectedAgent: (agent: Agent | null) => void;
  setSelectedTask: (task: Task | null) => void;
  setIsOnline: (online: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setSelectedBusiness: (business: string) => void;

  // Task mutations
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  updateTask: (task: Task) => void;
  addTask: (task: Task) => void;

  // Agent mutations
  updateAgent: (agent: Agent) => void;
  addAgent: (agent: Agent) => void;
}

export const useMissionControl = create<MissionControlState>((set) => ({
  // Initial state
  agents: [],
  tasks: [],
  conversations: [],
  events: [],
  currentConversation: null,
  messages: [],
  selectedAgent: null,
  selectedTask: null,
  isOnline: false,
  isLoading: true,
  selectedBusiness: 'all',

  // Setters
  setAgents: (agents) => set({ agents }),
  setTasks: (tasks) => set({ tasks }),
  setConversations: (conversations) => set({ conversations }),
  setEvents: (events) => set({ events }),
  addEvent: (event) =>
    set((state) => ({ events: [event, ...state.events].slice(0, 100) })),
  setCurrentConversation: (conversation) => set({ currentConversation: conversation }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  setSelectedAgent: (agent) => set({ selectedAgent: agent }),
  setSelectedTask: (task) => set({ selectedTask: task }),
  setIsOnline: (online) => set({ isOnline: online }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setSelectedBusiness: (business) => set({ selectedBusiness: business }),

  // Task mutations
  updateTaskStatus: (taskId, status) =>
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === taskId ? { ...task, status } : task
      ),
    })),
  updateTask: (updatedTask) =>
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === updatedTask.id ? updatedTask : task
      ),
    })),
  addTask: (task) => set((state) => ({ tasks: [task, ...state.tasks] })),

  // Agent mutations
  updateAgent: (updatedAgent) =>
    set((state) => ({
      agents: state.agents.map((agent) =>
        agent.id === updatedAgent.id ? updatedAgent : agent
      ),
    })),
  addAgent: (agent) => set((state) => ({ agents: [...state.agents, agent] })),
}));
