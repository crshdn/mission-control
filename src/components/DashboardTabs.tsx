'use client';

import { useState } from 'react';
import { CheckSquare, Activity, AlertTriangle, BookOpen, Server, Monitor, MessageSquare } from 'lucide-react';
import { MissionQueue } from './MissionQueue';
import { QCDashboard } from './QCDashboard';
import { APIMonitor } from './APIMonitor';
import { BugReports } from './BugReports';
import { DocsLibrary } from './DocsLibrary';
import { ToolsHealthMonitor } from './ToolsHealthMonitor';
import { OfficeVisualization } from './OfficeVisualization';
import { MessageLibraryWrapper } from './MessageLibraryWrapper';
import { QATracker } from './QATracker';

interface DashboardTabsProps {
  workspaceId: string;
}

const tabs = [
  { id: 'tasks', label: 'Tasks', icon: CheckSquare, component: MissionQueue },
  { id: 'qc', label: 'QC Process', icon: Activity, component: QCDashboard },
  { id: 'api', label: 'API Monitor', icon: Activity, component: APIMonitor },
  { id: 'tools-health', label: 'Tools Health', icon: Server, component: ToolsHealthMonitor },
  { id: 'bugs', label: 'Bug Reports', icon: AlertTriangle, component: BugReports },
  { id: 'qa', label: 'QA Tracker', icon: Activity, component: QATracker },
  { id: 'docs', label: 'Docs Library', icon: BookOpen, component: DocsLibrary },
  { id: 'library', label: 'Message Library', icon: MessageSquare, component: MessageLibraryWrapper },
  { id: 'office', label: 'Office View', icon: Monitor, component: OfficeVisualization },
];

export function DashboardTabs({ workspaceId }: DashboardTabsProps) {
  const [activeTab, setActiveTab] = useState('tasks');

  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component || MissionQueue;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Tab Navigation */}
      <div className="border-b border-mc-border bg-mc-bg-secondary">
        <div className="flex">
          {tabs.map((tab) => {
            const IconComponent = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors
                  border-b-2 min-w-0
                  ${activeTab === tab.id
                    ? 'border-mc-accent text-mc-accent bg-mc-bg'
                    : 'border-transparent text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary'
                  }
                `}
              >
                <IconComponent className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        <ActiveComponent workspaceId={workspaceId} />
      </div>
    </div>
  );
}