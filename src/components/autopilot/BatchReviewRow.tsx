'use client';

import { Target, Code2, Tag } from 'lucide-react';
import type { Idea, SwipeAction } from '@/lib/types';

interface BatchReviewRowProps {
  idea: Idea;
  selected: boolean;
  action: SwipeAction | null;
  onToggleSelect: () => void;
  onActionChange: (action: SwipeAction | null) => void;
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

export function BatchReviewRow({ idea, selected, action, onToggleSelect, onActionChange }: BatchReviewRowProps) {
  const tags: string[] = idea.tags ? (() => { try { return JSON.parse(idea.tags!); } catch { return []; } })() : [];

  return (
    <div className={`flex items-start gap-3 p-4 border-b border-mc-border transition-colors ${
      action ? 'bg-mc-bg-secondary/50' : 'hover:bg-mc-bg-secondary/30'
    }`}>
      {/* Checkbox */}
      <div className="pt-1">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="w-4 h-4 rounded border-mc-border bg-mc-bg text-mc-accent focus:ring-mc-accent/50 cursor-pointer"
        />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-2">
        {/* Title + category + complexity */}
        <div className="flex items-start gap-2">
          <h4 className="text-sm font-medium text-mc-text leading-tight flex-1 min-w-0">{idea.title}</h4>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${categoryColors[idea.category] || 'bg-mc-bg-tertiary text-mc-text-secondary'}`}>
              {idea.category}
            </span>
            {idea.complexity && (
              <span className={`text-xs font-bold ${complexityColors[idea.complexity] || 'text-mc-text-secondary'}`}>
                {idea.complexity}
              </span>
            )}
          </div>
        </div>

        {/* Description (truncated) */}
        <p className="text-xs text-mc-text-secondary line-clamp-2 leading-relaxed">
          {idea.description}
        </p>

        {/* Scores + tags */}
        <div className="flex items-center gap-4 flex-wrap">
          {idea.impact_score != null && (
            <div className="flex items-center gap-1 text-xs text-mc-text-secondary">
              <Target className="w-3 h-3 text-mc-accent-cyan" />
              <span>Impact: <span className="font-medium text-mc-text">{idea.impact_score.toFixed(1)}</span></span>
            </div>
          )}
          {idea.feasibility_score != null && (
            <div className="flex items-center gap-1 text-xs text-mc-text-secondary">
              <Code2 className="w-3 h-3 text-mc-accent-green" />
              <span>Feasibility: <span className="font-medium text-mc-text">{idea.feasibility_score.toFixed(1)}</span></span>
            </div>
          )}
          {idea.research_backing && (
            <div className="flex items-center gap-1 text-xs text-mc-text-secondary">
              <Tag className="w-3 h-3" />
              <span>Has research backing</span>
            </div>
          )}
          {tags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {tags.slice(0, 3).map(tag => (
                <span key={tag} className="text-[10px] bg-mc-bg-tertiary text-mc-text-secondary px-1.5 py-0.5 rounded">
                  {tag}
                </span>
              ))}
              {tags.length > 3 && (
                <span className="text-[10px] text-mc-text-secondary">+{tags.length - 3}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action dropdown */}
      <div className="shrink-0 pt-0.5">
        <select
          value={action || ''}
          onChange={e => {
            const val = e.target.value;
            onActionChange(val ? val as SwipeAction : null);
          }}
          className={`text-xs rounded-lg border px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-mc-accent/50 cursor-pointer ${
            action === 'approve' ? 'bg-green-500/20 border-green-500/40 text-green-400' :
            action === 'reject' ? 'bg-red-500/20 border-red-500/40 text-red-400' :
            action === 'maybe' ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' :
            action === 'fire' ? 'bg-orange-500/20 border-orange-500/40 text-orange-400' :
            'bg-mc-bg border-mc-border text-mc-text-secondary'
          }`}
        >
          <option value="">— Action —</option>
          <option value="approve">✅ Approve</option>
          <option value="reject">❌ Reject</option>
          <option value="maybe">🤔 Maybe</option>
          <option value="fire">🔥 Build Now</option>
        </select>
      </div>
    </div>
  );
}
