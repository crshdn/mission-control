'use client';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {icon && <div className="text-3xl mb-3">{icon}</div>}
      <h3 className="text-sm font-medium text-mc-text mb-1">{title}</h3>
      {description && <p className="text-xs text-mc-text-secondary max-w-xs">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-4 min-h-11 bg-mc-accent text-mc-bg rounded text-sm font-medium hover:bg-mc-accent/90"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
