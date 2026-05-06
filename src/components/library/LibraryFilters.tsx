'use client';

import React from 'react';
import { LibraryItemData, LibraryFilters as LibraryFiltersType } from './MessageLibrary';

interface LibraryFiltersProps {
  filters: LibraryFiltersType;
  onChange: (filters: LibraryFiltersType) => void;
  items: LibraryItemData[];
}

export function LibraryFilters({ filters, onChange, items }: LibraryFiltersProps) {
  // Get unique values for filter options
  const folders = Array.from(new Set(items.map(item => item.folder))).sort();
  const types = Array.from(new Set(items.map(item => item.type))).sort();
  const tags = Array.from(new Set(items.flatMap(item => item.tags))).sort();

  const typeLabels: Record<string, string> = {
    'research': '📊 Research',
    'marketing': '📈 Marketing',
    'reference': '📚 Reference',
    'chat-message': '💬 Chat Message',
    'url': '🔗 URL',
    'note': '📝 Note'
  };

  const folderLabels: Record<string, string> = {
    'inbox': '📥 Inbox',
    'research': '📊 Research',
    'marketing': '📈 Marketing',
    'archive': '🗄️ Archive',
    'favorites': '⭐ Favorites'
  };

  return (
    <div className="flex flex-wrap gap-3">
      {/* Folder Filter */}
      <div className="flex flex-col">
        <label className="text-xs text-gray-500 mb-1">Folder</label>
        <select
          value={filters.folder}
          onChange={(e) => onChange({ ...filters, folder: e.target.value })}
          className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">All Folders</option>
          {folders.map(folder => (
            <option key={folder} value={folder}>
              {folderLabels[folder] || folder}
            </option>
          ))}
        </select>
      </div>

      {/* Type Filter */}
      <div className="flex flex-col">
        <label className="text-xs text-gray-500 mb-1">Type</label>
        <select
          value={filters.type}
          onChange={(e) => onChange({ ...filters, type: e.target.value })}
          className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">All Types</option>
          {types.map(type => (
            <option key={type} value={type}>
              {typeLabels[type] || type}
            </option>
          ))}
        </select>
      </div>

      {/* Tag Filter */}
      <div className="flex flex-col">
        <label className="text-xs text-gray-500 mb-1">Tag</label>
        <select
          value={filters.tag}
          onChange={(e) => onChange({ ...filters, tag: e.target.value })}
          className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All Tags</option>
          {tags.map(tag => (
            <option key={tag} value={tag}>
              #{tag}
            </option>
          ))}
        </select>
      </div>

      {/* Clear Filters */}
      {(filters.folder !== 'all' || filters.type !== 'all' || filters.tag || filters.search) && (
        <div className="flex flex-col justify-end">
          <button
            onClick={() => onChange({ search: '', folder: 'all', type: 'all', tag: '' })}
            className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
          >
            Clear All
          </button>
        </div>
      )}
    </div>
  );
}