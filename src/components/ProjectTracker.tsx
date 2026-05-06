'use client';

import { useState, useEffect } from 'react';
import { FolderKanban, RefreshCw, Package, Clock, CheckCircle, AlertCircle, X, ExternalLink, FileText, Bug, Wrench, Rocket, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface Project {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'completed' | 'paused' | 'shelved' | 'not_started' | 'unknown';
  category?: string;
  progress?: number;
  priority?: 'high' | 'medium' | 'low';
  created_at?: string;
  updated_at?: string;
}

interface ProjectDetail {
  project: Project;
  toolCount?: number;
  taskCount?: number;
  bugCount?: number;
  docs?: { name: string; path: string }[];
  links?: { label: string; url: string }[];
}

interface ProjectTrackerProps {
  workspaceId: string;
}

// Project-specific configurations
const PROJECT_CONFIG: Record<string, {
  docs?: { name: string; path: string }[];
  links?: { label: string; url: string }[];
  hasTools?: boolean;
  launchDashboard?: string;
}> = {
  'atelier-tools': {
    docs: [
      { name: 'README', path: '/Users/lilly/clawd/projects/atelier-tools/README.md' },
      { name: 'Tool Concepts', path: '/Users/lilly/clawd/projects/atelier-tools/tool-concepts.md' },
    ],
    links: [
      { label: 'Live Site', url: 'https://ateliertools.com' },
      { label: 'Launch Dashboard', url: '/launch/atelier' },
      { label: 'Tools Health', url: '/workspace/default#tools-health' },
    ],
    hasTools: true,
  },
  'ahoy-vibe': {
    links: [
      { label: 'Live Site', url: 'https://ahoy-vibe.com' },
    ],
  },
  'do-this-one': {
    links: [
      { label: 'Landing Page', url: 'https://dothisone.app' },
    ],
  },
  'tab-pouch': {
    links: [
      { label: 'Chrome Store', url: 'https://chrome.google.com/webstore' },
    ],
  },
};

export function ProjectTracker({ workspaceId }: ProjectTrackerProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<ProjectDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    loadProjects();
  }, [workspaceId]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/projects');
      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects || []);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadProjectDetail = async (project: Project) => {
    setLoadingDetail(true);
    
    const config = PROJECT_CONFIG[project.id] || {};
    const detail: ProjectDetail = {
      project,
      docs: config.docs,
      links: config.links,
    };

    // Fetch tool count for Atelier Tools
    if (config.hasTools) {
      try {
        const toolsRes = await fetch('/api/tools-health');
        if (toolsRes.ok) {
          const toolsData = await toolsRes.json();
          detail.toolCount = toolsData.tools?.length || toolsData.total || 0;
        }
      } catch (e) {
        console.log('Could not fetch tools count');
      }
    }

    // Fetch related tasks
    try {
      const tasksRes = await fetch(`/api/tasks?workspace_id=${workspaceId}`);
      if (tasksRes.ok) {
        const tasks = await tasksRes.json();
        detail.taskCount = tasks.filter((t: any) => 
          t.title?.toLowerCase().includes(project.name.toLowerCase()) ||
          t.description?.toLowerCase().includes(project.name.toLowerCase())
        ).length;
      }
    } catch (e) {}

    // Fetch related bugs
    try {
      const bugsRes = await fetch('/api/bugs');
      if (bugsRes.ok) {
        const bugsData = await bugsRes.json();
        const bugs = bugsData.bugs || bugsData || [];
        detail.bugCount = bugs.filter((b: any) => 
          b.tool_name?.toLowerCase().includes(project.name.toLowerCase().replace(/\s+/g, ''))
        ).length;
      }
    } catch (e) {}

    setSelectedProject(detail);
    setLoadingDetail(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-mc-accent-green" />;
      case 'active': return <Clock className="w-4 h-4 text-mc-accent" />;
      case 'paused': case 'shelved': return <Package className="w-4 h-4 text-mc-text-secondary" />;
      default: return <AlertCircle className="w-4 h-4 text-mc-accent-yellow" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-mc-accent-green/10 text-mc-accent-green';
      case 'active': return 'bg-mc-accent/10 text-mc-accent';
      case 'paused': case 'shelved': return 'bg-mc-text-secondary/10 text-mc-text-secondary';
      case 'not_started': return 'bg-mc-accent-yellow/10 text-mc-accent-yellow';
      default: return 'bg-mc-accent-yellow/10 text-mc-accent-yellow';
    }
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high': return 'text-mc-accent-red';
      case 'medium': return 'text-mc-accent-yellow';
      case 'low': return 'text-mc-text-secondary';
      default: return 'text-mc-text-secondary';
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FolderKanban className="w-6 h-6 text-mc-accent" />
          <h2 className="text-xl font-semibold text-mc-text">Project Tracker</h2>
          <span className="text-sm text-mc-text-secondary">({projects.length} projects)</span>
        </div>
        <button
          onClick={loadProjects}
          disabled={loading}
          className="p-2 hover:bg-mc-bg-secondary rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 text-mc-text-secondary ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Project Grid */}
      {loading ? (
        <div className="bg-mc-bg-secondary rounded-lg p-8 text-center">
          <RefreshCw className="w-8 h-8 text-mc-accent animate-spin mx-auto mb-4" />
          <p className="text-mc-text-secondary">Loading projects...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => loadProjectDetail(project)}
              className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4 hover:border-mc-accent/50 transition-colors text-left group"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {getStatusIcon(project.status)}
                  <h3 className="font-medium text-mc-text">{project.name}</h3>
                </div>
                <ChevronRight className="w-4 h-4 text-mc-text-secondary group-hover:text-mc-accent transition-colors" />
              </div>

              {project.description && (
                <p className="text-sm text-mc-text-secondary mb-3 line-clamp-2">{project.description}</p>
              )}

              {project.progress !== undefined && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs text-mc-text-secondary mb-1">
                    <span>Progress</span>
                    <span>{project.progress}%</span>
                  </div>
                  <div className="w-full bg-mc-border rounded-full h-2">
                    <div
                      className="bg-mc-accent h-2 rounded-full"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 text-xs">
                <span className={`px-2 py-1 rounded ${getStatusColor(project.status)}`}>
                  {project.status.replace('_', ' ')}
                </span>
                {project.priority && (
                  <span className={getPriorityColor(project.priority)}>
                    {project.priority} priority
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Project Detail Modal */}
      {selectedProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedProject(null)}>
          <div 
            className="bg-mc-bg-secondary border border-mc-border rounded-lg w-full max-w-2xl max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-mc-border sticky top-0 bg-mc-bg-secondary">
              <div className="flex items-center gap-3">
                {getStatusIcon(selectedProject.project.status)}
                <h3 className="text-xl font-semibold text-mc-text">{selectedProject.project.name}</h3>
              </div>
              <button onClick={() => setSelectedProject(null)} className="p-2 hover:bg-mc-bg rounded-lg">
                <X className="w-5 h-5 text-mc-text-secondary" />
              </button>
            </div>

            {loadingDetail ? (
              <div className="p-8 text-center">
                <RefreshCw className="w-6 h-6 text-mc-accent animate-spin mx-auto" />
              </div>
            ) : (
              <div className="p-4 space-y-6">
                {/* Status & Progress */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-mc-bg rounded-lg p-3">
                    <div className="text-xs text-mc-text-secondary mb-1">Status</div>
                    <span className={`px-2 py-1 rounded text-sm ${getStatusColor(selectedProject.project.status)}`}>
                      {selectedProject.project.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="bg-mc-bg rounded-lg p-3">
                    <div className="text-xs text-mc-text-secondary mb-1">Progress</div>
                    <div className="text-lg font-bold text-mc-text">{selectedProject.project.progress || 0}%</div>
                  </div>
                </div>

                {/* Description */}
                {selectedProject.project.description && (
                  <div className="bg-mc-bg rounded-lg p-3">
                    <div className="text-xs text-mc-text-secondary mb-1">Description</div>
                    <p className="text-mc-text">{selectedProject.project.description}</p>
                  </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4">
                  {selectedProject.toolCount !== undefined && (
                    <div className="bg-mc-bg rounded-lg p-3 text-center">
                      <Wrench className="w-5 h-5 text-mc-accent mx-auto mb-1" />
                      <div className="text-2xl font-bold text-mc-text">{selectedProject.toolCount}</div>
                      <div className="text-xs text-mc-text-secondary">Tools</div>
                    </div>
                  )}
                  {selectedProject.taskCount !== undefined && (
                    <div className="bg-mc-bg rounded-lg p-3 text-center">
                      <FileText className="w-5 h-5 text-mc-accent mx-auto mb-1" />
                      <div className="text-2xl font-bold text-mc-text">{selectedProject.taskCount}</div>
                      <div className="text-xs text-mc-text-secondary">Tasks</div>
                    </div>
                  )}
                  {selectedProject.bugCount !== undefined && (
                    <div className="bg-mc-bg rounded-lg p-3 text-center">
                      <Bug className="w-5 h-5 text-mc-accent-red mx-auto mb-1" />
                      <div className="text-2xl font-bold text-mc-text">{selectedProject.bugCount}</div>
                      <div className="text-xs text-mc-text-secondary">Bug Reports</div>
                    </div>
                  )}
                </div>

                {/* Links */}
                {selectedProject.links && selectedProject.links.length > 0 && (
                  <div>
                    <div className="text-sm font-medium text-mc-text mb-2 flex items-center gap-2">
                      <Rocket className="w-4 h-4" />
                      Quick Links
                    </div>
                    <div className="space-y-2">
                      {selectedProject.links.map((link, i) => (
                        <Link
                          key={i}
                          href={link.url}
                          target={link.url.startsWith('http') ? '_blank' : undefined}
                          className="flex items-center justify-between bg-mc-bg rounded-lg p-3 hover:bg-mc-bg-tertiary transition-colors"
                        >
                          <span className="text-mc-text">{link.label}</span>
                          <ExternalLink className="w-4 h-4 text-mc-text-secondary" />
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Documents */}
                {selectedProject.docs && selectedProject.docs.length > 0 && (
                  <div>
                    <div className="text-sm font-medium text-mc-text mb-2 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Documents
                    </div>
                    <div className="space-y-2">
                      {selectedProject.docs.map((doc, i) => (
                        <div key={i} className="flex items-center justify-between bg-mc-bg rounded-lg p-3">
                          <span className="text-mc-text">{doc.name}</span>
                          <span className="text-xs text-mc-text-secondary truncate max-w-[200px]">{doc.path}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
