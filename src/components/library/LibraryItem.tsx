'use client';

import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { LibraryItemData } from './MessageLibrary';

interface LibraryItemProps {
  item: LibraryItemData;
  viewMode: 'grid' | 'list';
  isDragging?: boolean;
  onPreview: (item: LibraryItemData) => void;
  onUpdate: (itemId: string, updates: Partial<LibraryItemData>) => void;
  onDelete: (itemId: string) => void;
}

export function LibraryItem({ 
  item, 
  viewMode, 
  isDragging = false, 
  onPreview, 
  onUpdate, 
  onDelete 
}: LibraryItemProps) {
  const [showActions, setShowActions] = useState(false);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.5 : 1,
  };

  const typeIcons: Record<string, string> = {
    'research': '📊',
    'marketing': '📈',
    'reference': '📚',
    'chat-message': '💬',
    'url': '🔗',
    'note': '📝'
  };

  const priorityColors = {
    high: 'bg-red-100 text-red-800',
    normal: 'bg-blue-100 text-blue-800',
    low: 'bg-gray-100 text-gray-800'
  };

  const handleCopyToClipboard = async () => {
    await navigator.clipboard.writeText(item.content);
    // Could add a toast notification here
  };

  const handleTogglePriority = () => {
    const priorities = ['low', 'normal', 'high'] as const;
    const currentIndex = priorities.indexOf(item.priority);
    const nextPriority = priorities[(currentIndex + 1) % priorities.length];
    onUpdate(item.id, { priority: nextPriority });
  };

  const handleMoveToFolder = (folder: string) => {
    onUpdate(item.id, { folder });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    if (diffInMinutes < 10080) return `${Math.floor(diffInMinutes / 1440)}d ago`;
    
    return date.toLocaleDateString();
  };

  const baseClasses = `
    bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 
    cursor-pointer group relative
    ${isDragging ? 'rotate-2 scale-105 shadow-xl z-50' : ''}
  `;

  const gridClasses = viewMode === 'grid' 
    ? `${baseClasses} p-4 h-48 flex flex-col`
    : `${baseClasses} p-3 flex items-center space-x-4`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={gridClasses}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onClick={() => onPreview(item)}
      {...attributes}
    >
      {/* Drag Handle */}
      <div 
        className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
        {...listeners}
      >
        <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
          <path d="M7 2a2 2 0 1 1 .001 4.001A2 2 0 0 1 7 2zM7 8a2 2 0 1 1 .001 4.001A2 2 0 0 1 7 8zM7 14a2 2 0 1 1 .001 4.001A2 2 0 0 1 7 14zM13 2a2 2 0 1 1 .001 4.001A2 2 0 0 1 13 2zM13 8a2 2 0 1 1 .001 4.001A2 2 0 0 1 13 8zM13 14a2 2 0 1 1 .001 4.001A2 2 0 0 1 13 14z" />
        </svg>
      </div>

      {/* Actions Menu */}
      {showActions && (
        <div className="absolute top-2 right-2 flex space-x-1 bg-white rounded shadow-lg p-1 z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopyToClipboard();
            }}
            className="p-1 hover:bg-gray-100 rounded text-gray-600 hover:text-gray-900"
            title="Copy to clipboard"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleTogglePriority();
            }}
            className="p-1 hover:bg-gray-100 rounded text-gray-600 hover:text-gray-900"
            title="Toggle priority"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item.id);
            }}
            className="p-1 hover:bg-red-100 rounded text-red-600 hover:text-red-900"
            title="Delete item"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      )}

      {viewMode === 'grid' ? (
        // Grid Layout
        <>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <span className="text-lg">{typeIcons[item.type]}</span>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityColors[item.priority]}`}>
                {item.priority}
              </span>
            </div>
          </div>
          
          <div className="flex-1 mb-3">
            <h3 className="font-medium text-gray-900 text-sm mb-1 line-clamp-2">
              {item.title}
            </h3>
            <p className="text-gray-600 text-xs line-clamp-3">
              {item.metadata.preview || item.content}
            </p>
          </div>
          
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{item.folder}</span>
            <span>{formatDate(item.updatedAt)}</span>
          </div>
          
          {item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {item.tags.slice(0, 3).map(tag => (
                <span key={tag} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                  #{tag}
                </span>
              ))}
              {item.tags.length > 3 && (
                <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                  +{item.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </>
      ) : (
        // List Layout
        <>
          <div className="flex items-center space-x-3 flex-1">
            <span className="text-lg">{typeIcons[item.type]}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-1">
                <h3 className="font-medium text-gray-900 text-sm truncate">
                  {item.title}
                </h3>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityColors[item.priority]}`}>
                  {item.priority}
                </span>
              </div>
              <p className="text-gray-600 text-xs truncate">
                {item.metadata.preview || item.content}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4 text-xs text-gray-500">
            <span>{item.folder}</span>
            <span>{formatDate(item.updatedAt)}</span>
            <span>{item.metadata.wordCount} words</span>
          </div>
        </>
      )}
    </div>
  );
}