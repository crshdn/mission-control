'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AgentActivityDashboard } from '@/components/AgentActivityDashboard';
import type { Workspace } from '@/lib/types';

export default function WorkspaceActivityPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  useEffect(() => {
    async function loadWorkspace() {
      try {
        const res = await fetch(`/api/workspaces/${slug}`);
        if (res.ok) {
          setWorkspace(await res.json());
        }
      } catch (error) {
        console.error('Failed to load workspace for activity page:', error);
      }
    }

    loadWorkspace();
  }, [slug]);

  return <AgentActivityDashboard workspace={workspace} />;
}
