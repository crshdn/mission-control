'use client';

import { useState, useEffect } from 'react';
import { FolderKanban, RefreshCw, Package, Clock, CheckCircle, AlertCircle } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description?: string;
  version?: string;
  status: 'active' | 'completed' | 'archived' | 'unknown';
  lastUpdated: string;
  type: 'npm' | 'folder' | 'markdown';
  progress?: number;
  technologies?: string[];
}

interface ProjectTrackerProps {
  workspaceId: string;
}

export function ProjectTracker({ workspaceId }: ProjectTrackerProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    loadProjects();
  }, [workspaceId]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/projects');
      if (response.ok) {
        const projectData = await response.json();
        setProjects(projectData.projects || projectData);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-mc-accent-green" />;
      case 'active':
        return <Clock className="w-4 h-4 text-mc-accent" />;
      case 'archived':
        return <Package className="w-4 h-4 text-mc-text-secondary" />;
      default:
        return <AlertCircle className="w-4 h-4 text-mc-accent-yellow" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-mc-accent-green/10 text-mc-accent-green';
      case 'active':
        return 'bg-mc-accent/10 text-mc-accent';
      case 'archived':
        return 'bg-mc-text-secondary/10 text-mc-text-secondary';
      default:
        return 'bg-mc-accent-yellow/10 text-mc-accent-yellow';
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FolderKanban className="w-6 h-6 text-mc-accent" />
          <h2 className="text-xl font-semibold text-mc-text">Project Tracker</h2>
          <span className="text-sm text-mc-text-secondary">
            ({projects.length} projects)
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadProjects}
            disabled={loading}
            className="p-2 hover:bg-mc-bg-secondary rounded-lg transition-colors"
            title="Refresh projects"
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
          <p className="text-mc-text-secondary">Scanning projects directory...</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-mc-bg-secondary rounded-lg p-8 text-center">
          <Package className="w-12 h-12 text-mc-text-secondary mx-auto mb-4" />
          <p className="text-mc-text-secondary">No projects found</p>
          <p className="text-sm text-mc-text-muted mt-2">Check /Users/lilly/clawd/projects/ directory</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <div
                key={project.id}
                className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4 hover:border-mc-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(project.status)}
                    <h3 className="font-medium text-mc-text truncate">{project.name}</h3>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(project.status)}`}>
                    {project.status}
                  </span>
                </div>

                {project.description && (
                  <p className="text-sm text-mc-text-secondary mb-3 line-clamp-2">
                    {project.description}
                  </p>
                )}

                {project.progress !== undefined && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs text-mc-text-secondary mb-1">
                      <span>Progress</span>
                      <span>{project.progress}%</span>
                    </div>
                    <div className="w-full bg-mc-border rounded-full h-2">
                      <div
                        className="bg-mc-accent h-2 rounded-full transition-all duration-300"
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-mc-text-secondary">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded ${project.type === 'npm' ? 'bg-mc-accent/10 text-mc-accent' : 'bg-mc-text-secondary/10 text-mc-text-secondary'}`}>
                      {project.type}
                    </span>
                    {project.version && (
                      <span>v{project.version}</span>
                    )}
                  </div>
                  <span>{formatTimeAgo(project.lastUpdated)}</span>
                </div>

                {project.technologies && project.technologies.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {project.technologies.slice(0, 3).map((tech) => (
                      <span
                        key={tech}
                        className="px-1.5 py-0.5 bg-mc-bg text-xs text-mc-text-secondary rounded"
                      >
                        {tech}
                      </span>
                    ))}
                    {project.technologies.length > 3 && (
                      <span className="px-1.5 py-0.5 bg-mc-bg text-xs text-mc-text-secondary rounded">
                        +{project.technologies.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="bg-mc-bg-secondary rounded-lg p-4">
            <h3 className="font-medium text-mc-text mb-3">Project Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {['active', 'completed', 'archived', 'unknown'].map((status) => {
                const count = projects.filter(p => p.status === status).length;
                return (
                  <div key={status} className="text-center">
                    <div className="text-2xl font-bold text-mc-text">{count}</div>
                    <div className="text-sm text-mc-text-secondary capitalize">{status}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
