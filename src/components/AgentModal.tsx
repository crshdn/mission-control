'use client';

import { useState, useEffect } from 'react';
import { X, Save, Trash2, FileText, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useMissionControl } from '@/lib/store';
import type { Agent, AgentStatus } from '@/lib/types';

interface AgentModalProps {
  agent?: Agent;
  onClose: () => void;
  workspaceId?: string;
  onAgentCreated?: (agentId: string) => void;
}

interface WorkspaceFile {
  content: string | null;
  filename: string;
  agentName: string;
  error?: string;
  loading?: boolean;
}

const EMOJI_OPTIONS = ['🤖', '🦞', '💻', '🔍', '✍️', '🎨', '📊', '🧠', '⚡', '🚀', '🎯', '🔧'];

export function AgentModal({ agent, onClose, workspaceId, onAgentCreated }: AgentModalProps) {
  const { addAgent, updateAgent, agents } = useMissionControl();
  const [activeTab, setActiveTab] = useState<'info' | 'soul' | 'user' | 'agents'>('info');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [defaultModel, setDefaultModel] = useState<string>('');
  const [modelsLoading, setModelsLoading] = useState(true);

  // Workspace files state
  const [workspaceFiles, setWorkspaceFiles] = useState<{
    'SOUL.md': WorkspaceFile;
    'USER.md': WorkspaceFile;
    'AGENTS.md': WorkspaceFile;
  }>({
    'SOUL.md': { content: null, filename: 'SOUL.md', agentName: '', loading: true },
    'USER.md': { content: null, filename: 'USER.md', agentName: '', loading: true },
    'AGENTS.md': { content: null, filename: 'AGENTS.md', agentName: '', loading: true },
  });

  // Form state (only for editable fields in Info tab)
  const [form, setForm] = useState({
    name: agent?.name || '',
    role: agent?.role || '',
    description: agent?.description || '',
    avatar_emoji: agent?.avatar_emoji || '🤖',
    status: agent?.status || 'standby' as AgentStatus,
    is_master: agent?.is_master || false,
    model: agent?.model || '',
  });

  // Load workspace files when agent is available
  useEffect(() => {
    if (!agent) return;

    const loadWorkspaceFile = async (filename: 'SOUL.md' | 'USER.md' | 'AGENTS.md') => {
      setWorkspaceFiles(prev => ({
        ...prev,
        [filename]: { ...prev[filename], loading: true }
      }));

      try {
        const res = await fetch(`/api/agents/${agent.id}/workspace-file/${filename}`);
        const data = await res.json();
        
        setWorkspaceFiles(prev => ({
          ...prev,
          [filename]: {
            content: data.content,
            filename: data.filename,
            agentName: data.agentName,
            error: res.ok ? undefined : data.error,
            loading: false
          }
        }));
      } catch (error) {
        console.error(`Failed to load ${filename}:`, error);
        setWorkspaceFiles(prev => ({
          ...prev,
          [filename]: {
            ...prev[filename],
            error: 'Failed to load file',
            loading: false
          }
        }));
      }
    };

    // Load all workspace files
    loadWorkspaceFile('SOUL.md');
    loadWorkspaceFile('USER.md');
    loadWorkspaceFile('AGENTS.md');
  }, [agent]);

  // Load available models from OpenClaw config
  useEffect(() => {
    const loadModels = async () => {
      try {
        const res = await fetch('/api/openclaw/models');
        if (res.ok) {
          const data = await res.json();
          setAvailableModels(data.availableModels || []);
          setDefaultModel(data.defaultModel || '');
          // If agent has no model set, use default
          if (!agent?.model && data.defaultModel) {
            setForm(prev => ({ ...prev, model: data.defaultModel }));
          }
        }
      } catch (error) {
        console.error('Failed to load models:', error);
      } finally {
        setModelsLoading(false);
      }
    };
    loadModels();
  }, [agent]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const url = agent ? `/api/agents/${agent.id}` : '/api/agents';
      const method = agent ? 'PATCH' : 'POST';

      // Only submit form fields, not markdown content (now read-only)
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          workspace_id: workspaceId || agent?.workspace_id || 'default',
        }),
      });

      if (res.ok) {
        const savedAgent = await res.json();
        if (agent) {
          updateAgent(savedAgent);
        } else {
          addAgent(savedAgent);
          // Notify parent if callback provided (e.g., for inline agent creation)
          if (onAgentCreated) {
            onAgentCreated(savedAgent.id);
          }
        }
        onClose();
      }
    } catch (error) {
      console.error('Failed to save agent:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!agent || !confirm(`Delete ${agent.name}?`)) return;

    try {
      const res = await fetch(`/api/agents/${agent.id}`, { method: 'DELETE' });
      if (res.ok) {
        // Remove from store
        useMissionControl.setState((state) => ({
          agents: state.agents.filter((a) => a.id !== agent.id),
          selectedAgent: state.selectedAgent?.id === agent.id ? null : state.selectedAgent,
        }));
        onClose();
      }
    } catch (error) {
      console.error('Failed to delete agent:', error);
    }
  };

  const handleRefreshFile = (filename: 'SOUL.md' | 'USER.md' | 'AGENTS.md') => {
    if (!agent) return;

    setWorkspaceFiles(prev => ({
      ...prev,
      [filename]: { ...prev[filename], loading: true, error: undefined }
    }));

    fetch(`/api/agents/${agent.id}/workspace-file/${filename}`)
      .then(res => res.json())
      .then(data => {
        setWorkspaceFiles(prev => ({
          ...prev,
          [filename]: {
            content: data.content,
            filename: data.filename,
            agentName: data.agentName,
            error: data.error,
            loading: false
          }
        }));
      })
      .catch(error => {
        console.error(`Failed to refresh ${filename}:`, error);
        setWorkspaceFiles(prev => ({
          ...prev,
          [filename]: {
            ...prev[filename],
            error: 'Failed to load file',
            loading: false
          }
        }));
      });
  };

  const tabs = [
    { id: 'info', label: 'Info' },
    { id: 'soul', label: 'SOUL.md' },
    { id: 'user', label: 'USER.md' },
    { id: 'agents', label: 'AGENTS.md' },
  ] as const;

  const renderMarkdownTab = (filename: 'SOUL.md' | 'USER.md' | 'AGENTS.md') => {
    const file = workspaceFiles[filename];

    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium">
              {filename} {agent && `(${agent.name.toLowerCase()})`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleRefreshFile(filename)}
            disabled={file.loading}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${file.loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {file.loading ? (
            <div className="flex items-center justify-center h-32 text-gray-500">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Loading {filename}...
              </div>
            </div>
          ) : file.error || !file.content ? (
            <div className="flex items-center justify-center h-32 text-gray-500">
              <div className="text-center">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  {file.error || `${filename} not found`}
                </p>
                <p className="text-xs mt-1 opacity-75">
                  Expected: /Users/lilly/clawd/agents/{agent?.name.toLowerCase()}/{filename}
                </p>
              </div>
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{file.content}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold">
            {agent ? `${agent.name} Profile` : 'Create New Agent'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 bg-white dark:bg-gray-900">
          {activeTab === 'info' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Avatar Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">Avatar</label>
                <div className="flex flex-wrap gap-2">
                  {EMOJI_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setForm({ ...form, avatar_emoji: emoji })}
                      className={`text-2xl p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 ${
                        form.avatar_emoji === emoji
                          ? 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500'
                          : ''
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  placeholder="Agent name"
                />
                <p className="text-xs text-gray-500 mt-1">
                  This determines the workspace directory: /Users/lilly/clawd/agents/{form.name.toLowerCase()}/
                </p>
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-medium mb-1">Role</label>
                <input
                  type="text"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  required
                  className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  placeholder="e.g., Code & Automation"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"
                  placeholder="What does this agent do?"
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as AgentStatus })}
                  className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="standby">Standby</option>
                  <option value="working">Working</option>
                  <option value="offline">Offline</option>
                </select>
              </div>

              {/* Master Toggle */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_master"
                  checked={form.is_master}
                  onChange={(e) => setForm({ ...form, is_master: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="is_master" className="text-sm">
                  Master Orchestrator (can coordinate other agents)
                </label>
              </div>

              {/* Model Selection */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Model
                  {defaultModel && form.model === defaultModel && (
                    <span className="ml-2 text-xs text-gray-500">(Default)</span>
                  )}
                </label>
                {modelsLoading ? (
                  <div className="text-sm text-gray-500">Loading available models...</div>
                ) : (
                  <select
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="">-- Use Default Model --</option>
                    {availableModels.map((model) => (
                      <option key={model} value={model}>
                        {model}{defaultModel === model ? ' (Default)' : ''}
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  AI model used by this agent. Leave empty to use OpenClaw default.
                </p>
              </div>
            </form>
          ) : activeTab === 'soul' ? (
            renderMarkdownTab('SOUL.md')
          ) : activeTab === 'user' ? (
            renderMarkdownTab('USER.md')
          ) : activeTab === 'agents' ? (
            renderMarkdownTab('AGENTS.md')
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div>
            {agent && (
              <button
                type="button"
                onClick={handleDelete}
                className="flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-sm"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Cancel
            </button>
            {activeTab === 'info' && (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {isSubmitting ? 'Saving...' : 'Save'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}