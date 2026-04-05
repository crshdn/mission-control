'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Tag, AlertTriangle, Lightbulb, Code2, Target, DollarSign, Copy } from 'lucide-react';
import type { Idea } from '@/lib/types';

interface IdeaCardProps {
  idea: Idea;
  onAction?: (action: 'approve' | 'reject' | 'maybe' | 'fire', notes?: string) => void;
  showActions?: boolean;
  compact?: boolean;
}

const categoryColors: Record<string, string> = {
  feature: 'bg-blue-500/20 text-blue-400',
  improvement: 'bg-cyan-500/20 text-cyan-400',
  ux: 'bg-purple-500/20 text-purple-400',
  performance: 'bg-yellow-500/20 text-yellow-400',
  integration: 'bg-green-500/20 text-green-400',
  infrastructure: 'bg-orange-500/20 text-orange-400',
  content: 'bg-pink-500/20 text-pink-400',
  growth: 'bg-emerald-500/20 text-emerald-400',
  monetization: 'bg-amber-500/20 text-amber-400',
  operations: 'bg-slate-500/20 text-slate-400',
  security: 'bg-red-500/20 text-red-400',
};

const complexityColors: Record<string, string> = {
  S: 'text-green-400',
  M: 'text-yellow-400',
  L: 'text-orange-400',
  XL: 'text-red-400',
};

export function IdeaCard({ idea, onAction, showActions = true, compact = false }: IdeaCardProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (section: string) => {
    setExpanded(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const tags: string[] = idea.tags ? JSON.parse(idea.tags) : [];
  const risks: string[] = idea.risks ? JSON.parse(idea.risks) : [];

  // Parse similarity flag if present
  const similarIdeas: Array<{ idea_id: string; title: string; status: string; similarity: number }> =
    idea.similarity_flag ? (() => { try { return JSON.parse(idea.similarity_flag); } catch { return []; } })() : [];

  return (
    <div className="bg-mc-bg-secondary border border-mc-border rounded-xl p-5 space-y-4 max-w-md w-full mx-auto">
      {/* Header: category + complexity */}
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium px-2 py-1 rounded ${categoryColors[idea.category] || 'bg-mc-bg-tertiary text-mc-text-secondary'}`}>
          {idea.category}
        </span>
        {idea.complexity && (
          <span className={`text-sm font-bold ${complexityColors[idea.complexity] || 'text-mc-text-secondary'}`}>
            {idea.complexity}
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="text-lg font-semibold text-mc-text leading-tight">{idea.title}</h3>

      {/* Description */}
      <p className="text-sm text-mc-text-secondary leading-relaxed">
        {compact && idea.description.length > 200
          ? idea.description.slice(0, 200) + '...'
          : idea.description}
      </p>

      {/* Scores */}
      {(idea.impact_score || idea.feasibility_score) && (
        <div className="flex items-center gap-4 text-sm">
          {idea.impact_score && (
            <div className="flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-mc-accent-cyan" />
              <span className="text-mc-text-secondary">Impact:</span>
              <span className="font-semibold text-mc-text">{idea.impact_score.toFixed(1)}</span>
            </div>
          )}
          {idea.feasibility_score && (
            <div className="flex items-center gap-1.5">
              <Code2 className="w-3.5 h-3.5 text-mc-accent-green" />
              <span className="text-mc-text-secondary">Feasibility:</span>
              <span className="font-semibold text-mc-text">{idea.feasibility_score.toFixed(1)}</span>
            </div>
          )}
        </div>
      )}

      {/* Resurfaced badge */}
      {idea.source === 'resurfaced' && (
        <div className="text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded inline-block">
          Resurfaced: {idea.resurfaced_reason || 'From maybe pool'}
        </div>
      )}

      {/* Similarity badge — shows when idea is similar to existing ones */}
      {similarIdeas.length > 0 && (
        <div className="space-y-1">
          {similarIdeas.map((sim, i) => {
            const pct = Math.round(sim.similarity * 100);
            const statusColors: Record<string, string> = {
              approved: 'text-green-400',
              rejected: 'text-red-400',
              maybe: 'text-amber-400',
              pending: 'text-mc-text-secondary',
              building: 'text-blue-400',
              built: 'text-cyan-400',
              shipped: 'text-emerald-400',
            };
            const statusColor = statusColors[sim.status] || 'text-mc-text-secondary';
            return (
              <div key={i} className="flex items-start gap-1.5 text-xs bg-violet-500/15 text-violet-300 px-2 py-1.5 rounded border border-violet-500/20">
                <Copy className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>
                  Similar to: <span className="font-medium text-violet-200">&ldquo;{sim.title}&rdquo;</span>
                  {' '}(<span className={statusColor}>{sim.status}</span>, {pct}% match)
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Collapsible: Research backing */}
      {idea.research_backing && (
        <CollapsibleSection
          icon={<Lightbulb className="w-3.5 h-3.5" />}
          label="Research"
          expanded={expanded.research}
          onToggle={() => toggle('research')}
          content={idea.research_backing}
        />
      )}

      {/* Collapsible: Technical approach */}
      {idea.technical_approach && (
        <CollapsibleSection
          icon={<Code2 className="w-3.5 h-3.5" />}
          label="Approach"
          expanded={expanded.approach}
          onToggle={() => toggle('approach')}
          content={idea.technical_approach}
        />
      )}

      {/* Collapsible: Risks */}
      {risks.length > 0 && (
        <CollapsibleSection
          icon={<AlertTriangle className="w-3.5 h-3.5" />}
          label={`Risks (${risks.length})`}
          expanded={expanded.risks}
          onToggle={() => toggle('risks')}
          content={risks.map(r => `• ${r}`).join('\n')}
        />
      )}

      {/* Revenue potential */}
      {idea.revenue_potential && (
        <div className="flex items-start gap-1.5 text-sm text-mc-text-secondary">
          <DollarSign className="w-3.5 h-3.5 mt-0.5 text-mc-accent-green" />
          <span>{idea.revenue_potential}</span>
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map(tag => (
            <span key={tag} className="text-xs bg-mc-bg-tertiary text-mc-text-secondary px-2 py-0.5 rounded">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Action buttons */}
      {showActions && onAction && (
        <div className="grid grid-cols-4 gap-2 pt-2">
          <button
            onClick={() => onAction('reject')}
            className="min-h-11 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-medium transition-colors"
          >
            Pass
          </button>
          <button
            onClick={() => onAction('maybe')}
            className="min-h-11 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-sm font-medium transition-colors"
          >
            Maybe
          </button>
          <button
            onClick={() => onAction('approve')}
            className="min-h-11 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-400 text-sm font-medium transition-colors"
          >
            Yes
          </button>
          <button
            onClick={() => onAction('fire')}
            className="min-h-11 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 text-sm font-medium transition-colors"
          >
            Now!
          </button>
        </div>
      )}
    </div>
  );
}

function CollapsibleSection({
  icon,
  label,
  expanded,
  onToggle,
  content,
}: {
  icon: React.ReactNode;
  label: string;
  expanded?: boolean;
  onToggle: () => void;
  content: string;
}) {
  return (
    <div className="border border-mc-border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-mc-text-secondary hover:bg-mc-bg-tertiary transition-colors"
      >
        {icon}
        <span className="flex-1 text-left">{label}</span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 text-sm text-mc-text-secondary whitespace-pre-wrap">
          {content}
        </div>
      )}
    </div>
  );
}
