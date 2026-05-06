'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  CheckSquare, 
  Users, 
  Activity, 
  AlertTriangle, 
  BookOpen, 
  BarChart3, 
  Calendar, 
  ChevronLeft,
  ChevronRight,
  Target,
  FolderKanban,
  Network,
  Scale,
  Wrench,
  Github,
  Inbox,
  Rocket,
  HeartPulse,
  Building2,
  MessageSquare,
  Cpu,
  Zap,
  Settings,
  TrendingUp,
  DollarSign,
  type LucideIcon
} from 'lucide-react';

interface SidebarProps {
  workspaceId: string;
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href?: string; // If present, navigate to URL instead of switching tab
}

const navigationItems: NavItem[] = [
  // Phase 1
  { id: 'tasks', label: 'Task Board', icon: CheckSquare },
  { id: 'agents', label: 'Agents', icon: Users },
  { id: 'sla', label: 'SLA Monitor', icon: BarChart3 },
  { id: 'cron', label: 'Cron Calendar', icon: Calendar },
  // Phase 2
  { id: 'qc', label: 'QC Process', icon: Activity },
  { id: 'api', label: 'API Monitor', icon: Activity },
  { id: 'bugs', label: 'Bug Reports', icon: AlertTriangle },
  { id: 'qa', label: 'QA Tracker', icon: Target },
  { id: 'docs', label: 'Docs Library', icon: BookOpen },
  { id: 'library', label: 'Message Library', icon: MessageSquare },
  // Phase 3
  { id: 'projects', label: 'Project Tracker', icon: FolderKanban },
  { id: 'team', label: 'Team Screen', icon: Network },
  { id: 'workload', label: 'Agent Workload', icon: Scale },
  { id: 'healing', label: 'Self-Healing', icon: Wrench },
  // Phase 4
  { id: 'github', label: 'GitHub', icon: Github },
  { id: 'unread', label: 'Unread/Pending', icon: Inbox },
  { id: 'deployments', label: 'Deployments', icon: Rocket },
  { id: 'tools-health', label: 'Tools Health', icon: HeartPulse },
  { id: 'local-models', label: 'Local Models', icon: Cpu },
  // Phase 5
  { id: 'office', label: 'Star Office', icon: Building2 },
  // Standalone pages
  { id: 'finance', label: 'Finance', icon: DollarSign, href: '/finance' },
  { id: 'growth', label: 'Growth', icon: TrendingUp, href: '/growth' },
  { id: 'launch', label: 'Launch Dashboard', icon: Zap, href: '/launch/atelier' },
  { id: 'settings', label: 'Settings', icon: Settings, href: '/settings' },
];

export function Sidebar({ workspaceId, activeTab, onTabChange }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <div className={`${isCollapsed ? 'w-16' : 'w-64'} bg-mc-bg-secondary border-r border-mc-border flex flex-col transition-all duration-200`}>
      {/* Sidebar Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-mc-border">
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-mc-accent-cyan" />
            <span className="font-semibold text-mc-text text-sm">NAVIGATION</span>
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 overflow-y-auto py-2">
        <div className="space-y-1 px-2">
          {navigationItems.map((item) => {
            const IconComponent = item.icon;
            const isActive = item.href 
              ? pathname === item.href 
              : activeTab === item.id;
            
            const className = `
              w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors
              ${isActive 
                ? 'bg-mc-accent text-mc-bg font-medium' 
                : 'text-mc-text hover:bg-mc-bg-tertiary hover:text-mc-accent'
              }
              ${isCollapsed ? 'justify-center' : ''}
            `;

            // If item has href, render as Link; otherwise render as button
            if (item.href) {
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={className}
                  title={isCollapsed ? item.label : undefined}
                >
                  <IconComponent className="w-5 h-5 flex-shrink-0" />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            }
            
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={className}
                title={isCollapsed ? item.label : undefined}
              >
                <IconComponent className="w-5 h-5 flex-shrink-0" />
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Sidebar Footer */}
      {!isCollapsed && (
        <div className="p-4 border-t border-mc-border">
          <div className="text-xs text-mc-text-secondary text-center">
            Mission Control v2.0
          </div>
        </div>
      )}
    </div>
  );
}