'use client';

import React, { useState } from 'react';
import { LibraryItemData } from './MessageLibrary';

interface AddItemModalProps {
  onClose: () => void;
  onAdd: (item: Partial<LibraryItemData>) => void;
}

export function AddItemModal({ onClose, onAdd }: AddItemModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    type: 'note' as LibraryItemData['type'],
    source: '',
    tags: '',
    folder: 'inbox',
    priority: 'normal' as LibraryItemData['priority'],
    url: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const tags = formData.tags
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    const newItem: Partial<LibraryItemData> = {
      title: formData.title,
      content: formData.content,
      type: formData.type,
      source: formData.source || 'manual',
      tags,
      folder: formData.folder,
      priority: formData.priority,
      status: 'active',
      metadata: {
        url: formData.url || undefined,
      }
    };

    onAdd(newItem);
  };

  const typeOptions = [
    { value: 'note', label: '📝 Note', description: 'General note or snippet' },
    { value: 'research', label: '📊 Research', description: 'Vale report or research finding' },
    { value: 'marketing', label: '📈 Marketing', description: 'Marketing insight or content' },
    { value: 'reference', label: '📚 Reference', description: 'Reference material' },
    { value: 'chat-message', label: '💬 Chat Message', description: 'Saved chat conversation' },
    { value: 'url', label: '🔗 URL', description: 'Web link or article' },
  ];

  const folderOptions = [
    { value: 'inbox', label: '📥 Inbox' },
    { value: 'research', label: '📊 Research' },
    { value: 'marketing', label: '📈 Marketing' },
    { value: 'reference', label: '📚 Reference' },
    { value: 'favorites', label: '⭐ Favorites' },
  ];

  const priorityOptions = [
    { value: 'high', label: 'High Priority', color: 'text-red-600' },
    { value: 'normal', label: 'Normal', color: 'text-blue-600' },
    { value: 'low', label: 'Low Priority', color: 'text-gray-600' },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Add Library Item</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Enter a descriptive title"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as LibraryItemData['type'] })}
            >
              {typeOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label} - {option.description}
                </option>
              ))}
            </select>
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Content <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              rows={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="Paste your research snippet, notes, or content here..."
            />
          </div>

          {/* Source and URL */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Source</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                placeholder="e.g., Vale Report, Discord Chat"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">URL (optional)</label>
              <input
                type="url"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="https://..."
              />
            </div>
          </div>

          {/* Folder and Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Folder</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.folder}
                onChange={(e) => setFormData({ ...formData, folder: e.target.value })}
              >
                {folderOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value as LibraryItemData['priority'] })}
              >
                {priorityOptions.map(option => (
                  <option key={option.value} value={option.value} className={option.color}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tags
              <span className="text-gray-500 text-sm ml-2">(comma-separated)</span>
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              placeholder="e.g., market-research, competitors, q1-2024"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-6 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Add to Library
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}