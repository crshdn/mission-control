'use client';

import { useState, useEffect, useMemo } from 'react';
import { Search, FileText, Calendar, User, Folder, ExternalLink, Download, Copy } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

interface Document {
  id: string;
  title: string;
  path: string;
  content: string;
  category: 'research' | 'briefs' | 'specs' | 'reports' | 'memory' | 'other';
  agent: string;
  project?: string;
  created_at: string;
  modified_at: string;
  word_count: number;
  file_size: number;
}

interface DocsLibraryProps {
  workspaceId: string;
}

const CATEGORY_COLORS = {
  research: 'bg-mc-accent-cyan/20 text-mc-accent-cyan',
  briefs: 'bg-mc-accent-purple/20 text-mc-accent-purple',
  specs: 'bg-mc-accent-yellow/20 text-mc-accent-yellow',
  reports: 'bg-mc-accent-green/20 text-mc-accent-green',
  memory: 'bg-mc-accent-pink/20 text-mc-accent-pink',
  other: 'bg-mc-text-tertiary/20 text-mc-text-tertiary',
};

const CATEGORY_LABELS = {
  research: 'Research',
  briefs: 'Task Briefs',
  specs: 'Specifications',
  reports: 'Reports',
  memory: 'Daily Notes',
  other: 'Other',
};

export function DocsLibrary({ workspaceId }: DocsLibraryProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocs, setFilteredDocs] = useState<Document[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const loadDocuments = async () => {
    try {
      const res = await fetch('/api/docs/library');
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
        setLastUpdated(new Date(data.lastScan || new Date()));
      }
    } catch (error) {
      console.error('Failed to load documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const triggerScan = async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/docs/scan', { method: 'POST' });
      if (res.ok) {
        await loadDocuments();
      }
    } catch (error) {
      console.error('Failed to trigger document scan:', error);
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    loadDocuments();

    // Auto-refresh every 5 minutes
    const interval = setInterval(loadDocuments, 300000);
    return () => clearInterval(interval);
  }, []);

  // Extract unique values for filters
  const uniqueAgents = useMemo(() => {
    const agents = Array.from(new Set(documents.map(doc => doc.agent).filter(Boolean)));
    return agents.sort();
  }, [documents]);

  const uniqueProjects = useMemo(() => {
    const projects = Array.from(new Set(documents.map(doc => doc.project).filter(Boolean)));
    return projects.sort();
  }, [documents]);

  // Filter and search documents
  useEffect(() => {
    let filtered = documents;

    // Category filter
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(doc => doc.category === selectedCategory);
    }

    // Agent filter
    if (selectedAgent !== 'all') {
      filtered = filtered.filter(doc => doc.agent === selectedAgent);
    }

    // Project filter
    if (selectedProject !== 'all') {
      filtered = filtered.filter(doc => doc.project === selectedProject);
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(doc => 
        doc.title.toLowerCase().includes(query) ||
        doc.content.toLowerCase().includes(query) ||
        doc.path.toLowerCase().includes(query) ||
        doc.agent.toLowerCase().includes(query) ||
        (doc.project && doc.project.toLowerCase().includes(query))
      );
    }

    // Sort by most recently modified
    filtered.sort((a, b) => new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime());

    setFilteredDocs(filtered);
  }, [documents, searchQuery, selectedCategory, selectedAgent, selectedProject]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const downloadDocument = (doc: Document) => {
    const blob = new Blob([doc.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.title.replace(/[^a-zA-Z0-9]/g, '_')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-mc-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-mc-text-secondary">Loading document library...</p>
        </div>
      </div>
    );
  }

  const categoryCounts = Object.keys(CATEGORY_LABELS).reduce((acc, category) => {
    acc[category] = documents.filter(doc => doc.category === category).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="flex-1 overflow-hidden">
      <div className="h-full flex">
        {/* Main Library */}
        <div className="flex-1 overflow-auto">
          <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-mc-text">Docs Library</h2>
                <p className="text-mc-text-secondary">Searchable repository of all agent-generated documents</p>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={triggerScan}
                  disabled={scanning}
                  className="flex items-center gap-2 px-4 py-2 bg-mc-accent text-white rounded font-medium hover:bg-mc-accent/80 disabled:opacity-50"
                >
                  <Search className="w-4 h-4" />
                  {scanning ? 'Scanning...' : 'Rescan'}
                </button>
                <div className="text-sm text-mc-text-secondary">
                  Last scan: {format(lastUpdated, 'HH:mm:ss')}
                </div>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {Object.entries(CATEGORY_LABELS).map(([category, label]) => (
                <div key={category} className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-3">
                    <Folder className={`w-5 h-5 flex-shrink-0 ${CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS].split(' ')[1]}`} />
                    <div className="min-w-0">
                      <p className="text-2xl font-bold text-mc-text">{categoryCounts[category] || 0}</p>
                      <p className="text-sm text-mc-text-secondary truncate">{label}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Search and Filters */}
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-mc-text-secondary" />
                <input
                  type="text"
                  placeholder="Search documents by title, content, agent, or project..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-mc-bg-secondary border border-mc-border rounded-lg text-mc-text placeholder-mc-text-secondary focus:outline-none focus:ring-2 focus:ring-mc-accent focus:border-transparent"
                />
              </div>

              {/* Filters */}
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-mc-text">Category:</label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="bg-mc-bg-secondary border border-mc-border rounded px-3 py-1 text-sm"
                  >
                    <option value="all">All Categories</option>
                    {Object.entries(CATEGORY_LABELS).map(([category, label]) => (
                      <option key={category} value={category}>{label}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-mc-text">Agent:</label>
                  <select
                    value={selectedAgent}
                    onChange={(e) => setSelectedAgent(e.target.value)}
                    className="bg-mc-bg-secondary border border-mc-border rounded px-3 py-1 text-sm"
                  >
                    <option value="all">All Agents</option>
                    {uniqueAgents.map(agent => (
                      <option key={agent} value={agent}>{agent}</option>
                    ))}
                  </select>
                </div>

                {uniqueProjects.length > 0 && (
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-mc-text">Project:</label>
                    <select
                      value={selectedProject}
                      onChange={(e) => setSelectedProject(e.target.value)}
                      className="bg-mc-bg-secondary border border-mc-border rounded px-3 py-1 text-sm"
                    >
                      <option value="all">All Projects</option>
                      {uniqueProjects.map(project => (
                        <option key={project} value={project}>{project}</option>
                      ))}
                    </select>
                  </div>
                )}

                {(searchQuery || selectedCategory !== 'all' || selectedAgent !== 'all' || selectedProject !== 'all') && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('all');
                      setSelectedAgent('all');
                      setSelectedProject('all');
                    }}
                    className="text-sm text-mc-accent hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {/* Results count */}
              <div className="text-sm text-mc-text-secondary">
                Showing {filteredDocs.length} of {documents.length} documents
              </div>
            </div>

            {/* Document List */}
            <div className="space-y-3">
              {filteredDocs.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 text-mc-text-tertiary mx-auto mb-3" />
                  <p className="text-mc-text-secondary">No documents found</p>
                  <p className="text-sm text-mc-text-secondary mt-1">
                    {searchQuery || selectedCategory !== 'all' || selectedAgent !== 'all' || selectedProject !== 'all'
                      ? 'Try adjusting your search or filters'
                      : 'Try running a document scan to discover files'
                    }
                  </p>
                </div>
              ) : (
                filteredDocs.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => setSelectedDoc(doc)}
                    className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4 hover:bg-mc-bg-tertiary cursor-pointer transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="w-4 h-4 text-mc-text-secondary flex-shrink-0" />
                          <h3 className="font-medium text-mc-text truncate">{doc.title}</h3>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${CATEGORY_COLORS[doc.category]}`}>
                            {CATEGORY_LABELS[doc.category]}
                          </span>
                        </div>
                        
                        <p className="text-sm text-mc-text-secondary mb-2 line-clamp-2">
                          {doc.content.substring(0, 200)}...
                        </p>
                        
                        <div className="flex items-center gap-4 text-xs text-mc-text-secondary">
                          <div className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            <span>{doc.agent}</span>
                          </div>
                          {doc.project && (
                            <div className="flex items-center gap-1">
                              <Folder className="w-3 h-3" />
                              <span>{doc.project}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            <span>{formatDistanceToNow(new Date(doc.modified_at), { addSuffix: true })}</span>
                          </div>
                          <span>{doc.word_count} words</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(doc.content);
                          }}
                          className="p-2 text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary rounded"
                          title="Copy content"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadDocument(doc);
                          }}
                          className="p-2 text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary rounded"
                          title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Document Preview Sidebar */}
        {selectedDoc && (
          <div className="w-96 bg-mc-bg-secondary border-l border-mc-border overflow-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-mc-text">Document Preview</h3>
                <button
                  onClick={() => setSelectedDoc(null)}
                  className="text-mc-text-secondary hover:text-mc-text"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                {/* Metadata */}
                <div className="bg-mc-bg border border-mc-border rounded-lg p-4">
                  <h4 className="font-medium text-mc-text mb-3">{selectedDoc.title}</h4>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-mc-text-secondary">Category:</span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${CATEGORY_COLORS[selectedDoc.category]}`}>
                        {CATEGORY_LABELS[selectedDoc.category]}
                      </span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-mc-text-secondary">Agent:</span>
                      <span className="text-mc-text">{selectedDoc.agent}</span>
                    </div>
                    
                    {selectedDoc.project && (
                      <div className="flex justify-between">
                        <span className="text-mc-text-secondary">Project:</span>
                        <span className="text-mc-text">{selectedDoc.project}</span>
                      </div>
                    )}
                    
                    <div className="flex justify-between">
                      <span className="text-mc-text-secondary">Created:</span>
                      <span className="text-mc-text">{format(new Date(selectedDoc.created_at), 'MMM d, yyyy')}</span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-mc-text-secondary">Modified:</span>
                      <span className="text-mc-text">{format(new Date(selectedDoc.modified_at), 'MMM d, yyyy')}</span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-mc-text-secondary">Word Count:</span>
                      <span className="text-mc-text">{selectedDoc.word_count.toLocaleString()}</span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-mc-text-secondary">File Size:</span>
                      <span className="text-mc-text">{(selectedDoc.file_size / 1024).toFixed(1)} KB</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-mc-border">
                    <button
                      onClick={() => copyToClipboard(selectedDoc.content)}
                      className="flex items-center gap-1 px-3 py-1 bg-mc-accent text-white rounded text-sm font-medium hover:bg-mc-accent/80"
                    >
                      <Copy className="w-3 h-3" />
                      Copy
                    </button>
                    <button
                      onClick={() => downloadDocument(selectedDoc)}
                      className="flex items-center gap-1 px-3 py-1 bg-mc-bg-tertiary text-mc-text rounded text-sm font-medium hover:bg-mc-border"
                    >
                      <Download className="w-3 h-3" />
                      Download
                    </button>
                    <a
                      href={selectedDoc.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-3 py-1 bg-mc-bg-tertiary text-mc-text rounded text-sm font-medium hover:bg-mc-border"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Open File
                    </a>
                  </div>
                </div>

                {/* Content Preview */}
                <div>
                  <h4 className="font-medium text-mc-text mb-3">Content</h4>
                  <div className="bg-mc-bg border border-mc-border rounded-lg p-4 max-h-96 overflow-y-auto">
                    <pre className="text-sm text-mc-text-secondary whitespace-pre-wrap font-mono">
                      {selectedDoc.content}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}