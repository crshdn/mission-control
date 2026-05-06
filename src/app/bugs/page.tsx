'use client';

import { BugReports } from '@/components/BugReports';

export default function BugsPage() {
  return (
    <div className="p-6">
      <BugReports workspaceId="default" />
    </div>
  );
}
