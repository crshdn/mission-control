'use client';

import React from 'react';
import { LibraryItem } from './LibraryItem';
import { LibraryItemData } from './MessageLibrary';

interface LibraryGridProps {
  items: LibraryItemData[];
  viewMode: 'grid' | 'list';
  onPreview: (item: LibraryItemData) => void;
  onUpdate: (itemId: string, updates: Partial<LibraryItemData>) => void;
  onDelete: (itemId: string) => void;
}

export function LibraryGrid({ 
  items, 
  viewMode, 
  onPreview, 
  onUpdate, 
  onDelete 
}: LibraryGridProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 mb-4">
          <svg
            className="mx-auto h-12 w-12"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No items found</h3>
        <p className="text-gray-500">
          Start building your library by adding research snippets, Vale reports, or reference materials.
        </p>
      </div>
    );
  }

  const gridClasses = viewMode === 'grid' 
    ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
    : "space-y-3";

  return (
    <div className={gridClasses}>
      {items.map((item) => (
        <LibraryItem
          key={item.id}
          item={item}
          viewMode={viewMode}
          onPreview={onPreview}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}