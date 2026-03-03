'use client';

import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus the cancel button on mount and trap focus
  useEffect(() => {
    cancelRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
      onClick={onCancel}
    >
      <div
        className="bg-mc-bg-secondary border border-mc-border rounded-lg w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          {destructive && (
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-mc-accent-red/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-mc-accent-red" />
            </div>
          )}
          <div>
            <h3 id="confirm-title" className="text-base font-semibold text-mc-text">{title}</h3>
            <p id="confirm-message" className="text-sm text-mc-text-secondary mt-1">{message}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="min-h-11 px-4 py-2 text-sm text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary rounded"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`min-h-11 px-4 py-2 text-sm font-medium rounded ${
              destructive
                ? 'bg-mc-accent-red text-white hover:bg-mc-accent-red/90'
                : 'bg-mc-accent text-mc-bg hover:bg-mc-accent/90'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
