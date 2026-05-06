'use client';

import { CronCalendar } from '@/components/CronCalendar';

export default function CronPage() {
  return (
    <div className="p-6">
      <CronCalendar workspaceId="default" />
    </div>
  );
}
