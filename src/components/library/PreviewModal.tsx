'use client';

import React, { useState } from 'react';
import { LibraryItemData } from './MessageLibrary';

interface PreviewModalProps {
  item: LibraryItemData;
  onClose: () => void;
  onUpdate: (itemId: string, updates: Partial<LibraryItemData>) => void;
}

export function PreviewModal({ item, onClose, onUpdate }: PreviewModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    title: item.title,
    content: item.content,
    tags: item.tags.join(', '),
    folder: item.folder,
    priority: item.priority,
    source: item.source,
    url: item.metadata.url || '',
  });

  const handleSave = () => {
    const tags = editData.tags
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    const updates: Partial<LibraryItemData> = {
      title: editData.title,
      content: editData.content,
      tags,
      folder: editData.folder,
      priority: editData.priority,
      source: editData.source,
      metadata: {
        ...item.metadata,
        url: editData.url || undefined,
      }
    };

    onUpdate(item.id, updates);
    setIsEditing(false);
  };

  const handleCopyToClipboard = async () => {
    await navigator.clipboard.writeText(item.content);
    // Could add toast notification
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

  const folderOptions = [
    { value: 'inbox', label: '📥 Inbox' },
    { value: 'research', label: '📊 Research' },
    { value: 'marketing', label: '📈 Marketing' },
    { value: 'reference', label: '📚 Reference' },
    { value: 'favorites', label: '⭐ Favorites' },
    { value: 'archive', label: '🗄️ Archive' },
  ];

  const priorityOptions = [
    { value: 'high', label: 'High Priority', color: 'text-red-600' },
    { value: 'normal', label: 'Normal', color: 'text-blue-600' },
    { value: 'low', label: 'Low Priority', color: 'text-gray-600' },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b bg-gray-50">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">{typeIcons[item.type]}</span>
            <div>
              {isEditing ? (
                <input
                  type="text"
                  className="text-xl font-semibold text-gray-900 border-none bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2"
                  value={editData.title}
                  onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                />
              ) : (
                <h2 className="text-xl font-semibold text-gray-900">{item.title}</h2>
              )}
              <div className="flex items-center space-x-2 mt-1">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityColors[item.priority]}`}>
                  {item.priority}
                </span>
                <span className="text-sm text-gray-500">
                  {item.metadata.wordCount} words
                </span>
                <span className="text-sm text-gray-500">
                  Updated {new Date(item.updatedAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopyToClipboard}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              title="Copy to clipboard"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            
            {isEditing ? (
              <>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditData({
                      title: item.title,
                      content: item.content,
                      tags: item.tags.join(', '),
                      folder: item.folder,
                      priority: item.priority,
                      source: item.source,
                      url: item.metadata.url || '',
                    });
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                title="Edit item"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
            
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            {/* Metadata */}
            {isEditing ? (
              <div className="grid grid-cols-3 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Folder</label>
                  <select
                    className="w-full px-3 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={editData.folder}
                    onChange={(e) => setEditData({ ...editData, folder: e.target.value })}
                  >
                    {folderOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select
                    className="w-full px-3 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={editData.priority}
                    onChange={(e) => setEditData({ ...editData, priority: e.target.value as LibraryItemData['priority'] })}
                  >
                    {priorityOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
                  <input
                    type="text"
                    className="w-full px-3 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={editData.source}
                    onChange={(e) => setEditData({ ...editData, source: e.target.value })}
                  />
                </div>
                
                {editData.url && (
                  <div className="col-span-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                    <input
                      type="url"
                      className="w-full px-3 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={editData.url}
                      onChange={(e) => setEditData({ ...editData, url: e.target.value })}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap gap-4 mb-6 text-sm text-gray-600">
                <span><strong>Folder:</strong> {item.folder}</span>
                <span><strong>Source:</strong> {item.source}</span>
                {item.metadata.url && (
                  <a 
                    href={item.metadata.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <strong>URL:</strong> {item.metadata.url}
                  </a>
                )}
              </div>
            )}

            {/* Content */}
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-3">Content</h3>
              {isEditing ? (
                <textarea
                  className="w-full h-64 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={editData.content}
                  onChange={(e) => setEditData({ ...editData, content: e.target.value })}
                />
              ) : (
                <div className="bg-gray-50 rounded-lg p-4 whitespace-pre-wrap text-sm leading-relaxed">
                  {item.content}
                </div>
              )}
            </div>

            {/* Tags */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-3">Tags</h3>
              {isEditing ? (
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={editData.tags}
                  onChange={(e) => setEditData({ ...editData, tags: e.target.value })}
                  placeholder="comma-separated tags"
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {item.tags.length > 0 ? item.tags.map(tag => (
                    <span key={tag} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                      #{tag}
                    </span>
                  )) : (
                    <span className="text-gray-500 italic">No tags</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}