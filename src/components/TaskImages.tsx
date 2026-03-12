'use client';

import { useState, useEffect, useRef } from 'react';
import { ImagePlus, X, Loader2 } from 'lucide-react';
import type { TaskImage } from '@/lib/types';

interface TaskImagesProps {
  taskId: string;
}

export function TaskImages({ taskId }: TaskImagesProps) {
  const [images, setImages] = useState<TaskImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/tasks/${taskId}/images`)
      .then(res => res.json())
      .then(data => setImages(data.images || []))
      .catch(() => setError('Failed to load images'));
  }, [taskId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/tasks/${taskId}/images`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Upload failed');
        return;
      }

      const data = await res.json();
      setImages(prev => [...prev, data.image]);
    } catch {
      setError('Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (filename: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/images`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });

      if (res.ok) {
        setImages(prev => prev.filter(img => img.filename !== filename));
      }
    } catch {
      setError('Failed to delete image');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-mc-text-secondary">
          Images {images.length > 0 && `(${images.length})`}
        </h3>
        <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-mc-accent hover:bg-mc-accent/10 rounded cursor-pointer transition-colors">
          {uploading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <ImagePlus className="w-3.5 h-3.5" />
          )}
          {uploading ? 'Uploading...' : 'Add Image'}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {images.length === 0 && !error && (
        <p className="text-xs text-mc-text-secondary">
          No images attached. Add screenshots, mockups, or reference images.
        </p>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {images.map((img) => (
            <div key={img.filename} className="group relative rounded-lg overflow-hidden border border-mc-border bg-mc-bg">
              <img
                src={`/api/task-images/${taskId}/${img.filename}`}
                alt={img.original_name}
                className="w-full h-32 object-cover"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                <button
                  onClick={() => handleDelete(img.filename)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 bg-red-500/80 hover:bg-red-500 rounded-full"
                >
                  <X className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
              <div className="px-2 py-1">
                <p className="text-xs text-mc-text-secondary truncate" title={img.original_name}>
                  {img.original_name}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
