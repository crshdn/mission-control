'use client';

import { X } from 'lucide-react';
import { useToastStore, type ToastType } from '@/lib/toast-store';

const typeStyles: Record<ToastType, string> = {
  success: 'border-mc-accent-green bg-mc-accent-green/10 text-mc-accent-green',
  error: 'border-mc-accent-red bg-mc-accent-red/10 text-mc-accent-red',
  info: 'border-mc-accent bg-mc-accent/10 text-mc-accent',
  warning: 'border-mc-accent-yellow bg-mc-accent-yellow/10 text-mc-accent-yellow',
};

const typeIcons: Record<ToastType, string> = {
  success: '\u2713',
  error: '\u2717',
  info: '\u2139',
  warning: '\u26A0',
};

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-lg border backdrop-blur-sm animate-slide-in ${typeStyles[t.type]}`}
          role="alert"
        >
          <span className="text-sm font-bold flex-shrink-0">{typeIcons[t.type]}</span>
          <p className="text-sm flex-1 text-mc-text">{t.message}</p>
          <button
            onClick={() => removeToast(t.id)}
            className="flex-shrink-0 p-0.5 rounded hover:bg-mc-bg-tertiary"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
