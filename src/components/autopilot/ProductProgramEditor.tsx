'use client';


import { logger } from '@/lib/logger';
import { useState } from 'react';
import { Save } from 'lucide-react';
import type { Product } from '@/lib/types';

interface ProductProgramEditorProps {
  product: Product;
  onSave: (product: Product) => void;
}

export function ProductProgramEditor({ product, onSave }: ProductProgramEditorProps) {
  const [program, setProgram] = useState(product.product_program || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_program: program }),
      });
      if (res.ok) {
        const updated = await res.json();
        onSave(updated);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (error) {
      logger.error('Failed to save program:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-mc-text">Product Program</h3>
        <button
          onClick={handleSave}
          disabled={saving}
          className="min-h-11 px-4 rounded-lg bg-mc-accent text-white hover:bg-mc-accent/90 disabled:opacity-50 flex items-center gap-2 text-sm"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
        </button>
      </div>
      <textarea
        value={program}
        onChange={e => setProgram(e.target.value)}
        className="w-full bg-mc-bg-tertiary border border-mc-border rounded-lg px-4 py-3 text-mc-text font-mono text-sm focus:outline-none focus:border-mc-accent resize-none min-h-[600px]"
        placeholder="Write your product program here..."
      />
    </div>
  );
}
