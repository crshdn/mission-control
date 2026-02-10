export function SkeletonCard() {
  return (
    <div className="rounded-lg border border-mc-border bg-mc-bg-secondary p-4 space-y-3">
      <div className="h-4 w-3/4 rounded bg-mc-bg-tertiary animate-skeleton" />
      <div className="h-3 w-1/2 rounded bg-mc-bg-tertiary animate-skeleton" />
      <div className="h-3 w-5/6 rounded bg-mc-bg-tertiary animate-skeleton" />
    </div>
  );
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded border border-mc-border bg-mc-bg-secondary">
          <div className="w-3 h-3 rounded-full bg-mc-bg-tertiary animate-skeleton shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-2/3 rounded bg-mc-bg-tertiary animate-skeleton" />
            <div className="h-2.5 w-1/3 rounded bg-mc-bg-tertiary animate-skeleton" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonTimeline({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="w-3 h-3 rounded-full bg-mc-bg-tertiary animate-skeleton" />
            {i < rows - 1 && <div className="w-px flex-1 bg-mc-border mt-1" />}
          </div>
          <div className="flex-1 pb-4 space-y-1.5">
            <div className="h-2.5 w-24 rounded bg-mc-bg-tertiary animate-skeleton" />
            <div className="h-3 w-full rounded bg-mc-bg-tertiary animate-skeleton" />
            <div className="h-3 w-3/4 rounded bg-mc-bg-tertiary animate-skeleton" />
          </div>
        </div>
      ))}
    </div>
  );
}
