'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  ChevronDown,
  ChevronRight,
  BookOpen,
  BookText,
  Rocket,
  Lightbulb,
  Brain,
  FileText,
  ArrowLeft,
  Calendar,
  Tag,
} from 'lucide-react';
import dynamic from 'next/dynamic';

const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });

interface BrainDocument {
  id: string;
  title: string;
  date: string;
  tags: string[];
  type: string;
  path: string;
}

interface BrainDocumentFull extends BrainDocument {
  content: string;
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  concept: { label: 'Concepts', icon: BookOpen, color: 'text-mc-accent' },
  journal: { label: 'Journal', icon: BookText, color: 'text-mc-accent-yellow' },
  project: { label: 'Projects', icon: Rocket, color: 'text-mc-accent-green' },
  insight: { label: 'Insights', icon: Lightbulb, color: 'text-mc-accent-purple' },
};

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function BrainPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<BrainDocument[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<BrainDocumentFull | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [docLoading, setDocLoading] = useState(false);
  const [remarkGfm, setRemarkGfm] = useState<any>(null);
  const [rehypeHighlight, setRehypeHighlight] = useState<any>(null);

  // Load plugins
  useEffect(() => {
    import('remark-gfm').then((mod) => setRemarkGfm(() => mod.default));
    import('rehype-highlight').then((mod) => setRehypeHighlight(() => mod.default));
  }, []);

  // Fetch documents
  useEffect(() => {
    fetch('/api/brain/documents')
      .then((res) => res.json())
      .then((data) => {
        setDocuments(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch documents:', err);
        setLoading(false);
      });
  }, []);

  // Select document
  const handleSelect = useCallback(async (id: string) => {
    setSelectedId(id);
    setDocLoading(true);
    try {
      const res = await fetch(`/api/brain/documents/${id}`);
      const data = await res.json();
      setSelectedDoc(data);
    } catch (err) {
      console.error('Failed to fetch document:', err);
    }
    setDocLoading(false);
  }, []);

  // Toggle group collapse
  const toggleGroup = (type: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  // Filter and group documents
  const grouped = useMemo(() => {
    const filtered = documents.filter((doc) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        doc.title.toLowerCase().includes(q) ||
        doc.tags.some((t) => t.toLowerCase().includes(q)) ||
        doc.type.toLowerCase().includes(q)
      );
    });

    const groups: Record<string, BrainDocument[]> = {};
    for (const type of Object.keys(TYPE_CONFIG)) {
      const docs = filtered.filter((d) => d.type === type);
      if (docs.length > 0) groups[type] = docs;
    }
    // Also catch any unknown types
    const knownTypes = new Set(Object.keys(TYPE_CONFIG));
    const unknown = filtered.filter((d) => !knownTypes.has(d.type));
    if (unknown.length > 0) groups['other'] = unknown;

    return groups;
  }, [documents, search]);

  const totalDocs = documents.length;
  const typeStats = useMemo(() => {
    const stats: Record<string, number> = {};
    for (const doc of documents) {
      stats[doc.type] = (stats[doc.type] || 0) + 1;
    }
    return stats;
  }, [documents]);

  return (
    <div className="flex h-screen bg-mc-bg overflow-hidden">
      {/* Left Sidebar */}
      <aside className="w-80 min-w-[320px] bg-mc-bg-secondary border-r border-mc-border flex flex-col">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-mc-border">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => router.push('/')}
              className="p-1.5 hover:bg-mc-bg-tertiary rounded transition-colors text-mc-text-secondary hover:text-mc-text"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-mc-accent-purple" />
              <h1 className="text-lg font-semibold text-mc-text">2nd Brain</h1>
            </div>
            <span className="ml-auto text-xs text-mc-text-secondary bg-mc-bg-tertiary px-2 py-0.5 rounded-full">
              {totalDocs}
            </span>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mc-text-secondary" />
            <input
              type="text"
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-mc-bg border border-mc-border rounded-lg pl-10 pr-4 py-2 text-sm text-mc-text placeholder:text-mc-text-secondary/50 focus:outline-none focus:border-mc-accent-purple/50 focus:ring-1 focus:ring-mc-accent-purple/20 transition-all"
            />
          </div>
        </div>

        {/* Document List */}
        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-5 h-5 border-2 border-mc-accent-purple border-t-transparent rounded-full" />
            </div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="text-center py-12 text-mc-text-secondary text-sm">
              {search ? 'No documents match your search' : 'No documents yet'}
            </div>
          ) : (
            Object.entries(grouped).map(([type, docs]) => {
              const config = TYPE_CONFIG[type] || {
                label: type,
                icon: FileText,
                color: 'text-mc-text-secondary',
              };
              const Icon = config.icon;
              const isCollapsed = collapsedGroups.has(type);

              return (
                <div key={type} className="mb-1">
                  {/* Group Header */}
                  <button
                    onClick={() => toggleGroup(type)}
                    className="w-full flex items-center gap-2 px-4 py-2 hover:bg-mc-bg-tertiary/50 transition-colors"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-3.5 h-3.5 text-mc-text-secondary" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-mc-text-secondary" />
                    )}
                    <Icon className={`w-4 h-4 ${config.color}`} />
                    <span className="text-xs font-semibold uppercase tracking-wider text-mc-text-secondary">
                      {config.label}
                    </span>
                    <span className="ml-auto text-xs text-mc-text-secondary/60">{docs.length}</span>
                  </button>

                  {/* Group Items */}
                  {!isCollapsed && (
                    <div className="pb-1">
                      {docs.map((doc) => (
                        <button
                          key={doc.id}
                          onClick={() => handleSelect(doc.id)}
                          className={`w-full text-left px-4 py-2.5 pl-10 transition-all group ${
                            selectedId === doc.id
                              ? 'bg-mc-accent-purple/10 border-l-2 border-mc-accent-purple'
                              : 'hover:bg-mc-bg-tertiary/30 border-l-2 border-transparent'
                          }`}
                        >
                          <div
                            className={`text-sm font-medium truncate ${
                              selectedId === doc.id ? 'text-mc-text' : 'text-mc-text-secondary group-hover:text-mc-text'
                            }`}
                          >
                            {doc.title}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            {doc.date && (
                              <span className="text-xs text-mc-text-secondary/60">
                                {formatDate(doc.date)}
                              </span>
                            )}
                            {doc.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-mc-bg-tertiary text-mc-text-secondary/70"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {docLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin w-6 h-6 border-2 border-mc-accent-purple border-t-transparent rounded-full" />
          </div>
        ) : selectedDoc ? (
          <>
            {/* Document Header */}
            <div className="px-8 py-5 border-b border-mc-border bg-mc-bg-secondary/50">
              <div className="flex items-center gap-3 mb-2">
                {(() => {
                  const config = TYPE_CONFIG[selectedDoc.type];
                  if (!config) return null;
                  const Icon = config.icon;
                  return (
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${config.color} bg-mc-bg-tertiary`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {config.label.replace(/s$/, '')}
                    </span>
                  );
                })()}
              </div>
              <h1 className="text-2xl font-bold text-mc-text">{selectedDoc.title}</h1>
              <div className="flex items-center gap-4 mt-2">
                {selectedDoc.date && (
                  <span className="flex items-center gap-1.5 text-sm text-mc-text-secondary">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(selectedDoc.date)}
                  </span>
                )}
                {selectedDoc.tags.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-mc-text-secondary" />
                    {selectedDoc.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-0.5 rounded-md bg-mc-bg-tertiary text-mc-text-secondary border border-mc-border/50"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Document Content */}
            <div className="flex-1 overflow-y-auto px-8 py-6">
              <div className="max-w-3xl brain-content">
                {ReactMarkdown && (
                  <ReactMarkdown
                    remarkPlugins={remarkGfm ? [remarkGfm] : []}
                    rehypePlugins={rehypeHighlight ? [rehypeHighlight] : []}
                  >
                    {selectedDoc.content}
                  </ReactMarkdown>
                )}
              </div>
            </div>
          </>
        ) : (
          /* Welcome / Empty State */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-mc-accent-purple/10 border border-mc-accent-purple/20 flex items-center justify-center">
                <Brain className="w-10 h-10 text-mc-accent-purple" />
              </div>
              <h2 className="text-2xl font-bold text-mc-text mb-2">2nd Brain</h2>
              <p className="text-mc-text-secondary mb-8">
                Your knowledge base — concepts, journals, projects, and insights all in one place.
              </p>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(TYPE_CONFIG).map(([type, config]) => {
                  const Icon = config.icon;
                  const count = typeStats[type] || 0;
                  return (
                    <div
                      key={type}
                      className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4 text-left"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={`w-4 h-4 ${config.color}`} />
                        <span className="text-xs font-medium text-mc-text-secondary uppercase tracking-wider">
                          {config.label}
                        </span>
                      </div>
                      <div className="text-2xl font-bold text-mc-text">{count}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
