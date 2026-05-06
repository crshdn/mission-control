'use client';

import { QATracker } from '@/components/QATracker';

export default function QAPage() {
  return (
    <div className="p-6">
      <QATracker workspaceId="default" />
    </div>
  );
}