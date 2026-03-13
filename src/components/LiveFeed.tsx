'use client';

import {useState} from 'react';
import {ChevronRight, ChevronLeft, Clock} from 'lucide-react';
import {useMissionControl} from '@/lib/store';
import type {Event} from '@/lib/types';
import {formatDistanceToNow} from 'date-fns';
import {zhCN} from 'date-fns/locale';
import type {Locale} from 'date-fns';
import {useLocale, useTranslations} from 'next-intl';

type FeedFilter = 'all' | 'tasks' | 'agents';

interface LiveFeedProps {
  mobileMode?: boolean;
  isPortrait?: boolean;
}

export function LiveFeed({mobileMode = false, isPortrait = true}: LiveFeedProps) {
  const {events} = useMissionControl();
  const t = useTranslations('liveFeed');
  const locale = useLocale();
  const dateLocale = locale === 'zh' ? zhCN : undefined;
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [isMinimized, setIsMinimized] = useState(false);

  const effectiveMinimized = mobileMode ? false : isMinimized;
  const toggleMinimize = () => setIsMinimized(!isMinimized);

  const filteredEvents = events.filter((event) => {
    if (filter === 'all') return true;
    if (filter === 'tasks') return ['task_created', 'task_assigned', 'task_status_changed', 'task_completed'].includes(event.type);
    if (filter === 'agents') return ['agent_joined', 'agent_status_changed', 'message_sent'].includes(event.type);
    return true;
  });

  return (
    <aside
      className={`bg-mc-bg-secondary ${mobileMode ? 'border border-mc-border rounded-lg h-full' : 'border-l border-mc-border'} flex flex-col transition-all duration-300 ease-in-out ${
        effectiveMinimized ? 'w-12' : mobileMode ? 'w-full' : 'w-80'
      }`}
    >
      <div className="p-3 border-b border-mc-border">
        <div className="flex items-center">
          {!mobileMode && (
            <button
              onClick={toggleMinimize}
              className="p-1 rounded hover:bg-mc-bg-tertiary text-mc-text-secondary hover:text-mc-text transition-colors"
              aria-label={effectiveMinimized ? t('expand') : t('minimize') /* 展开/收起无障碍标签 / ARIA labels for expand/minimize */}
            >
              {effectiveMinimized ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          )}
          {!effectiveMinimized && (
            <span className="text-sm font-medium uppercase tracking-wider">
              {t('title') /* 实时事件流标题 / Live feed title */}
            </span>
          )}
        </div>

        {!effectiveMinimized && (
          <div className={`mt-3 ${mobileMode && isPortrait ? 'grid grid-cols-3 gap-2' : 'flex gap-1'}`}>
            {(['all', 'tasks', 'agents'] as FeedFilter[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`min-h-11 text-xs rounded uppercase ${mobileMode && isPortrait ? 'px-1' : 'px-3'} ${
                  filter === tab ? 'bg-mc-accent text-mc-bg font-medium' : 'text-mc-text-secondary hover:bg-mc-bg-tertiary'
                }`}
              >
                {tab === 'all'
                  ? t('tabAll') // 全部标签 / "All" tab label
                  : tab === 'tasks'
                  ? t('tabTasks') // 任务标签 / "Tasks" tab label
                  : t('tabAgents') // 智能体标签 / "Agents" tab label
                }
              </button>
            ))}
          </div>
        )}
      </div>

      {!effectiveMinimized && (
        <div className="flex-1 overflow-y-auto p-2 space-y-1 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          {filteredEvents.length === 0 ? (
            <div className="text-center py-8 text-mc-text-secondary text-sm">
              {t('empty') /* 暂无事件文案 / No events yet message */}
            </div>
          ) : (
            filteredEvents.map((event) => <EventItem key={event.id} event={event} dateLocale={dateLocale} />)
          )}
        </div>
      )}
    </aside>
  );
}

const STATUS_KEYS: Record<string, string> = {
  done: 'statusDone',
  review: 'statusReview',
  testing: 'statusTesting',
  in_progress: 'statusInProgress',
  assigned: 'statusAssigned',
  planning: 'statusPlanning',
  inbox: 'statusInbox',
};

function EventItem({ event, dateLocale }: { event: Event; dateLocale?: Locale }) {
  const t = useTranslations('liveFeed');

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'task_created':
        return '📋';
      case 'task_assigned':
        return '👤';
      case 'task_status_changed':
        return '🔄';
      case 'task_completed':
        return '✅';
      case 'message_sent':
        return '💬';
      case 'agent_joined':
        return '🎉';
      case 'agent_status_changed':
        return '🔔';
      case 'system':
        return '⚙️';
      default:
        return '📌';
    }
  };

  const displayMessage = (): string => {
    const msg = event.message;
    const movedMatch = msg.match(/Task "([^"]+)" moved to (\w+)/);
    if (movedMatch) {
      const [, title = '', status = ''] = movedMatch;
      const statusKey = STATUS_KEYS[status];
      const statusLabel = statusKey ? t(statusKey as any) : status;
      const out = t('taskMovedTo', { title, status: String(statusLabel) });
      if (out.startsWith('liveFeed.')) return msg;
      return out;
    }
    const dispatchedMatch = msg.match(/Task "([^"]+)" dispatched to (.+)/);
    if (dispatchedMatch) {
      const [, title = '', agent = ''] = dispatchedMatch;
      const out = t('taskDispatchedTo', { title, agent: String(agent).trim() });
      if (out.startsWith('liveFeed.')) return msg;
      return out;
    }
    const assignedMatch = msg.match(/"([^"]+)" assigned to (.+)/);
    if (assignedMatch) {
      const [, title = '', agent = ''] = assignedMatch;
      const out = t('taskAssignedTo', { title, agent: String(agent).trim() });
      if (out.startsWith('liveFeed.')) return msg;
      return out;
    }
    const joinedMatch = msg.match(/(.+)\s+joined the team\s*$/);
    if (joinedMatch) {
      const name = (joinedMatch[1] || '').trim();
      const out = t('agentJoinedTeam', { name });
      if (out.startsWith('liveFeed.')) return msg;
      return out;
    }
    const catalogMatch = msg.match(/^Agent catalog sync completed \(([^)]+)\)/);
    if (catalogMatch) {
      const rawReason = (catalogMatch[1] || '').trim();
      let reasonKey: string;
      switch (rawReason) {
        case 'scheduled':
          reasonKey = 'agentCatalogReasonScheduled';
          break;
        case 'startup':
          reasonKey = 'agentCatalogReasonStartup';
          break;
        case 'automatic':
        default:
          reasonKey = 'agentCatalogReasonAutomatic';
          break;
      }
      const reasonLabel = t(reasonKey as any);
      const out = t('agentCatalogSyncCompleted', { reason: String(reasonLabel) });
      if (out.startsWith('liveFeed.')) return msg;
      return out;
    }
    return msg;
  };

  const isTaskEvent = ['task_created', 'task_assigned', 'task_completed'].includes(event.type);
  const isHighlight = event.type === 'task_created' || event.type === 'task_completed';

  return (
    <div
      className={`p-2 rounded border-l-2 animate-slide-in ${
        isHighlight ? 'bg-mc-bg-tertiary border-mc-accent-pink' : 'bg-transparent border-transparent hover:bg-mc-bg-tertiary'
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="text-sm">{getEventIcon(event.type)}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${isTaskEvent ? 'text-mc-accent-pink' : 'text-mc-text'}`}>{displayMessage()}</p>
          <div className="flex items-center gap-1 mt-1 text-xs text-mc-text-secondary">
            <Clock className="w-3 h-3" />
            {formatDistanceToNow(new Date(event.created_at), { addSuffix: true, locale: dateLocale })}
          </div>
        </div>
      </div>
    </div>
  );
}
