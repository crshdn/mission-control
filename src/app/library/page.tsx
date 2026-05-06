'use client';

import { useState, useEffect } from 'react';
import { MessageLibrary } from '@/components/library/MessageLibrary';

export default function LibraryPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">Message Library</h1>
        <p className="text-slate-600 mt-2">
          Save, organize, and manage research snippets, Vale reports, and reference materials
        </p>
      </div>
      
      <MessageLibrary />
    </div>
  );
}