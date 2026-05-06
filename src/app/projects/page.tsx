'use client';

import { ProjectTracker } from '@/components/ProjectTracker';

export default function ProjectsPage() {
  return (
    <div className="p-6">
      <ProjectTracker workspaceId="default" />
    </div>
  );
}
