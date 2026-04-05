'use client';

interface SubtaskNode {
  id: string;
  task_id: string;
  title: string;
  status: string;
  depends_on?: string[];
}

interface DependencyGraphProps {
  subtasks: SubtaskNode[];
}

const statusColors: Record<string, string> = {
  inbox: 'border-gray-500 bg-gray-500/10 text-gray-300',
  assigned: 'border-yellow-500 bg-yellow-500/10 text-yellow-300',
  in_progress: 'border-blue-500 bg-blue-500/10 text-blue-300',
  testing: 'border-cyan-500 bg-cyan-500/10 text-cyan-300',
  review: 'border-purple-500 bg-purple-500/10 text-purple-300',
  verification: 'border-orange-500 bg-orange-500/10 text-orange-300',
  done: 'border-green-500 bg-green-500/10 text-green-300',
};

/**
 * Simple dependency graph visualization.
 * Shows nodes arranged in layers based on dependency depth.
 */
export function DependencyGraph({ subtasks }: DependencyGraphProps) {
  if (subtasks.length === 0) return null;

  // Build layers via topological sort by depth
  const taskIdToNode = new Map(subtasks.map(st => [st.task_id, st]));
  const depths = new Map<string, number>();

  function getDepth(taskId: string, visited = new Set<string>()): number {
    if (depths.has(taskId)) return depths.get(taskId)!;
    if (visited.has(taskId)) return 0; // circular ref guard
    visited.add(taskId);

    const node = taskIdToNode.get(taskId);
    if (!node || !node.depends_on || node.depends_on.length === 0) {
      depths.set(taskId, 0);
      return 0;
    }

    const maxParentDepth = Math.max(
      ...node.depends_on.map(depId => getDepth(depId, visited))
    );
    const depth = maxParentDepth + 1;
    depths.set(taskId, depth);
    return depth;
  }

  subtasks.forEach(st => getDepth(st.task_id));

  // Group by layer
  const maxDepth = Math.max(...Array.from(depths.values()), 0);
  const layers: SubtaskNode[][] = [];
  for (let d = 0; d <= maxDepth; d++) {
    layers.push(subtasks.filter(st => (depths.get(st.task_id) || 0) === d));
  }

  // Check if there are any dependencies at all
  const hasDeps = subtasks.some(st => st.depends_on && st.depends_on.length > 0);
  if (!hasDeps) return null; // Don't show graph if no dependencies

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-medium uppercase text-mc-text-secondary">Dependency Graph</h4>
      <div className="space-y-4">
        {layers.map((layer, layerIdx) => (
          <div key={layerIdx}>
            {layerIdx > 0 && (
              <div className="flex justify-center py-1">
                <div className="w-px h-4 bg-mc-border" />
              </div>
            )}
            <div className="flex flex-wrap gap-2 justify-center">
              {layer.map(node => (
                <div
                  key={node.task_id}
                  className={`px-3 py-2 rounded-lg border text-xs font-medium max-w-[200px] truncate ${statusColors[node.status] || statusColors.inbox}`}
                  title={`${node.title} (${node.status})`}
                >
                  {node.title}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 text-[10px] text-mc-text-secondary pt-2">
        <span>Top = no dependencies</span>
        <span>Bottom = depends on above</span>
      </div>
    </div>
  );
}
