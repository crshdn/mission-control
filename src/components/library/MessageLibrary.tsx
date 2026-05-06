'use client';

import React, { useState, useEffect } from 'react';
import { 
  DndContext, 
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { LibrarySearch } from './LibrarySearch';
import { LibraryFilters } from './LibraryFilters';
import { LibraryGrid } from './LibraryGrid';
import { LibraryItem } from './LibraryItem';
import { AddItemModal } from './AddItemModal';
import { PreviewModal } from './PreviewModal';

export interface LibraryItemData {
  id: string;
  title: string;
  content: string;
  type: 'research' | 'marketing' | 'reference' | 'chat-message' | 'url' | 'note';
  source: string;
  tags: string[];
  folder: string;
  createdAt: string;
  updatedAt: string;
  priority: 'high' | 'normal' | 'low';
  status: 'active' | 'archived';
  metadata: {
    url?: string;
    chatId?: string;
    messageId?: string;
    agentId?: string;
    wordCount?: number;
    preview?: string;
  };
}

export interface LibraryFilters {
  search: string;
  folder: string;
  type: string;
  tag: string;
}

export function MessageLibrary() {
  const [items, setItems] = useState<LibraryItemData[]>([]);
  const [filteredItems, setFilteredItems] = useState<LibraryItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<LibraryFilters>({
    search: '',
    folder: 'all',
    type: 'all',
    tag: ''
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [previewItem, setPreviewItem] = useState<LibraryItemData | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'created' | 'updated' | 'title' | 'priority'>('updated');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Load items on component mount
  useEffect(() => {
    loadItems();
  }, []);

  // Filter items whenever filters change
  useEffect(() => {
    applyFilters();
  }, [items, filters, sortBy]);

  const loadItems = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/library');
      if (response.ok) {
        const data = await response.json();
        setItems(data);
      }
    } catch (error) {
      console.error('Error loading library items:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...items];

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(item => 
        item.title.toLowerCase().includes(searchLower) ||
        item.content.toLowerCase().includes(searchLower) ||
        item.tags.some(tag => tag.toLowerCase().includes(searchLower))
      );
    }

    // Folder filter
    if (filters.folder && filters.folder !== 'all') {
      filtered = filtered.filter(item => item.folder === filters.folder);
    }

    // Type filter
    if (filters.type && filters.type !== 'all') {
      filtered = filtered.filter(item => item.type === filters.type);
    }

    // Tag filter
    if (filters.tag) {
      filtered = filtered.filter(item => item.tags.includes(filters.tag));
    }

    // Sort items
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'created':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'updated':
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case 'title':
          return a.title.localeCompare(b.title);
        case 'priority':
          const priorityOrder = { high: 3, normal: 2, low: 1 };
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        default:
          return 0;
      }
    });

    setFilteredItems(filtered);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (active.id !== over?.id) {
      setFilteredItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over?.id);

        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleAddItem = async (newItem: Partial<LibraryItemData>) => {
    try {
      const response = await fetch('/api/library', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newItem),
      });

      if (response.ok) {
        const createdItem = await response.json();
        setItems(prev => [...prev, createdItem]);
        setShowAddModal(false);
      }
    } catch (error) {
      console.error('Error adding item:', error);
    }
  };

  const handleUpdateItem = async (itemId: string, updates: Partial<LibraryItemData>) => {
    try {
      const response = await fetch(`/api/library/${itemId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        const updatedItem = await response.json();
        setItems(prev => prev.map(item => 
          item.id === itemId ? updatedItem : item
        ));
      }
    } catch (error) {
      console.error('Error updating item:', error);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      const response = await fetch(`/api/library/${itemId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setItems(prev => prev.filter(item => item.id !== itemId));
      }
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  };

  const activeItem = filteredItems.find(item => item.id === activeId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Add Item
          </button>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded ${viewMode === 'grid' ? 'bg-blue-100 text-blue-600' : 'text-gray-600'}`}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path>
              </svg>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded ${viewMode === 'list' ? 'bg-blue-100 text-blue-600' : 'text-gray-600'}`}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 8a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 12a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 16a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"></path>
              </svg>
            </button>
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-1 border border-gray-300 rounded-md text-sm"
          >
            <option value="updated">Recently Updated</option>
            <option value="created">Recently Created</option>
            <option value="title">Title A-Z</option>
            <option value="priority">Priority</option>
          </select>
        </div>
        
        <div className="text-sm text-gray-500">
          {filteredItems.length} of {items.length} items
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1">
          <LibrarySearch
            value={filters.search}
            onChange={(search) => setFilters(prev => ({ ...prev, search }))}
          />
        </div>
        <div className="flex-shrink-0">
          <LibraryFilters
            filters={filters}
            onChange={setFilters}
            items={items}
          />
        </div>
      </div>

      {/* Library Items */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={filteredItems.map(item => item.id)} strategy={verticalListSortingStrategy}>
          <LibraryGrid
            items={filteredItems}
            viewMode={viewMode}
            onPreview={setPreviewItem}
            onUpdate={handleUpdateItem}
            onDelete={handleDeleteItem}
          />
        </SortableContext>

        <DragOverlay>
          {activeItem ? (
            <LibraryItem
              item={activeItem}
              isDragging
              viewMode={viewMode}
              onPreview={setPreviewItem}
              onUpdate={handleUpdateItem}
              onDelete={handleDeleteItem}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Modals */}
      {showAddModal && (
        <AddItemModal
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddItem}
        />
      )}

      {previewItem && (
        <PreviewModal
          item={previewItem}
          onClose={() => setPreviewItem(null)}
          onUpdate={handleUpdateItem}
        />
      )}
    </div>
  );
}